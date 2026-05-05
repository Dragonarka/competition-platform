import { pgTable, text, timestamp, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';
import { battleMatchups } from './battle-matchups';
import { judgeSessions } from './judge-sessions';

export const voteChoiceEnum = pgEnum('vote_choice', ['player1', 'player2', 'tie']);

export const votes = pgTable(
  'votes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    matchupId: text('matchup_id')
      .notNull()
      .references(() => battleMatchups.id, { onDelete: 'cascade' }),
    judgeSessionId: text('judge_session_id')
      .notNull()
      .references(() => judgeSessions.id, { onDelete: 'cascade' }),
    vote: voteChoiceEnum('vote').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_votes_matchup_judge').on(table.matchupId, table.judgeSessionId),
    uniqueIndex('uq_votes_judge_idempotency').on(table.judgeSessionId, table.idempotencyKey),
    index('idx_votes_competition').on(table.competitionId),
    index('idx_votes_matchup').on(table.matchupId),
  ],
);

export type VoteRow = typeof votes.$inferSelect;
export type NewVoteRow = typeof votes.$inferInsert;
