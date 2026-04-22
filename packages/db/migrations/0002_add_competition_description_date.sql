-- Migration: Add description and date columns to competitions table
ALTER TABLE competitions ADD COLUMN description text;
ALTER TABLE competitions ADD COLUMN date timestamptz;
