import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';

export const competitorStatusEnum = pgEnum('competitor_status', ['active', 'withdrawn']);

export const competitorRoleEnum = pgEnum('competitor_role', ['leader', 'follower']);

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
    status: competitorStatusEnum('status').notNull().default('active'),
    role: competitorRoleEnum('role'),
    // Self-FK to the partner row in pairs format. Symmetry (A.partner = B ⇔
    // B.partner = A) is enforced inside the addPair transaction; the DB just
    // ensures the reference exists and clears it if the partner is deleted.
    partnerId: text('partner_id').references((): AnyPgColumn => competitors.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_competitors_competition_participant').on(
      table.competitionId,
      table.participantId,
    ),
    index('competitors_partner_id_idx').on(table.partnerId),
  ],
);

export type CompetitorRow = typeof competitors.$inferSelect;
export type NewCompetitorRow = typeof competitors.$inferInsert;
