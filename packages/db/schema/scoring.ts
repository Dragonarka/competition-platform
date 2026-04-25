import { pgTable, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';
import { judgeSessions } from './judge-sessions';
import { competitors } from './competitors';

export interface CriteriaScoreEntry {
  criterionId: string;
  value: string; // "X.XX" string — never float
}

export const scores = pgTable(
  'scores',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    judgeSessionId: text('judge_session_id')
      .notNull()
      .references(() => judgeSessions.id, { onDelete: 'cascade' }),
    competitorId: text('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    criteriaScores: jsonb('criteria_scores').$type<CriteriaScoreEntry[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_score_judge_competitor').on(table.judgeSessionId, table.competitorId),
    uniqueIndex('uq_score_judge_idempotency').on(table.judgeSessionId, table.idempotencyKey),
  ],
);

export type ScoreRow = typeof scores.$inferSelect;
export type NewScoreRow = typeof scores.$inferInsert;
