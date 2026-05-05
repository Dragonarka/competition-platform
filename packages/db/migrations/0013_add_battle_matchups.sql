-- Migration 0013 — Story 5.1: Battles Bracket Generation
-- Persists single-elimination bracket matchups produced by the bracket-generator
-- inside completeCypherPhase. Round 1 is materialized at generation time; later
-- rounds are inserted lazily by Story 5.3 as winners are confirmed.
CREATE TABLE IF NOT EXISTS "battle_matchups" (
  "id" text PRIMARY KEY NOT NULL,
  "competition_id" text NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "round_number" integer NOT NULL,
  "bracket_position" integer NOT NULL,
  "competitor_a_id" text REFERENCES "competitors"("id"),
  "competitor_b_id" text REFERENCES "competitors"("id"),
  "seed_a" integer,
  "seed_b" integer,
  "is_bye" boolean NOT NULL DEFAULT FALSE,
  "winner_competitor_id" text REFERENCES "competitors"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_battle_matchups_position" UNIQUE ("competition_id", "round_number", "bracket_position")
);

CREATE INDEX IF NOT EXISTS "idx_battle_matchups_competition" ON "battle_matchups" ("competition_id");

-- RLS: organizer can only see matchups for competitions they own.
ALTER TABLE "battle_matchups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battle_matchups_organizer" ON "battle_matchups"
  USING (
    "competition_id" IN (
      SELECT "id" FROM "competitions"
      WHERE "organizer_clerk_id" = current_setting('session.current_organizer_id', true)
    )
  );
