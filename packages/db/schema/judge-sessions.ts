import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';

export const judgeSessions = pgTable('judge_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label').notNull(),
  createdBy: text('created_by').notNull(),
  groupIndex: integer('group_index'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JudgeSessionRow = typeof judgeSessions.$inferSelect;
export type NewJudgeSessionRow = typeof judgeSessions.$inferInsert;
