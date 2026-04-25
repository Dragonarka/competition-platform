import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';
import { competitors } from './competitors';

export const competitorGroupAssignments = pgTable(
  'competitor_group_assignments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    competitorId: text('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    groupIndex: integer('group_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_cga_competition_competitor').on(table.competitionId, table.competitorId),
  ],
);

export type CompetitorGroupAssignmentRow = typeof competitorGroupAssignments.$inferSelect;
export type NewCompetitorGroupAssignmentRow = typeof competitorGroupAssignments.$inferInsert;
