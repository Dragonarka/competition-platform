-- Prevent concurrent submitScore calls from producing duplicate sequence numbers
-- for the same competition's event log. Without this, two transactions reading the
-- same MAX(sequence) under READ COMMITTED isolation both succeed and produce
-- identical sequence values, breaking event-sourcing replay ordering.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_events_aggregate_sequence"
  ON "events" ("aggregate_id", "aggregate_type", "sequence");
