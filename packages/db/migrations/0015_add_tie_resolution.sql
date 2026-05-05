-- Migration 0015 — Story 5.3: Bracket Progression & Winner Determination
-- Adds tie-resolution metadata to battle_matchups so we can express:
--   - tieStatus = 'organizer_decision_pending' (waiting for human)
--   - revoteCount = how many re-votes this matchup has burned
--   - organizerDecisionReason / organizerDecisionBy = audit footprint
DO $$ BEGIN
  CREATE TYPE tie_status AS ENUM ('organizer_decision_pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "battle_matchups"
  ADD COLUMN IF NOT EXISTS "tie_status" tie_status,
  ADD COLUMN IF NOT EXISTS "revote_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "organizer_decision_reason" text,
  ADD COLUMN IF NOT EXISTS "organizer_decision_by" text,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_battle_matchups_tie_status"
  ON "battle_matchups" ("competition_id", "tie_status")
  WHERE "tie_status" IS NOT NULL;
