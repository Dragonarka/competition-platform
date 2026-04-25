-- 1. Create tie_breaking_rule enum type
CREATE TYPE tie_breaking_rule AS ENUM ('re_vote', 'organizer_decision');

-- 2. Add judge config columns to competitions (all nullable — not required until phase starts)
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS cypher_judge_count integer,
  ADD COLUMN IF NOT EXISTS cypher_group_count integer,
  ADD COLUMN IF NOT EXISTS advancement_threshold integer,
  ADD COLUMN IF NOT EXISTS battles_judge_count integer,
  ADD COLUMN IF NOT EXISTS tie_breaking_rule tie_breaking_rule;

-- No RLS changes needed — existing competitions_organizer_isolation policy
-- already covers all columns on the competitions table.
