-- Migration 0012 — Story 4.4: Solo Scoring Mode & Phase Transition Control
-- Adds a boolean flag enabling organizer-as-scorer mode for small/solo events.
-- When true: judge link generation is bypassed at startCypherPhase, and the
-- organizer can submit scores directly via submitOrganizerScore.
ALTER TABLE competitions ADD COLUMN solo_mode BOOLEAN NOT NULL DEFAULT FALSE;
