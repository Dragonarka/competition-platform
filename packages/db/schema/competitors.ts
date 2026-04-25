import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';

export const competitors = pgTable(
  'competitors',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    participantId: text('participant_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_competitors_competition_participant').on(
      table.competitionId,
      table.participantId,
    ),
  ],
);

export type CompetitorRow = typeof competitors.$inferSelect;
export type NewCompetitorRow = typeof competitors.$inferInsert;
