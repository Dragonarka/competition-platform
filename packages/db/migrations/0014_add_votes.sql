-- Migration 0014 — Story 5.2: Judge Voting Interface (Battles Mode)
-- Append-only votes per battle matchup per judge. Uniqueness on
-- (matchup_id, judge_session_id) makes a judge's vote final-once;
-- (judge_session_id, idempotency_key) deduplicates retries.

DO $$ BEGIN
  CREATE TYPE vote_choice AS ENUM ('player1', 'player2', 'tie');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "votes" (
  "id" text PRIMARY KEY NOT NULL,
  "competition_id" text NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "matchup_id" text NOT NULL REFERENCES "battle_matchups"("id") ON DELETE CASCADE,
  "judge_session_id" text NOT NULL REFERENCES "judge_sessions"("id") ON DELETE CASCADE,
  "vote" vote_choice NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_votes_matchup_judge" ON "votes" ("matchup_id", "judge_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_votes_judge_idempotency" ON "votes" ("judge_session_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_votes_competition" ON "votes" ("competition_id");
CREATE INDEX IF NOT EXISTS "idx_votes_matchup" ON "votes" ("matchup_id");

ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes_organizer" ON "votes"
  USING (
    "competition_id" IN (
      SELECT "id" FROM "competitions"
      WHERE "organizer_clerk_id" = current_setting('session.current_organizer_id', true)
    )
  );
