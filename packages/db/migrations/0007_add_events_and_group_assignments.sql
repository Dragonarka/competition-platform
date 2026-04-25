-- Append-only event store
CREATE TABLE IF NOT EXISTS "events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "sequence" integer NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_events_aggregate" ON "events" ("aggregate_id", "aggregate_type");
CREATE INDEX IF NOT EXISTS "idx_events_type" ON "events" ("type");

-- Competitor to judge group assignment
CREATE TABLE IF NOT EXISTS "competitor_group_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "competition_id" text NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "competitor_id" text NOT NULL REFERENCES "competitors"("id") ON DELETE CASCADE,
  "group_index" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_cga_competition_competitor" UNIQUE ("competition_id", "competitor_id")
);

-- Judge session group membership
ALTER TABLE "judge_sessions" ADD COLUMN IF NOT EXISTS "group_index" integer;

-- Add missing FK from judge_sessions to competitions (was absent from prior migrations)
ALTER TABLE "judge_sessions"
  ADD CONSTRAINT IF NOT EXISTS "judge_sessions_competition_id_competitions_id_fk"
  FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE;
