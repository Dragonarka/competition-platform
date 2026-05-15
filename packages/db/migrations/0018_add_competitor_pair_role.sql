-- Migration 0018 — Pairs format: leader/follower roles + partner relationship
--
-- The participantFormat enum on competitions already includes 'pairs', but the
-- competitors table had no way to record which two rows form a partnership or
-- which member is the leader vs. follower. This migration adds both columns
-- (nullable, so individual-format competitions are unaffected) and a self-
-- referencing FK that survives partner deletion via SET NULL.
--
-- Symmetry (A.partner_id = B.id ⇔ B.partner_id = A.id) is enforced at the
-- application layer because Postgres CHECK constraints can't dereference
-- another row. The addPair / bulkAddPairs tRPC mutations set both sides inside
-- a single RLS transaction.

CREATE TYPE competitor_role AS ENUM ('leader', 'follower');

ALTER TABLE competitors
  ADD COLUMN role competitor_role NULL,
  ADD COLUMN partner_id TEXT NULL REFERENCES competitors(id) ON DELETE SET NULL;

CREATE INDEX competitors_partner_id_idx ON competitors(partner_id);
