-- MedTree Supabase v3 Schema Migration (Full Reset)
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- ============================================================
-- STEP 0: FULL CLEANUP — Drop all old tables and auth users
-- ============================================================

-- Drop v3 tables if they exist (in dependency order)
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS medical_records CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop legacy v2 table
DROP TABLE IF EXISTS medical_entries CASCADE;

-- Delete ALL existing auth users (wipes sessions, identities, etc.)
DELETE FROM auth.users;

-- ============================================================
-- STEP 1: Create fresh tables
-- ============================================================

-- 1. Profiles Table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);


-- 2. Medical Records Table (Self-owned history only)
CREATE TABLE medical_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('condition', 'medication')),
  name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;


-- 3. Relationships Table (Consensual links)
CREATE TABLE relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('Parent-Child', 'Roommate', 'Sibling-Sibling', 'Spouse')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, receiver_id, relationship_type)
);

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 2: Helper Function for transitive connection lookups
-- ============================================================
-- SECURITY DEFINER bypasses RLS inside the function, avoiding infinite recursion
-- when the relationships table's SELECT policy references itself.

CREATE OR REPLACE FUNCTION get_direct_connection_ids(check_uid UUID)
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(array_agg(
    CASE 
      WHEN requester_id = check_uid THEN receiver_id
      ELSE requester_id
    END
  ), '{}')
  FROM relationships
  WHERE status = 'active'
  AND (requester_id = check_uid OR receiver_id = check_uid);
$$;


-- ============================================================
-- STEP 3: Row Level Security Policies
-- ============================================================

-- medical_records: Read own, or read records of connections (up to 2 hops)
CREATE POLICY "Read own or connected records" ON medical_records
  FOR SELECT USING (
    auth.uid() = user_id
    -- 1-hop: direct connection
    OR user_id = ANY(get_direct_connection_ids(auth.uid()))
    -- 2-hop: connection of a connection (e.g. Abhishek -> Mamata -> Nani)
    OR user_id = ANY(
      SELECT unnest(get_direct_connection_ids(conn_id))
      FROM unnest(get_direct_connection_ids(auth.uid())) AS conn_id
    )
  );

CREATE POLICY "Manage own records" ON medical_records
  FOR ALL USING (auth.uid() = user_id);

-- relationships: View own, or if either participant is a direct connection
CREATE POLICY "View own relationships" ON relationships
  FOR SELECT USING (
    auth.uid() = requester_id 
    OR auth.uid() = receiver_id
    -- 2-hop: can see a relationship if either participant is my direct connection
    OR requester_id = ANY(get_direct_connection_ids(auth.uid()))
    OR receiver_id = ANY(get_direct_connection_ids(auth.uid()))
  );

CREATE POLICY "Create relationships" ON relationships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Delete own relationships" ON relationships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Update own relationships" ON relationships
  FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);


-- ============================================================
-- STEP 4: Indexes
-- ============================================================
CREATE INDEX idx_profiles_id ON profiles(id);
CREATE INDEX idx_medical_records_user ON medical_records(user_id);
CREATE INDEX idx_relationships_req ON relationships(requester_id);
CREATE INDEX idx_relationships_rec ON relationships(receiver_id);
