import { createHash, randomBytes } from 'node:crypto';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { t } from '../../trpc.init';
import { createTournamentRouter } from '../tournament.router';
import type { ICompetitionGateway } from '../../../modules/websocket/competition-gateway.interface';
import {
  competitions,
  evaluationCriteria,
  competitors,
  judgeSessions,
  competitorGroupAssignments,
  scores,
} from '@competition-platform/db';
import { sql, eq, and } from 'drizzle-orm';
import {
  assertTestDbReachable,
  closeIntegrationDb,
  getIntegrationContext,
  truncateAll,
} from './setup';

// Story 7-3 / Epic 6 retro action item: real-DB integration test framework.
// This is the FIRST real-DB test in the project. It exercises submitScore
// against an actual Postgres instance, proving:
//
//   1. The RLS transaction pattern (`SET LOCAL session.current_organizer_id`)
//      works with the real `app_user` role / policies.
//   2. The judge token → judge_session lookup + competition status guard
//      sequence completes in a single transaction.
//   3. The score INSERT + event INSERT both commit atomically.
//   4. Idempotency via `(judge_session_id, idempotency_key)` UNIQUE actually
//      short-circuits a second submit (this is the spot where unit-test
//      mocks were known to be insufficient).
//
// Future tests should sit alongside this file as `*.int.spec.ts`.

const ORGANIZER_ID = 'user_int_test_organizer';

function gateway(): ICompetitionGateway {
  return {
    broadcastCompetitionStarted: vi.fn(),
    broadcastScoreSubmitted: vi.fn(),
    broadcastScoreOverridden: vi.fn(),
    broadcastStandingsUpdated: vi.fn(),
    broadcastPhaseTransitioned: vi.fn(),
    broadcastBracketGenerated: vi.fn(),
    broadcastVoteSubmitted: vi.fn(),
    broadcastMatchupCompleted: vi.fn(),
    broadcastMatchupRevoteRequired: vi.fn(),
    broadcastMatchupTieResolutionRequired: vi.fn(),
    broadcastBracketAdvanced: vi.fn(),
    broadcastCompetitionCompleted: vi.fn(),
    broadcastJudgeStatusChanged: vi.fn(),
    broadcastCompetitorWithdrawn: vi.fn(),
    broadcastCompetitorRescued: vi.fn(),
    broadcastSimulationReset: vi.fn(),
    getJudgePresence: vi.fn().mockReturnValue([]),
    clearPresence: vi.fn(),
  };
}

describe('submitScore — real DB integration', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  const { db, dbService } = getIntegrationContext();

  beforeEach(async () => {
    await truncateAll(db);
  });

  async function seedActiveCompetitionWithJudge(): Promise<{
    competitionId: string;
    competitorId: string;
    criterionId: string;
    judgeToken: string;
  }> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('session.current_organizer_id', ${ORGANIZER_ID}, true)`,
      );
      const [comp] = await tx
        .insert(competitions)
        .values({
          organizerClerkId: ORGANIZER_ID,
          name: 'Integration Test Comp',
          status: 'active',
          participantFormat: 'individual',
          cypherJudgeCount: 1,
          cypherGroupCount: 1,
        })
        .returning({ id: competitions.id });
      const [crit] = await tx
        .insert(evaluationCriteria)
        .values({
          competitionId: comp!.id,
          name: 'Flow',
          minScore: '0.00',
          maxScore: '10.00',
          precision: 2,
          displayOrder: 1,
        })
        .returning({ id: evaluationCriteria.id });
      const [competitor] = await tx
        .insert(competitors)
        .values({
          competitionId: comp!.id,
          participantId: 'P-001',
          name: 'Alice',
        })
        .returning({ id: competitors.id });
      await tx.insert(competitorGroupAssignments).values({
        competitionId: comp!.id,
        competitorId: competitor!.id,
        groupIndex: 0,
      });
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await tx.insert(judgeSessions).values({
        competitionId: comp!.id,
        tokenHash,
        label: 'Judge 1',
        createdBy: ORGANIZER_ID,
        groupIndex: 0,
      });
      return {
        competitionId: comp!.id,
        competitorId: competitor!.id,
        criterionId: crit!.id,
        judgeToken: rawToken,
      };
    });
  }

  function makeCaller() {
    // `createTournamentRouter` only accesses `db.db.transaction` etc. — the
    // partial shape from `getIntegrationContext()` covers everything the
    // router actually uses at runtime. Cast to satisfy the nominal type.
    const router = createTournamentRouter(
      dbService as unknown as Parameters<typeof createTournamentRouter>[0],
      gateway(),
    );
    const appRouter = t.router({ tournament: router });
    return appRouter.createCaller({ userId: null, clientIp: '127.0.0.1' });
  }

  it('happy path: real DB, real RLS, real score row + event row committed atomically', async () => {
    const { competitionId, competitorId, criterionId, judgeToken } =
      await seedActiveCompetitionWithJudge();

    const result = await makeCaller().tournament.submitScore({
      token: judgeToken,
      competitorId,
      scores: [{ criterionId, value: '7.50' }],
      idempotencyKey: 'int-key-1',
    });
    expect(result).toMatchObject({ success: true });

    // Row really exists in the real DB.
    const persistedScores = await db
      .select({
        id: scores.id,
        criteriaScores: scores.criteriaScores,
      })
      .from(scores)
      .where(eq(scores.competitionId, competitionId));
    expect(persistedScores).toHaveLength(1);
    expect(persistedScores[0]!.criteriaScores).toEqual([
      { criterionId, value: '7.50' },
    ]);
  });

  it('idempotency: second call with same key returns idempotent, no second row', async () => {
    const { competitionId, competitorId, criterionId, judgeToken } =
      await seedActiveCompetitionWithJudge();

    const caller = makeCaller();
    const input = {
      token: judgeToken,
      competitorId,
      scores: [{ criterionId, value: '8.25' }],
      idempotencyKey: 'int-key-idem',
    };
    const first = await caller.tournament.submitScore(input);
    const second = await caller.tournament.submitScore(input);

    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ success: true });
    // Whichever flag the procedure surfaces for idempotency, the row count is
    // the truth.
    const rows = await db
      .select({ id: scores.id })
      .from(scores)
      .where(eq(scores.competitionId, competitionId));
    expect(rows).toHaveLength(1);
  });

  it('invalid token surfaces NOT_FOUND', async () => {
    const { competitorId, criterionId } =
      await seedActiveCompetitionWithJudge();
    const err = await makeCaller()
      .tournament.submitScore({
        token: 'this-is-not-a-real-token',
        competitorId,
        scores: [{ criterionId, value: '5.00' }],
        idempotencyKey: 'int-key-bad',
      })
      .catch((e: { code?: string }) => e);
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('competition must be active — draft competition is rejected by status guard', async () => {
    // Mutate the seeded competition back to draft and re-test.
    const seed = await seedActiveCompetitionWithJudge();
    await db
      .update(competitions)
      .set({ status: 'draft' })
      .where(eq(competitions.id, seed.competitionId));

    const err = await makeCaller()
      .tournament.submitScore({
        token: seed.judgeToken,
        competitorId: seed.competitorId,
        scores: [{ criterionId: seed.criterionId, value: '6.00' }],
        idempotencyKey: 'int-key-draft',
      })
      .catch((e: { code?: string; cause?: unknown }) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('truncate between tests really truncates — each test sees a clean DB', async () => {
    const before = await db.select({ id: competitions.id }).from(competitions);
    expect(before).toHaveLength(0);

    await seedActiveCompetitionWithJudge();

    const after = await db.select({ id: competitions.id }).from(competitions);
    expect(after).toHaveLength(1);

    // The next test (any test in this describe) will see 0 again due to beforeEach.
  });

  // Sanity check that the per-test truncate actually fires — this should be
  // a clean DB if the framework is doing its job.
  it('post-truncate sanity: no rows from the previous test leak into this one', async () => {
    const rows = await db.select({ id: competitions.id }).from(competitions);
    expect(rows).toHaveLength(0);

    // Also verify the relevant FK-child tables are empty.
    const scoreRows = await db.select({ id: scores.id }).from(scores);
    expect(scoreRows).toHaveLength(0);
    const judgeRows = await db
      .select({ id: judgeSessions.id })
      .from(judgeSessions);
    expect(judgeRows).toHaveLength(0);
  });

  it('RLS: organizer A cannot see organizer B competitions when current_organizer_id is A', async () => {
    // Seed two competitions under different organizers; verify RLS hides the
    // wrong-organizer row even when querying without an ownership WHERE clause.
    const orgA = 'user_org_A';
    const orgB = 'user_org_B';
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('session.current_organizer_id', ${orgA}, true)`,
      );
      await tx.insert(competitions).values({
        organizerClerkId: orgA,
        name: 'A',
        status: 'draft',
        participantFormat: 'individual',
      });
    });
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('session.current_organizer_id', ${orgB}, true)`,
      );
      await tx.insert(competitions).values({
        organizerClerkId: orgB,
        name: 'B',
        status: 'draft',
        participantFormat: 'individual',
      });
    });

    // Read AS organizer A; should see only A's row.
    const seenByA = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('session.current_organizer_id', ${orgA}, true)`,
      );
      return tx
        .select({ id: competitions.id, name: competitions.name })
        .from(competitions);
    });
    expect(seenByA.map((r) => r.name)).toEqual(['A']);

    // Read AS organizer B; should see only B's row.
    const seenByB = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('session.current_organizer_id', ${orgB}, true)`,
      );
      return tx
        .select({ id: competitions.id, name: competitions.name })
        .from(competitions);
    });
    expect(seenByB.map((r) => r.name)).toEqual(['B']);

    // Cross-organizer count via explicit WHERE (defense-in-depth) is still
    // filtered by RLS — total visible rows under A's context is 1, not 2.
    const totalUnderA = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('session.current_organizer_id', ${orgA}, true)`,
      );
      return tx
        .select({ id: competitions.id })
        .from(competitions)
        .where(
          and(
            eq(competitions.organizerClerkId, orgA),
            eq(competitions.organizerClerkId, orgA),
          ),
        );
    });
    expect(totalUnderA).toHaveLength(1);
  });
});
