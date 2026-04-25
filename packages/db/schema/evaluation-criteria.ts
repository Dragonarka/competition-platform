import { pgTable, text, smallint, integer, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';

export const evaluationCriteria = pgTable('evaluation_criteria', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  minScore: text('min_score').notNull().default('0.00'),
  maxScore: text('max_score').notNull().default('10.00'),
  precision: smallint('precision').notNull().default(2),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EvaluationCriterionRow = typeof evaluationCriteria.$inferSelect;
export type NewEvaluationCriterionRow = typeof evaluationCriteria.$inferInsert;
