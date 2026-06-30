-- MedTree Supabase Schema Migration
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- Create the medical_entries table
CREATE TABLE IF NOT EXISTS medical_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('person', 'condition', 'medication', 'location')),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE medical_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own entries
CREATE POLICY "Users can read own entries" ON medical_entries
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own entries
CREATE POLICY "Users can insert own entries" ON medical_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own entries
CREATE POLICY "Users can update own entries" ON medical_entries
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own entries
CREATE POLICY "Users can delete own entries" ON medical_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Create an index for faster per-user queries
CREATE INDEX idx_medical_entries_user_id ON medical_entries(user_id);
CREATE INDEX idx_medical_entries_entry_type ON medical_entries(entry_type);
