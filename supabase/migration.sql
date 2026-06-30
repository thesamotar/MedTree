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
-- STEP 2: Row Level Security Policies
-- ============================================================

-- medical_records: Read own, or read records of active connections
CREATE POLICY "Read own or connected records" ON medical_records
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM relationships
      WHERE status = 'active'
      AND (
        (requester_id = auth.uid() AND receiver_id = user_id)
        OR (receiver_id = auth.uid() AND requester_id = user_id)
      )
    )
  );

CREATE POLICY "Manage own records" ON medical_records
  FOR ALL USING (auth.uid() = user_id);

-- relationships
CREATE POLICY "View own relationships" ON relationships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Create relationships" ON relationships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Update/Delete own relationships" ON relationships
  FOR ALL USING (auth.uid() = requester_id OR auth.uid() = receiver_id);


-- ============================================================
-- STEP 3: Indexes
-- ============================================================
CREATE INDEX idx_profiles_id ON profiles(id);
CREATE INDEX idx_medical_records_user ON medical_records(user_id);
CREATE INDEX idx_relationships_req ON relationships(requester_id);
CREATE INDEX idx_relationships_rec ON relationships(receiver_id);
