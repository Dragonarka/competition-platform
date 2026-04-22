-- Migration: competitions table with Row Level Security
-- Apply after running: pnpm --filter @competition-platform/db db:generate && db:migrate

-- Enable RLS on competitions table
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- Policy: organizers can only see and modify their own competitions
-- current_setting('session.current_organizer_id', true) returns NULL (not error) if unset
CREATE POLICY competitions_organizer_isolation
  ON competitions
  USING (
    organizer_clerk_id = current_setting('session.current_organizer_id', true)
  )
  WITH CHECK (
    organizer_clerk_id = current_setting('session.current_organizer_id', true)
  );

-- Allow the application DB user to manage competitions
-- In production, replace 'current_user' with the specific role your connection pool uses
GRANT SELECT, INSERT, UPDATE, DELETE ON competitions TO current_user;
