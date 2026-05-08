-- Migration 0016 — Story 7.1: Create a Simulation Competition
-- Adds a boolean flag to mark competitions as simulations.
-- Simulation competitions share identical code paths with live competitions,
-- differentiated only by this flag for visual distinction and data segregation.
ALTER TABLE competitions ADD COLUMN is_simulation BOOLEAN NOT NULL DEFAULT FALSE;
