import { sql, eq } from 'drizzle-orm';
import { t } from '../trpc.init';
import { protectedProcedure } from '../trpc.procedures';
import { users } from '@competition-platform/db';
import {
  setLocalePreferenceSchema,
  type SupportedLocale,
} from '@competition-platform/shared';
import type { DatabaseService } from '../../modules/database/database.service';

// Story 8.2 — organizer language preference, persisted server-side so the
// chosen locale follows the user across browsers and devices.
//
// Judges are unauthenticated and never reach this router (protectedProcedure
// blocks them); their preference lives in localStorage + the NEXT_LOCALE
// cookie only.
export function createUserRouter(db: DatabaseService) {
  return t.router({
    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      return db.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
        );
        const [row] = await tx
          .select({ preferredLocale: users.preferredLocale })
          .from(users)
          .where(eq(users.clerkId, ctx.userId));
        // Lazy creation: no row → return default + hasPreference:false so the
        // reconciler can tell first-sign-in (no row) from explicit-English
        // preference (row exists with 'en').
        return {
          preferredLocale: (row?.preferredLocale ?? 'en') as SupportedLocale,
          hasPreference: row !== undefined,
        };
      });
    }),

    setPreference: protectedProcedure
      .input(setLocalePreferenceSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          // ON CONFLICT upsert is naturally TOCTOU-safe. Two concurrent
          // setPreference calls race with last-write-wins semantics, which is
          // the expected behaviour for a user-preference column.
          const [row] = await tx
            .insert(users)
            .values({
              clerkId: ctx.userId,
              preferredLocale: input.locale,
            })
            .onConflictDoUpdate({
              target: users.clerkId,
              set: {
                preferredLocale: input.locale,
                updatedAt: sql`now()`,
              },
            })
            .returning({ preferredLocale: users.preferredLocale });
          return {
            preferredLocale: row.preferredLocale as SupportedLocale,
          };
        });
      }),
  });
}
