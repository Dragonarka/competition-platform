-- Migration 0017 — Story 8.2: Language Switcher & Persistent Preference
-- Creates the users table for storing organizer preferences (currently just
-- preferred_locale). Judges are unauthenticated and never get a row here.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  preferred_locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT users_locale_check CHECK (preferred_locale IN ('en', 'es'))
);

CREATE UNIQUE INDEX uq_users_clerk_id ON users(clerk_id);

-- RLS: rows are scoped to the authenticated user themselves. The session
-- variable name (`session.current_organizer_id`) is reused from the existing
-- RLS precedent even though it carries any authenticated Clerk userId, not
-- only organizers. Renaming the variable is out of scope.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_only
  ON users
  USING (
    clerk_id = current_setting('session.current_organizer_id', true)
  )
  WITH CHECK (
    clerk_id = current_setting('session.current_organizer_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO current_user;
