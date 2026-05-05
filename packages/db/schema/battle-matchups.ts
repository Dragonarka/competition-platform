import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';
import { competitors } from './competitors';

export const battleMatchups = pgTable(
  'battle_matchups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    bracketPosition: integer('bracket_position').notNull(),
    competitorAId: text('competitor_a_id').references(() => competitors.id),
    competitorBId: text('competitor_b_id').references(() => competitors.id),
    seedA: integer('seed_a'),
    seedB: integer('seed_b'),
    isBye: boolean('is_bye').notNull().default(false),
    winnerCompetitorId: text('winner_competitor_id').references(() => competitors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_battle_matchups_position').on(
      table.competitionId,
      table.roundNumber,
      table.bracketPosition,
    ),
    index('idx_battle_matchups_competition').on(table.competitionId),
  ],
);

export type BattleMatchupRow = typeof battleMatchups.$inferSelect;
export type NewBattleMatchupRow = typeof battleMatchups.$inferInsert;
