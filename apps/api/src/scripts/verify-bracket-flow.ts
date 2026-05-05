/**
 * Story 5.1 H3 manual-verification harness.
 *
 * This script is a one-off integration check: it boots the same tRPC router
 * that the API serves to HTTP clients, but uses a real Drizzle/Postgres
 * connection (no mocks) and bypasses Clerk by calling createCaller directly
 * with a synthetic userId. RLS is honored via the SET LOCAL pattern in the
 * router itself.
 *
 * Run with:
 *   set -a && source .env.local && set +a
 *   pnpm --filter @competition-platform/api exec tsx src/scripts/verify-bracket-flow.mts
 *
 * Asserts AC #1, #2, #3 (data layer), #4 (broadcast call), #5, #6, #7.
 * Does NOT exercise the React component — that requires Clerk credentials
 * and is the residual manual step.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import {
  battleMatchups,
  competitions,
  competitors,
  evaluationCriteria,
  events,
  judgeSessions,
  scores,
} from '@competition-platform/db';
import * as schema from '@competition-platform/db';
import { t } from '../trpc/trpc.init';
import { createTournamentRouter } from '../trpc/routers/tournament.router';
import type { DatabaseService } from '../modules/database/database.service';
import type { ICompetitionGateway } from '../modules/websocket/competition-gateway.interface';

const ORG = 'verify-organizer-1';

interface BroadcastCall {
  method: string;
  args: unknown[];
}

function makeRecordingGateway(record: BroadcastCall[]): ICompetitionGateway {
  const proxyMethod =
    (method: string) =>
    (...args: unknown[]) => {
      record.push({ method, args });
    };
  return {
    broadcastCompetitionStarted: proxyMethod('broadcastCompetitionStarted'),
    broadcastScoreSubmitted: proxyMethod('broadcastScoreSubmitted'),
    broadcastScoreOverridden: proxyMethod('broadcastScoreOverridden'),
    broadcastStandingsUpdated: proxyMethod('broadcastStandingsUpdated'),
    broadcastPhaseTransitioned: proxyMethod('broadcastPhaseTransitioned'),
    broadcastBracketGenerated: proxyMethod('broadcastBracketGenerated'),
    broadcastJudgeStatusChanged: proxyMethod('broadcastJudgeStatusChanged'),
    broadcastCompetitorWithdrawn: proxyMethod('broadcastCompetitorWithdrawn'),
    broadcastCompetitorRescued: proxyMethod('broadcastCompetitorRescued'),
    getJudgePresence: () => [],
    clearPresence: () => undefined,
  };
}

async function seedScenario(
  db: ReturnType<typeof drizzle<typeof schema>>,
  competitionId: string,
  qualifierCount: number,
) {
  const competitorIds = Array.from(
    { length: qualifierCount },
    (_, i) => `${competitionId}-c${i + 1}`,
  );
  // The postgres superuser bypasses RLS for seed work; the router itself
  // re-establishes session.current_organizer_id inside its own transactions.
  // Wipe in case of prior runs.
  await db
    .delete(battleMatchups)
    .where(eq(battleMatchups.competitionId, competitionId));
  await db.delete(events).where(eq(events.aggregateId, competitionId));
  await db.delete(scores).where(eq(scores.competitionId, competitionId));
  await db
    .delete(competitors)
    .where(eq(competitors.competitionId, competitionId));
  await db
    .delete(evaluationCriteria)
    .where(eq(evaluationCriteria.competitionId, competitionId));
  await db
    .delete(judgeSessions)
    .where(eq(judgeSessions.competitionId, competitionId));
  await db.delete(competitions).where(eq(competitions.id, competitionId));

  // Competition with active status. For N=0 we need a positive threshold to
  // pass the router's validation guard; the standings will still empty out
  // because there are no scores, exercising the AC #7 "no qualifiers" branch.
  await db.insert(competitions).values({
    id: competitionId,
    name: `Verify ${qualifierCount}`,
    organizerClerkId: ORG,
    status: 'active',
    advancementThreshold: Math.max(qualifierCount, 1),
    cypherCompletedAt: null,
    soloMode: false,
  });

  // Single criterion 0..10, weight 1.
  const criterionId = `${competitionId}-crit`;
  await db.insert(evaluationCriteria).values({
    id: criterionId,
    competitionId,
    name: 'Overall',
    minScore: '0.00',
    maxScore: '10.00',
    weight: '1.00',
    sortOrder: 0,
  });

  // Active competitors with rank-aware names.
  for (let i = 0; i < qualifierCount; i++) {
    await db.insert(competitors).values({
      id: competitorIds[i],
      competitionId,
      participantId: `P${i + 1}`,
      name: `Competitor ${i + 1}`,
      status: 'active',
    });
  }

  // One judge session that scored everyone.
  const judgeId = `${competitionId}-judge`;
  await db.insert(judgeSessions).values({
    id: judgeId,
    competitionId,
    label: 'J1',
    tokenHash: `hash-${competitionId}`,
    groupIndex: 0,
    createdBy: ORG,
  });

  // Score each competitor — strictly ascending by index so the highest
  // index = highest score = seed 1.
  for (let i = 0; i < qualifierCount; i++) {
    const value = (5 + i * 0.5).toFixed(2);
    await db.insert(scores).values({
      id: `${competitionId}-score-${i}`,
      competitionId,
      competitorId: competitorIds[i],
      judgeSessionId: judgeId,
      criteriaScores: [{ criterionId, value }],
      idempotencyKey: `idem-${competitionId}-${i}`,
    });
  }

  return { competitorIds };
}

async function verifyScenario(
  db: ReturnType<typeof drizzle<typeof schema>>,
  caller: ReturnType<ReturnType<typeof t.router>['createCaller']>,
  broadcasts: BroadcastCall[],
  competitionId: string,
  qualifierCount: number,
  expectedBracketSize: number,
  expectedByes: number,
) {
  console.log(
    `\n=== Scenario N=${qualifierCount} (competition=${competitionId}) ===`,
  );
  await seedScenario(db, competitionId, qualifierCount);

  const before = broadcasts.length;
  const result = await caller.tournament.completeCypherPhase({ competitionId });

  // Pull DB-side truth.
  const matchupRows = await db
    .select()
    .from(battleMatchups)
    .where(eq(battleMatchups.competitionId, competitionId))
    .orderBy(battleMatchups.bracketPosition);
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.aggregateId, competitionId))
    .orderBy(events.sequence);

  const bracketEvent = eventRows.find((e) => e.type === 'bracket.generated');
  const phaseEvent = eventRows.find((e) => e.type === 'phase.transitioned');
  const newBroadcasts = broadcasts.slice(before);

  // ── Assertions ────────────────────────────────────────────────────────────
  const expectedMatchups = qualifierCount < 2 ? 0 : expectedBracketSize / 2;
  let pass = true;
  function check(label: string, ok: boolean) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) pass = false;
  }

  check(
    `phase.transitioned event present (sequence=${phaseEvent?.sequence ?? 'NONE'})`,
    !!phaseEvent,
  );

  if (qualifierCount >= 2) {
    check(
      `battle_matchups row count = ${expectedMatchups} (got ${matchupRows.length})`,
      matchupRows.length === expectedMatchups,
    );
    check(
      `bye matchup count = ${expectedByes} (got ${matchupRows.filter((m) => m.isBye).length})`,
      matchupRows.filter((m) => m.isBye).length === expectedByes,
    );
    check(
      `every bye has winnerCompetitorId pre-resolved to A-side`,
      matchupRows
        .filter((m) => m.isBye)
        .every(
          (m) =>
            m.winnerCompetitorId !== null &&
            m.winnerCompetitorId === m.competitorAId,
        ),
    );
    check(
      `bracket.generated event present (sequence=${bracketEvent?.sequence ?? 'NONE'})`,
      !!bracketEvent,
    );
    check(
      `bracket.generated event sequence = phase.transitioned + 1 (${phaseEvent?.sequence}+1 vs ${bracketEvent?.sequence})`,
      !!phaseEvent &&
        !!bracketEvent &&
        bracketEvent.sequence === phaseEvent.sequence + 1,
    );
    check(
      `payload bracketSize=${expectedBracketSize} (got ${(bracketEvent?.payload as any)?.bracketSize})`,
      (bracketEvent?.payload as any)?.bracketSize === expectedBracketSize,
    );
    check(
      `payload qualifierCount=${qualifierCount} (got ${(bracketEvent?.payload as any)?.qualifierCount})`,
      (bracketEvent?.payload as any)?.qualifierCount === qualifierCount,
    );
    check(
      `gateway.broadcastBracketGenerated called once`,
      newBroadcasts.filter((b) => b.method === 'broadcastBracketGenerated')
        .length === 1,
    );
    // Compare via canonical (sorted-key) JSON since jsonb storage does not
    // preserve insertion order.
    function sortKeys(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.keys(value as object)
            .sort()
            .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
        );
      }
      return value;
    }
    const resultStr = JSON.stringify(sortKeys((result as any).bracket));
    const eventStr = JSON.stringify(sortKeys(bracketEvent?.payload));
    if (resultStr !== eventStr) {
      console.log(`   result.bracket: ${resultStr}`);
      console.log(`   event.payload : ${eventStr}`);
    }
    check(
      `result.bracket payload deep-equals event payload`,
      resultStr === eventStr,
    );

    // AC #1: top seed pair = (1, bracketSize) when no bye on top seed.
    const topMatchup = matchupRows.find((m) => m.bracketPosition === 0);
    if (qualifierCount === expectedBracketSize) {
      check(
        `top matchup pairs seed 1 vs seed ${expectedBracketSize} (got ${topMatchup?.seedA} vs ${topMatchup?.seedB})`,
        topMatchup?.seedA === 1 && topMatchup?.seedB === expectedBracketSize,
      );
    } else {
      check(
        `top matchup is a bye for seed 1`,
        topMatchup?.seedA === 1 && topMatchup?.isBye === true,
      );
    }
  } else {
    // AC #7: under-populated → no bracket.
    check(
      `battle_matchups empty (got ${matchupRows.length})`,
      matchupRows.length === 0,
    );
    check(`no bracket.generated event`, !bracketEvent);
    check(`result.bracket is null`, (result as any).bracket === null);
    check(
      `gateway.broadcastBracketGenerated NOT called`,
      newBroadcasts.filter((b) => b.method === 'broadcastBracketGenerated')
        .length === 0,
    );
  }

  // AC #6: idempotency — second call with same competition returns early.
  const beforeIdem = broadcasts.length;
  const idem = await caller.tournament.completeCypherPhase({ competitionId });
  const idemMatchups = await db
    .select()
    .from(battleMatchups)
    .where(eq(battleMatchups.competitionId, competitionId));
  check(
    `idempotent retry sets idempotent=true (got ${(idem as any).idempotent})`,
    (idem as any).idempotent === true,
  );
  check(
    `idempotent retry preserves matchup row count (still ${expectedMatchups}, got ${idemMatchups.length})`,
    idemMatchups.length === expectedMatchups,
  );
  check(
    `idempotent retry does NOT broadcast bracket again`,
    broadcasts
      .slice(beforeIdem)
      .filter((b) => b.method === 'broadcastBracketGenerated').length === 0,
  );
  if (qualifierCount >= 2) {
    check(
      `idempotent retry returns prior bracket payload (not null)`,
      (idem as any).bracket !== null,
    );
  }

  return pass;
}

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL not set');
  }
  const client = postgres(url, { max: 4 });
  const db = drizzle(client, { schema });

  const broadcasts: BroadcastCall[] = [];
  const gateway = makeRecordingGateway(broadcasts);
  const databaseService = { db } as unknown as DatabaseService;
  const router = createTournamentRouter(databaseService, gateway);
  const appRouter = t.router({ tournament: router });
  const caller = appRouter.createCaller({
    userId: ORG,
    clientIp: '127.0.0.1',
  });

  let allPass = true;
  // AC #1 / #2 / #5 / #6 happy paths.
  allPass =
    (await verifyScenario(db, caller, broadcasts, 'verify-n4', 4, 4, 0)) &&
    allPass;
  allPass =
    (await verifyScenario(db, caller, broadcasts, 'verify-n5', 5, 8, 3)) &&
    allPass;
  allPass =
    (await verifyScenario(db, caller, broadcasts, 'verify-n10', 10, 16, 6)) &&
    allPass;
  // AC #7 under-populated.
  allPass =
    (await verifyScenario(db, caller, broadcasts, 'verify-n1', 1, 0, 0)) &&
    allPass;
  allPass =
    (await verifyScenario(db, caller, broadcasts, 'verify-n0', 0, 0, 0)) &&
    allPass;

  console.log(
    `\n${allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`,
  );

  await client.end();
  process.exit(allPass ? 0 : 1);
}

void main().catch((err) => {
  console.error('verify-bracket-flow.mts failed:', err);
  process.exit(2);
});
