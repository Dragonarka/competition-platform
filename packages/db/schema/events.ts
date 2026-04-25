import { pgTable, text, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const events = pgTable(
  'events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    type: text('type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    payload: jsonb('payload').notNull(),
    sequence: integer('sequence').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_events_aggregate').on(table.aggregateId, table.aggregateType),
    index('idx_events_type').on(table.type),
    uniqueIndex('uq_events_aggregate_sequence').on(
      table.aggregateId,
      table.aggregateType,
      table.sequence,
    ),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
