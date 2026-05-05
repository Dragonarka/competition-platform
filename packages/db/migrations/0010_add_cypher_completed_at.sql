-- Migration 0010 — Story 3.6: Cypher Phase Completion & Advancement Review
-- Adds a nullable timestamp column to record when an organizer confirms
-- advancement and locks the Cypher phase results. The companion
-- `phase.transitioned` domain event is the immutable audit record; this
-- column is a denormalized projection used for fast UI state checks and
-- idempotency guards on `completeCypherPhase`.

ALTER TABLE competitions ADD COLUMN cypher_completed_at TIMESTAMPTZ;
