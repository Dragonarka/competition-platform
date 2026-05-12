import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { t } from '../../trpc.init';
import { createUserRouter } from '../user.router';
import { users } from '@competition-platform/db';
import {
  assertTestDbReachable,
  closeIntegrationDb,
  getIntegrationContext,
  truncateAll,
} from './setup';

// Story 8.2 — real-DB integration test for the user router. Proves:
//   1. setPreference INSERT + ON CONFLICT UPDATE round-trip.
//   2. RLS policy `users_self_only` actually filters cross-user reads.
//   3. CHECK constraint blocks unknown locales at the DB level (defence in
//      depth behind Zod validation).
//   4. updatedAt bumps on the UPDATE branch.

const ORG_A = 'user_int_test_org_A';
const ORG_B = 'user_int_test_org_B';

describe('user.* router — real DB integration', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });
  afterAll(async () => {
    await closeIntegrationDb();
  });

  const { db, dbService } = getIntegrationContext();
  const appRouter = t.router({ user: createUserRouter(dbService as never) });

  const caller = (userId: string | null) =>
    appRouter.createCaller({ userId, clientIp: '127.0.0.1' });

  beforeEach(async () => {
    await truncateAll(db);
  });

  it('round-trips a preference via setPreference → getPreferences', async () => {
    const set = await caller(ORG_A).user.setPreference({ locale: 'es' });
    expect(set).toEqual({ preferredLocale: 'es' });

    const get = await caller(ORG_A).user.getPreferences();
    expect(get).toEqual({ preferredLocale: 'es', hasPreference: true });
  });

  it('returns en default and hasPreference:false for a user with no row', async () => {
    const result = await caller(ORG_A).user.getPreferences();
    expect(result).toEqual({ preferredLocale: 'en', hasPreference: false });
  });

  it('ON CONFLICT UPDATE bumps updated_at on second setPreference', async () => {
    await caller(ORG_A).user.setPreference({ locale: 'en' });
    const before = await db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.clerkId, ORG_A));
    expect(before).toHaveLength(1);

    // Sleep a tick so the timestamp can change.
    await new Promise((resolve) => setTimeout(resolve, 10));

    await caller(ORG_A).user.setPreference({ locale: 'es' });
    const after = await db
      .select({
        updatedAt: users.updatedAt,
        preferredLocale: users.preferredLocale,
      })
      .from(users)
      .where(eq(users.clerkId, ORG_A));

    expect(after).toHaveLength(1);
    expect(after[0].preferredLocale).toBe('es');
    expect(after[0].updatedAt.getTime()).toBeGreaterThan(
      before[0].updatedAt.getTime(),
    );
  });

  it('enforces RLS: org A cannot read org B row', async () => {
    await caller(ORG_B).user.setPreference({ locale: 'es' });

    // Read as org A — should see no row, even though one exists for B.
    const result = await caller(ORG_A).user.getPreferences();
    expect(result).toEqual({ preferredLocale: 'en' });

    // Confirm B's row really exists when read with B's session.
    const asB = await caller(ORG_B).user.getPreferences();
    expect(asB).toEqual({ preferredLocale: 'es', hasPreference: true });
  });

  it('CHECK constraint rejects bogus locales at the DB layer', async () => {
    // Bypass Zod by writing directly. The router can never produce this state
    // (Zod blocks first), but we want defence in depth.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('session.current_organizer_id', ${ORG_A}, true)`,
        );
        await tx.insert(users).values({
          clerkId: ORG_A,
          preferredLocale: 'fr' as never,
        });
      }),
    ).rejects.toThrow();
  });
});
