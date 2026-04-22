import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const competitionStatusEnum = pgEnum('competition_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);

export const competitions = pgTable('competitions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  organizerClerkId: text('organizer_clerk_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  date: timestamp('date', { withTimezone: true }),
  status: competitionStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompetitionRow = typeof competitions.$inferSelect;
export type NewCompetitionRow = typeof competitions.$inferInsert;
