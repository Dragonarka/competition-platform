import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

// Authenticated-user profile keyed by Clerk's userId. Story 8.2 introduces
// this as a first-class entity so organizer preferences (currently just
// preferred_locale) can survive across browsers/devices.
//
// Judges are unauthenticated and never get a row here.
export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    clerkId: text('clerk_id').notNull(),
    preferredLocale: text('preferred_locale').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [uniqueIndex('uq_users_clerk_id').on(table.clerkId)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
