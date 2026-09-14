-- ============================================================
-- DOPPELGANGER 2026 - SUPABASE DATABASE SETUP SCRIPT
-- Run this in your Supabase Dashboard: SQL Editor -> New Query
-- ============================================================

-- 1. Main Global Event State Table (Stores live round, timer, challenges & participants in JSONB)
CREATE TABLE IF NOT EXISTS public.doppelganger_state (
  id TEXT PRIMARY KEY DEFAULT 'round_01',
  store JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Structured Participants Table (For viewing live student records directly in Supabase Table View)
CREATE TABLE IF NOT EXISTS public.participants (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  college TEXT NOT NULL,
  challenge TEXT DEFAULT '',
  status TEXT DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'VERIFIED', 'ACTIVE', 'SUBMITTED', 'EXPIRED')),
  verified_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  prompt TEXT,
  submission_image TEXT,
  project_url TEXT,
  figma_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Structured Challenges / UI Templates Table
CREATE TABLE IF NOT EXISTS public.challenges (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  difficulty TEXT DEFAULT 'Medium',
  color TEXT DEFAULT '#7357ff',
  description TEXT DEFAULT '',
  image_url TEXT,
  specs JSONB DEFAULT '[]'::jsonb,
  category TEXT DEFAULT 'Mobile',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable Row Level Security (RLS) & Allow Read/Write
ALTER TABLE public.doppelganger_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- 5. Create Public Access Policies (Allows Next.js APIs to Read and Write)
DROP POLICY IF EXISTS "Allow public read-write for doppelganger_state" ON public.doppelganger_state;
CREATE POLICY "Allow public read-write for doppelganger_state" ON public.doppelganger_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for participants" ON public.participants;
CREATE POLICY "Allow public read-write for participants" ON public.participants
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for challenges" ON public.challenges;
CREATE POLICY "Allow public read-write for challenges" ON public.challenges
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Insert initial empty state if not exists
INSERT INTO public.doppelganger_state (id, store)
VALUES (
  'round_01',
  '{
    "status": "WAITING",
    "duration": 1800,
    "endsAt": null,
    "pausedRemaining": 1800,
    "grace": 30,
    "challenges": [],
    "participants": []
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
