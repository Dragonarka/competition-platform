-- Migration 0011 — Story 4.3: Competitor Withdrawal & Rescue
-- Adds a status column to competitors to track active vs withdrawn state.
-- The companion competitor.withdrawn / competitor.rescued domain events are
-- the immutable audit records; this column is a denormalized projection used
-- for fast standings filtering and idempotency guards.
CREATE TYPE competitor_status AS ENUM ('active', 'withdrawn');
ALTER TABLE competitors ADD COLUMN status competitor_status NOT NULL DEFAULT 'active';
