import { pgTable, text, timestamp, pgEnum, integer, boolean } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const competitionStatusEnum = pgEnum('competition_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);

export const participantFormatEnum = pgEnum('participant_format', ['individual', 'pairs']);

export const tieBreakingRuleEnum = pgEnum('tie_breaking_rule', ['re_vote', 'organizer_decision']);

export const competitionFormatKindEnum = pgEnum('competition_format_kind', [
  'cypher_battles',
  'simple_bracket',
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
  participantFormat: participantFormatEnum('participant_format').notNull().default('individual'),
  cypherJudgeCount: integer('cypher_judge_count'),
  cypherGroupCount: integer('cypher_group_count'),
  advancementThreshold: integer('advancement_threshold'),
  battlesJudgeCount: integer('battles_judge_count'),
  tieBreakingRule: tieBreakingRuleEnum('tie_breaking_rule'),
  cypherCompletedAt: timestamp('cypher_completed_at', { withTimezone: true }),
  soloMode: boolean('solo_mode').notNull().default(false),
  isSimulation: boolean('is_simulation').notNull().default(false),
  formatKind: competitionFormatKindEnum('format_kind').notNull().default('cypher_battles'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompetitionRow = typeof competitions.$inferSelect;
export type NewCompetitionRow = typeof competitions.$inferInsert;
