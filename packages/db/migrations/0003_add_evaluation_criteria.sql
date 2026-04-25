CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id             text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name           text NOT NULL,
  min_score      text NOT NULL DEFAULT '0.00',
  max_score      text NOT NULL DEFAULT '10.00',
  precision      smallint NOT NULL DEFAULT 2,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_competition_id
  ON evaluation_criteria(competition_id);

-- Enable RLS (matches competitions table pattern from 0001)
ALTER TABLE evaluation_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluation_criteria_organizer_isolation
  ON evaluation_criteria
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

GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_criteria TO current_user;
