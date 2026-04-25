-- Judge score submissions (one score per judge per competitor).
-- idempotency_key is unique per (judge_session_id, idempotency_key) to prevent
-- one judge's key from silently short-circuiting another judge's submission.
CREATE TABLE IF NOT EXISTS "scores" (
  "id" text PRIMARY KEY NOT NULL,
  "competition_id" text NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "judge_session_id" text NOT NULL REFERENCES "judge_sessions"("id") ON DELETE CASCADE,
  "competitor_id" text NOT NULL REFERENCES "competitors"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "criteria_scores" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_score_judge_competitor" UNIQUE ("judge_session_id", "competitor_id"),
  CONSTRAINT "uq_score_judge_idempotency" UNIQUE ("judge_session_id", "idempotency_key")
);

CREATE INDEX IF NOT EXISTS "idx_scores_competition" ON "scores" ("competition_id");
CREATE INDEX IF NOT EXISTS "idx_scores_judge_session" ON "scores" ("judge_session_id");
