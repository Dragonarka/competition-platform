-- Migration 0019 — Competition format kind
--
-- Adds a `format_kind` enum column to competitions so the platform can host
-- multiple format plugins side-by-side. The first new format is
-- `simple_bracket` (no Cypher phase, straight to a symmetric single-elim
-- bracket). The existing format is renamed in code as `cypher_battles` for
-- clarity, but all pre-existing rows fall back to it via the column default,
-- so this migration is non-destructive.

CREATE TYPE competition_format_kind AS ENUM ('cypher_battles', 'simple_bracket');

ALTER TABLE competitions
  ADD COLUMN format_kind competition_format_kind NOT NULL DEFAULT 'cypher_battles';
