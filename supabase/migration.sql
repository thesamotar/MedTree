-- MedTree Supabase v3 Schema Migration (Full Reset)
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- ============================================================
-- STEP 0: FULL CLEANUP — Drop all old tables and auth users
-- ============================================================

-- Drop v3 tables if they exist (in dependency order)
DROP TABLE IF EXISTS semantic_facts CASCADE;
DROP TABLE IF EXISTS clinical_notes CASCADE;
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
  source_note_id INT DEFAULT NULL,
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


-- 4. Clinical Notes Table
CREATE TABLE clinical_notes (
  id SERIAL PRIMARY KEY,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  note_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;


-- 5. Semantic Facts Table
CREATE TABLE semantic_facts (
  id SERIAL PRIMARY KEY,
  note_id INT REFERENCES clinical_notes(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fact_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE semantic_facts ENABLE ROW LEVEL SECURITY;

-- Add FK for source_note_id now that clinical_notes exists
ALTER TABLE medical_records
  ADD CONSTRAINT fk_source_note
  FOREIGN KEY (source_note_id) REFERENCES clinical_notes(id) ON DELETE CASCADE;


-- ============================================================
-- STEP 2: Helper Function for transitive connection lookups
-- ============================================================
-- SECURITY DEFINER bypasses RLS inside the function, avoiding infinite recursion.
-- Uses a recursive Common Table Expression (CTE) to find all connected users at any hop depth.

CREATE OR REPLACE FUNCTION get_all_connected_profile_ids(start_uid UUID)
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH RECURSIVE family_tree AS (
    -- Anchor member
    SELECT start_uid AS member_id
    UNION
    -- Follow active relationships recursively
    SELECT 
      CASE 
        WHEN r.requester_id = ft.member_id THEN r.receiver_id
        ELSE r.requester_id
      END
    FROM relationships r
    INNER JOIN family_tree ft ON (r.requester_id = ft.member_id OR r.receiver_id = ft.member_id)
    WHERE r.status = 'active'
  )
  SELECT COALESCE(array_agg(member_id), '{}') FROM family_tree;
$$;


-- ============================================================
-- STEP 3: Row Level Security Policies
-- ============================================================

-- medical_records: Read own, or read records of any connected profiles in the network (genuine multi-hop)
CREATE POLICY "Read own or connected records" ON medical_records
  FOR SELECT USING (
    auth.uid() = user_id
    OR user_id = ANY(get_all_connected_profile_ids(auth.uid()))
  );

CREATE POLICY "Manage own records" ON medical_records
  FOR ALL USING (auth.uid() = user_id);

-- relationships: View own, or if either participant is part of the connected component
CREATE POLICY "View own relationships" ON relationships
  FOR SELECT USING (
    auth.uid() = requester_id 
    OR auth.uid() = receiver_id
    OR requester_id = ANY(get_all_connected_profile_ids(auth.uid()))
    OR receiver_id = ANY(get_all_connected_profile_ids(auth.uid()))
  );

CREATE POLICY "Create relationships" ON relationships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Delete own relationships" ON relationships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Update own relationships" ON relationships
  FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);


-- clinical_notes: Read own, or if note belongs to connected profile in network. Manage own.
CREATE POLICY "Read own or connected notes" ON clinical_notes
  FOR SELECT USING (
    auth.uid() = patient_id
    OR patient_id = ANY(get_all_connected_profile_ids(auth.uid()))
  );

CREATE POLICY "Manage own notes" ON clinical_notes
  FOR ALL USING (
    auth.uid() = patient_id
    OR patient_id = ANY(get_all_connected_profile_ids(auth.uid()))
  );


-- semantic_facts: Read own, or if fact belongs to connected profile. Manage own.
CREATE POLICY "Read own or connected facts" ON semantic_facts
  FOR SELECT USING (
    auth.uid() = patient_id
    OR patient_id = ANY(get_all_connected_profile_ids(auth.uid()))
  );

CREATE POLICY "Manage own facts" ON semantic_facts
  FOR ALL USING (
    auth.uid() = patient_id
    OR patient_id = ANY(get_all_connected_profile_ids(auth.uid()))
  );


-- ============================================================
-- STEP 4: Indexes
-- ============================================================
CREATE INDEX idx_profiles_id ON profiles(id);
CREATE INDEX idx_medical_records_user ON medical_records(user_id);
CREATE INDEX idx_relationships_req ON relationships(requester_id);
CREATE INDEX idx_relationships_rec ON relationships(receiver_id);
CREATE INDEX idx_clinical_notes_patient ON clinical_notes(patient_id);
CREATE INDEX idx_semantic_facts_patient ON semantic_facts(patient_id);
CREATE INDEX idx_semantic_facts_note ON semantic_facts(note_id);
