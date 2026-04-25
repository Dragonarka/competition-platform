CREATE TABLE IF NOT EXISTS judge_sessions (
  id text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judge_sessions_competition_id
  ON judge_sessions(competition_id);

CREATE INDEX IF NOT EXISTS idx_judge_sessions_token_hash
  ON judge_sessions(token_hash);
