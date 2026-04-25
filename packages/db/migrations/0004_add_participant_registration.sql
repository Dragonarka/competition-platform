-- 1. Create participant_format enum type
CREATE TYPE participant_format AS ENUM ('individual', 'pairs');

-- 2. Add participant_format column to competitions
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS participant_format participant_format NOT NULL DEFAULT 'individual';

-- 3. Create competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id             text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  name           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_competitors_competition_id
  ON competitors(competition_id);

-- 4. Enable RLS (matches competitions and evaluation_criteria pattern from 0001/0003)
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitors_organizer_isolation
  ON competitors
  USING (
    competition_id IN (
      SELECT id FROM competitions
      WHERE organizer_clerk_id = current_setting('session.current_organizer_id', true)
    )
  )
  WITH CHECK (
    competition_id IN (
      SELECT id FROM competitions
      WHERE organizer_clerk_id = current_setting('session.current_organizer_id', true)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON competitors TO current_user;
