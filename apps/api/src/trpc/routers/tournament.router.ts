import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { sql, eq, desc, max, and, asc, inArray, like } from 'drizzle-orm';
import { z } from 'zod';
import { t } from '../trpc.init';
import { protectedProcedure } from '../trpc.procedures';
import { resolveOrganizerJudgeSession } from './helpers/resolve-organizer-judge-session';
import {
  competitions,
  evaluationCriteria,
  competitors,
  judgeSessions,
  events,
  competitorGroupAssignments,
  scores,
  battleMatchups,
  votes,
} from '@competition-platform/db';
import type { CriteriaScoreEntry } from '@competition-platform/db';
import {
  createCompetitionSchema,
  createSimulationSchema,
  addCriterionSchema,
  copyCriteriaTemplateSchema,
  addParticipantSchema,
  addPairSchema,
  bulkAddParticipantsSchema,
  bulkAddPairsSchema,
  setParticipantFormatSchema,
  setJudgeConfigSchema,
  generateJudgeLinksSchema,
  validateJudgeTokenSchema,
  startCypherPhaseSchema,
  completeCypherPhaseSchema,
  submitScoreSchema,
  getDashboardSnapshotSchema,
  overrideScoreSchema,
  getScoreAuditTrailSchema,
  listScoresForCompetitionSchema,
  withdrawCompetitorSchema,
  rescueCompetitorSchema,
  setSoloModeSchema,
  submitOrganizerScoreSchema,
  submitVoteSchema,
  submitOrganizerVoteSchema,
  resolveTieSchema,
  resetSimulationSchema,
  ErrorCodes,
} from '@competition-platform/shared';
import type {
  BracketAdvancedPayload,
  BracketGeneratedPayload,
  BracketMatchupSnapshot,
  BracketSeed,
  CompetitionCompletedPayload,
  CompetitionStartedPayload,
  MatchupCompletedPayload,
  MatchupRevoteRequiredPayload,
  MatchupTieResolutionRequiredPayload,
  PhaseTransitionedPayload,
  ScoreSubmittedPayload,
  ScoreOverriddenPayload,
  VoteSubmittedPayload,
  CompetitorWithdrawnPayload,
  CompetitorRescuedPayload,
  SimulationResetPayload,
  StandingsEntry,
  JudgeLiveStatus,
} from '@competition-platform/shared';
import { validateCriteriaScores } from './score-validation';
// TODO: load from format registry — cypher-battles aggregation is hardcoded for MVP
import {
  aggregateCompetitorScores,
  aggregateCypherScore,
} from '@competition-platform/format-cypher-battles/scoring';
import { sumScores, type ScorePayload } from '@competition-platform/format-sdk';
import type { DatabaseService } from '../../modules/database/database.service';
import type { ICompetitionGateway } from '../../modules/websocket/competition-gateway.interface';
import { roundRobinAssign } from '../../modules/competition/domain/group-assigner';
import { generateBracket } from '../../modules/competition/domain/bracket-generator';
import {
  tallyMatchup,
  type VoteTally,
} from '../../modules/competition/domain/vote-tallier';
import { buildNextRound } from '../../modules/competition/domain/round-builder';
import { enforceRateLimit } from '../rate-limit';
import type { Db } from '../../modules/database/database.service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface MatchupOutcomeBroadcasts {
  matchupCompleted: MatchupCompletedPayload | null;
  matchupRevoteRequired: MatchupRevoteRequiredPayload | null;
  matchupTieResolutionRequired: MatchupTieResolutionRequiredPayload | null;
  bracketAdvanced: BracketAdvancedPayload | null;
  competitionCompleted: CompetitionCompletedPayload | null;
}

const EMPTY_BROADCASTS: MatchupOutcomeBroadcasts = {
  matchupCompleted: null,
  matchupRevoteRequired: null,
  matchupTieResolutionRequired: null,
  bracketAdvanced: null,
  competitionCompleted: null,
};

function emitMatchupBroadcasts(
  gateway: ICompetitionGateway,
  competitionId: string,
  broadcasts: MatchupOutcomeBroadcasts,
): void {
  if (broadcasts.matchupCompleted) {
    gateway.broadcastMatchupCompleted(
      competitionId,
      broadcasts.matchupCompleted,
    );
  }
  if (broadcasts.matchupRevoteRequired) {
    gateway.broadcastMatchupRevoteRequired(
      competitionId,
      broadcasts.matchupRevoteRequired,
    );
  }
  if (broadcasts.matchupTieResolutionRequired) {
    gateway.broadcastMatchupTieResolutionRequired(
      competitionId,
      broadcasts.matchupTieResolutionRequired,
    );
  }
  if (broadcasts.bracketAdvanced) {
    gateway.broadcastBracketAdvanced(competitionId, broadcasts.bracketAdvanced);
  }
  if (broadcasts.competitionCompleted) {
    gateway.broadcastCompetitionCompleted(
      competitionId,
      broadcasts.competitionCompleted,
    );
  }
}

async function nextEventSequence(
  tx: Tx,
  competitionId: string,
): Promise<number> {
  const [seqRow] = await tx
    .select({ maxSeq: max(events.sequence) })
    .from(events)
    .where(
      and(
        eq(events.aggregateId, competitionId),
        eq(events.aggregateType, 'competition'),
      ),
    );
  return (seqRow?.maxSeq ?? 0) + 1;
}

// Per-matchup advisory locks serialise outcome computation, but two distinct
// matchups completing concurrently in the same competition can still race on
// the events table sequence. Mirror submitVote's vote.submitted handling: map
// the sequence collision to INTERNAL_SERVER_ERROR so the client retries.
async function insertEventOrRetry(
  tx: Tx,
  values: typeof events.$inferInsert,
): Promise<void> {
  try {
    await tx.insert(events).values(values);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Concurrent submission conflict, please retry',
      });
    }
    throw err;
  }
}

async function maybeAdvanceRound(
  tx: Tx,
  args: {
    competitionId: string;
    justCompletedRound: number;
    organizerClerkId: string | null;
  },
): Promise<{
  bracketAdvanced: BracketAdvancedPayload | null;
  competitionCompleted: CompetitionCompletedPayload | null;
}> {
  const { competitionId, justCompletedRound, organizerClerkId } = args;

  // 1. Are there still unresolved non-bye matchups in this round?
  const roundRows = await tx
    .select({
      id: battleMatchups.id,
      bracketPosition: battleMatchups.bracketPosition,
      competitorAId: battleMatchups.competitorAId,
      competitorBId: battleMatchups.competitorBId,
      seedA: battleMatchups.seedA,
      seedB: battleMatchups.seedB,
      isBye: battleMatchups.isBye,
      winnerCompetitorId: battleMatchups.winnerCompetitorId,
      tieStatus: battleMatchups.tieStatus,
    })
    .from(battleMatchups)
    .where(
      and(
        eq(battleMatchups.competitionId, competitionId),
        eq(battleMatchups.roundNumber, justCompletedRound),
      ),
    )
    .orderBy(asc(battleMatchups.bracketPosition));

  const unresolved = roundRows.filter((r) => r.winnerCompetitorId === null);
  if (unresolved.length > 0) {
    return { bracketAdvanced: null, competitionCompleted: null };
  }

  const winners = roundRows.map((r) => ({
    bracketPosition: r.bracketPosition,
    winnerCompetitorId: r.winnerCompetitorId as string,
  }));

  // 2. Final round? Only one matchup means this winner is the champion.
  if (roundRows.length === 1) {
    const champion = roundRows[0].winnerCompetitorId as string;
    await tx
      .update(competitions)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(competitions.id, competitionId));

    const seq = await nextEventSequence(tx, competitionId);
    const completedAt = new Date().toISOString();
    const payload: CompetitionCompletedPayload = {
      competitionId,
      championCompetitorId: champion,
      completedAt,
    };
    await insertEventOrRetry(tx, {
      type: 'competition.completed',
      aggregateId: competitionId,
      aggregateType: 'competition',
      payload: payload as unknown as Record<string, unknown>,
      sequence: seq,
      createdBy: organizerClerkId ?? 'system',
    });
    return { bracketAdvanced: null, competitionCompleted: payload };
  }

  // 3. Otherwise, materialize round N+1 from these winners.
  const seedByCompetitorId = new Map<string, number>();
  for (const r of roundRows) {
    const winnerId = r.winnerCompetitorId;
    if (winnerId === null) continue;
    if (winnerId === r.competitorAId && r.seedA !== null) {
      seedByCompetitorId.set(winnerId, r.seedA);
    } else if (winnerId === r.competitorBId && r.seedB !== null) {
      seedByCompetitorId.set(winnerId, r.seedB);
    }
  }

  const nextRound = buildNextRound({
    priorRoundNumber: justCompletedRound,
    winners,
    seedByCompetitorId,
  });

  // Defensive: buildNextRound can short-circuit (odd winners → silently
  // skipped pairing). Don't broadcast a misleading bracket.advanced with
  // an empty matchups array.
  if (nextRound.length === 0) {
    return { bracketAdvanced: null, competitionCompleted: null };
  }

  const newRoundNumber = justCompletedRound + 1;
  let conflictHit = false;
  for (const m of nextRound) {
    try {
      await tx.insert(battleMatchups).values({
        competitionId,
        roundNumber: m.roundNumber,
        bracketPosition: m.bracketPosition,
        competitorAId: m.competitorAId,
        competitorBId: m.competitorBId,
        seedA: m.seedA,
        seedB: m.seedB,
        isBye: false,
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== '23505') throw err;
      // Idempotent on uq_battle_matchups_position. Defer to a single re-read
      // below so the broadcast reflects DB truth, not the in-memory plan.
      conflictHit = true;
    }
  }

  let matchupSnapshots: BracketMatchupSnapshot[];
  if (conflictHit) {
    const existing = await tx
      .select({
        roundNumber: battleMatchups.roundNumber,
        bracketPosition: battleMatchups.bracketPosition,
        competitorAId: battleMatchups.competitorAId,
        competitorBId: battleMatchups.competitorBId,
        seedA: battleMatchups.seedA,
        seedB: battleMatchups.seedB,
        isBye: battleMatchups.isBye,
      })
      .from(battleMatchups)
      .where(
        and(
          eq(battleMatchups.competitionId, competitionId),
          eq(battleMatchups.roundNumber, newRoundNumber),
        ),
      )
      .orderBy(asc(battleMatchups.bracketPosition));
    matchupSnapshots = existing.map((r) => ({
      roundNumber: r.roundNumber,
      bracketPosition: r.bracketPosition,
      competitorAId: r.competitorAId,
      competitorBId: r.competitorBId,
      seedA: r.seedA,
      seedB: r.seedB,
      isBye: r.isBye,
    }));
  } else {
    matchupSnapshots = nextRound.map((m) => ({
      roundNumber: m.roundNumber,
      bracketPosition: m.bracketPosition,
      competitorAId: m.competitorAId,
      competitorBId: m.competitorBId,
      seedA: m.seedA,
      seedB: m.seedB,
      isBye: false,
    }));
  }

  const seq = await nextEventSequence(tx, competitionId);
  const payload: BracketAdvancedPayload = {
    competitionId,
    roundNumber: newRoundNumber,
    matchups: matchupSnapshots,
    advancedAt: new Date().toISOString(),
  };
  await insertEventOrRetry(tx, {
    type: 'bracket.advanced',
    aggregateId: competitionId,
    aggregateType: 'competition',
    payload: payload as unknown as Record<string, unknown>,
    sequence: seq,
    createdBy: organizerClerkId ?? 'system',
  });

  return { bracketAdvanced: payload, competitionCompleted: null };
}

async function processMatchupOutcome(
  tx: Tx,
  args: {
    competitionId: string;
    matchupId: string;
    organizerClerkId: string | null;
  },
): Promise<MatchupOutcomeBroadcasts> {
  const { competitionId, matchupId, organizerClerkId } = args;

  // Concurrency guard: serialise outcome computation per matchup so two
  // simultaneous votes can't both observe "all votes in" and double-write.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`matchup-outcome:${matchupId}`}))`,
  );

  const [matchup] = await tx
    .select({
      id: battleMatchups.id,
      competitionId: battleMatchups.competitionId,
      roundNumber: battleMatchups.roundNumber,
      bracketPosition: battleMatchups.bracketPosition,
      competitorAId: battleMatchups.competitorAId,
      competitorBId: battleMatchups.competitorBId,
      isBye: battleMatchups.isBye,
      winnerCompetitorId: battleMatchups.winnerCompetitorId,
      tieStatus: battleMatchups.tieStatus,
      revoteCount: battleMatchups.revoteCount,
    })
    .from(battleMatchups)
    .where(eq(battleMatchups.id, matchupId));
  if (!matchup) return EMPTY_BROADCASTS;
  // Defense-in-depth: callers verify ownership, but the helper is now used in
  // three places — cross-check that the matchup we loaded actually belongs to
  // the claimed competition before mutating its state.
  if (matchup.competitionId !== competitionId) return EMPTY_BROADCASTS;
  if (matchup.isBye) return EMPTY_BROADCASTS;
  if (matchup.winnerCompetitorId !== null) return EMPTY_BROADCASTS;
  if (matchup.tieStatus === 'organizer_decision_pending') {
    return EMPTY_BROADCASTS;
  }

  const competitorAId = matchup.competitorAId;
  const competitorBId = matchup.competitorBId;
  if (!competitorAId || !competitorBId) return EMPTY_BROADCASTS;

  // Aggregate votes for this matchup.
  const voteRows = await tx
    .select({ vote: votes.vote })
    .from(votes)
    .where(eq(votes.matchupId, matchupId));
  const tally: VoteTally = { player1: 0, player2: 0, tie: 0, total: 0 };
  for (const v of voteRows) {
    if (v.vote === 'player1') tally.player1 += 1;
    else if (v.vote === 'player2') tally.player2 += 1;
    else if (v.vote === 'tie') tally.tie += 1;
    tally.total += 1;
  }

  // Expected = number of judge sessions for this competition.
  const expectedRow = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(judgeSessions)
    .where(eq(judgeSessions.competitionId, competitionId));
  const expectedVotes = expectedRow[0]?.count ?? 0;
  if (expectedVotes <= 0) return EMPTY_BROADCASTS;

  const outcome = tallyMatchup({
    tally,
    expectedVotes,
    competitorAId,
    competitorBId,
  });

  if (outcome.kind === 'pending') return EMPTY_BROADCASTS;

  if (outcome.kind === 'winner') {
    const completedAt = new Date();
    await tx
      .update(battleMatchups)
      .set({
        winnerCompetitorId: outcome.winnerCompetitorId,
        completedAt,
      })
      .where(eq(battleMatchups.id, matchupId));

    const seq = await nextEventSequence(tx, competitionId);
    const payload: MatchupCompletedPayload = {
      competitionId,
      matchupId,
      roundNumber: matchup.roundNumber,
      bracketPosition: matchup.bracketPosition,
      winnerCompetitorId: outcome.winnerCompetitorId,
      tally,
      advancedFromTie: false,
      organizerDecisionReason: null,
      completedAt: completedAt.toISOString(),
    };
    await insertEventOrRetry(tx, {
      type: 'matchup.completed',
      aggregateId: competitionId,
      aggregateType: 'competition',
      payload: payload as unknown as Record<string, unknown>,
      sequence: seq,
      createdBy: organizerClerkId ?? 'system',
    });

    const adv = await maybeAdvanceRound(tx, {
      competitionId,
      justCompletedRound: matchup.roundNumber,
      organizerClerkId,
    });

    return {
      matchupCompleted: payload,
      matchupRevoteRequired: null,
      matchupTieResolutionRequired: null,
      bracketAdvanced: adv.bracketAdvanced,
      competitionCompleted: adv.competitionCompleted,
    };
  }

  // Tie path — branch on competition's tieBreakingRule.
  const [comp] = await tx
    .select({ tieBreakingRule: competitions.tieBreakingRule })
    .from(competitions)
    .where(eq(competitions.id, competitionId));
  const rule = comp?.tieBreakingRule ?? 're_vote';
  const detectedAt = new Date().toISOString();

  if (rule === 're_vote') {
    await tx.delete(votes).where(eq(votes.matchupId, matchupId));
    const newRevoteCount = (matchup.revoteCount ?? 0) + 1;
    await tx
      .update(battleMatchups)
      .set({ revoteCount: newRevoteCount })
      .where(eq(battleMatchups.id, matchupId));

    const seq = await nextEventSequence(tx, competitionId);
    const payload: MatchupRevoteRequiredPayload = {
      competitionId,
      matchupId,
      revoteCount: newRevoteCount,
      tally,
      detectedAt,
    };
    await insertEventOrRetry(tx, {
      type: 'matchup.revote-required',
      aggregateId: competitionId,
      aggregateType: 'competition',
      payload: payload as unknown as Record<string, unknown>,
      sequence: seq,
      createdBy: organizerClerkId ?? 'system',
    });
    return {
      ...EMPTY_BROADCASTS,
      matchupRevoteRequired: payload,
    };
  }

  // organizer_decision
  await tx
    .update(battleMatchups)
    .set({ tieStatus: 'organizer_decision_pending' })
    .where(eq(battleMatchups.id, matchupId));

  const seq = await nextEventSequence(tx, competitionId);
  const payload: MatchupTieResolutionRequiredPayload = {
    competitionId,
    matchupId,
    tally,
    detectedAt,
  };
  await insertEventOrRetry(tx, {
    type: 'matchup.tie-resolution-required',
    aggregateId: competitionId,
    aggregateType: 'competition',
    payload: payload as unknown as Record<string, unknown>,
    sequence: seq,
    createdBy: organizerClerkId ?? 'system',
  });
  return {
    ...EMPTY_BROADCASTS,
    matchupTieResolutionRequired: payload,
  };
}

const PUBLIC_RL = { windowMs: 60_000, max: 60 };
const SUBMIT_RL = { windowMs: 60_000, max: 30 };

function generateJudgeToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

type StandingsRow = {
  competitorId: string;
  judgeSessionId: string;
  criteriaScores: unknown;
  competitorName: string;
  participantId: string;
};

const SCORE_VALUE_PATTERN = /^\d+\.\d{2}$/;

// Runtime guard against malformed jsonb. The score insert is Zod-validated,
// but the jsonb column has no CHECK constraint — a corrupted row from a bad
// migration or direct SQL would otherwise silently produce "NaN" totalScore
// on the public leaderboard. Any row with a non-conforming entry is dropped.
function sanitizeCriteriaScores(
  raw: unknown,
): { criterionId: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { criterionId: string; value: string }[] = [];
  for (const entry of raw) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { criterionId?: unknown }).criterionId === 'string' &&
      typeof (entry as { value?: unknown }).value === 'string' &&
      SCORE_VALUE_PATTERN.test((entry as { value: string }).value)
    ) {
      out.push({
        criterionId: (entry as { criterionId: string }).criterionId,
        value: (entry as { value: string }).value,
      });
    }
  }
  return out;
}

// Optional enrichment maps for Story 6.1 public-standings view.
interface StandingsEnrichment {
  criteriaById: Map<string, { name: string }>;
  judgeGroups: Map<string, { groupIndex: number | null; label: string }>;
}

async function fetchStandingsEnrichment(
  db: DatabaseService,
  competitionId: string,
): Promise<StandingsEnrichment> {
  const [criteriaRows, judgeRows] = await Promise.all([
    db.db
      .select({ id: evaluationCriteria.id, name: evaluationCriteria.name })
      .from(evaluationCriteria)
      .where(eq(evaluationCriteria.competitionId, competitionId)),
    db.db
      .select({
        id: judgeSessions.id,
        groupIndex: judgeSessions.groupIndex,
        label: judgeSessions.label,
      })
      .from(judgeSessions)
      .where(eq(judgeSessions.competitionId, competitionId)),
  ]);
  return {
    criteriaById: new Map(criteriaRows.map((c) => [c.id, { name: c.name }])),
    judgeGroups: new Map(
      judgeRows.map((j) => [
        j.id,
        { groupIndex: j.groupIndex, label: j.label },
      ]),
    ),
  };
}

async function broadcastEnrichedStandings(
  db: DatabaseService,
  gateway: ICompetitionGateway,
  competitionId: string,
  source: string,
) {
  try {
    const [updatedRows, enrichment] = await Promise.all([
      db.db
        .select({
          competitorId: scores.competitorId,
          judgeSessionId: scores.judgeSessionId,
          criteriaScores: scores.criteriaScores,
          competitorName: competitors.name,
          participantId: competitors.participantId,
        })
        .from(scores)
        .innerJoin(competitors, eq(scores.competitorId, competitors.id))
        .where(
          and(
            eq(scores.competitionId, competitionId),
            eq(competitors.status, 'active'),
          ),
        ),
      fetchStandingsEnrichment(db, competitionId),
    ]);
    gateway.broadcastStandingsUpdated(
      competitionId,
      computeStandings(updatedRows, enrichment),
    );
  } catch (err) {
    console.warn(
      `[${source}] standings broadcast failed for ${competitionId}: ${String(err)}`,
    );
  }
}

function computeStandings(
  scoreRows: StandingsRow[],
  enrichment?: StandingsEnrichment,
): StandingsEntry[] {
  const byCompetitor = new Map<
    string,
    { name: string; participantId: string; payloads: ScorePayload[] }
  >();

  for (const row of scoreRows) {
    const validScores = sanitizeCriteriaScores(row.criteriaScores);
    // A row with zero valid scores contributes 0.00 to the judge total, which
    // aggregates cleanly. This is correct per `sumScores([])` semantics.
    const existing = byCompetitor.get(row.competitorId) ?? {
      name: row.competitorName,
      participantId: row.participantId,
      payloads: [],
    };
    existing.payloads.push({
      judgeId: row.judgeSessionId,
      competitorId: row.competitorId,
      roundId: '',
      scores: validScores,
      idempotencyKey: '',
    });
    byCompetitor.set(row.competitorId, existing);
  }

  const unsorted: Omit<StandingsEntry, 'rank'>[] = [];
  for (const [
    competitorId,
    { name, participantId, payloads },
  ] of byCompetitor) {
    const result = aggregateCompetitorScores(payloads);
    const entry: Omit<StandingsEntry, 'rank'> = {
      competitorId,
      competitorName: name,
      participantId,
      totalScore: result.totalScore,
      scoresByJudge: result.scoresByJudge,
      judgeCount: payloads.length,
    };

    if (enrichment) {
      // Resolve criterion names; drop entries whose criterionId is no longer
      // in the current evaluation_criteria table (defensive against renames).
      const criteriaBreakdown = (result.criteriaBreakdown ?? [])
        .map((b) => {
          const def = enrichment.criteriaById.get(b.criterionId);
          if (!def) return null;
          return {
            criterionId: b.criterionId,
            criterionName: def.name,
            total: b.total,
            judgeCount: b.judgeCount,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);

      // Group breakdown: sum the per-judge totals from scoresByJudge by the
      // judge's groupIndex. Null groupIndex falls into a synthetic "Ungrouped"
      // bucket — happens for organizer-judge sessions in solo mode.
      const groupSums = new Map<
        number | null,
        { total: string[]; label: string; judgeCount: number }
      >();
      for (const [judgeSessionId, judgeTotal] of Object.entries(
        result.scoresByJudge,
      )) {
        const meta = enrichment.judgeGroups.get(judgeSessionId);
        const groupIndex = meta?.groupIndex ?? null;
        const label =
          meta?.groupIndex !== null && meta?.groupIndex !== undefined
            ? `Group ${String.fromCharCode(65 + meta.groupIndex)}`
            : 'Ungrouped';
        let bucket = groupSums.get(groupIndex);
        if (bucket === undefined) {
          bucket = { total: [], label, judgeCount: 0 };
          groupSums.set(groupIndex, bucket);
        }
        bucket.total.push(judgeTotal);
        bucket.judgeCount += 1;
      }
      const groupBreakdown = Array.from(groupSums.entries())
        .map(([groupIndex, b]) => ({
          groupIndex: groupIndex ?? -1,
          groupLabel: b.label,
          total: sumScores(b.total),
          judgeCount: b.judgeCount,
        }))
        .sort((a, b) => a.groupIndex - b.groupIndex);

      entry.criteriaBreakdown = criteriaBreakdown;
      entry.groupBreakdown = groupBreakdown;
    }

    unsorted.push(entry);
  }

  unsorted.sort((a, b) => parseFloat(b.totalScore) - parseFloat(a.totalScore));
  return unsorted.map((entry, i) => ({ ...entry, rank: i + 1 }));
}

export function createTournamentRouter(
  db: DatabaseService,
  gateway: ICompetitionGateway,
) {
  return t.router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
        );
        return tx
          .select({
            id: competitions.id,
            name: competitions.name,
            description: competitions.description,
            date: competitions.date,
            status: competitions.status,
            participantFormat: competitions.participantFormat,
            isSimulation: competitions.isSimulation,
            createdAt: competitions.createdAt,
          })
          .from(competitions)
          .where(eq(competitions.organizerClerkId, ctx.userId))
          .orderBy(desc(competitions.createdAt));
      });
    }),

    create: protectedProcedure
      .input(createCompetitionSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [created] = await tx
            .insert(competitions)
            .values({
              organizerClerkId: ctx.userId,
              name: input.name,
              description: input.description ?? null,
              date: input.date ? new Date(input.date) : null,
            })
            .returning({
              id: competitions.id,
              name: competitions.name,
              description: competitions.description,
              date: competitions.date,
              status: competitions.status,
              createdAt: competitions.createdAt,
            });
          return created;
        });
      }),

    createSimulation: protectedProcedure
      .input(createSimulationSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          let sourceComp:
            | {
                participantFormat: typeof competitions.$inferSelect.participantFormat;
                cypherJudgeCount: typeof competitions.$inferSelect.cypherJudgeCount;
                cypherGroupCount: typeof competitions.$inferSelect.cypherGroupCount;
                advancementThreshold: typeof competitions.$inferSelect.advancementThreshold;
                battlesJudgeCount: typeof competitions.$inferSelect.battlesJudgeCount;
                tieBreakingRule: typeof competitions.$inferSelect.tieBreakingRule;
              }
            | undefined;

          if (input.sourceCompetitionId) {
            const [fetched] = await tx
              .select({
                id: competitions.id,
                participantFormat: competitions.participantFormat,
                cypherJudgeCount: competitions.cypherJudgeCount,
                cypherGroupCount: competitions.cypherGroupCount,
                advancementThreshold: competitions.advancementThreshold,
                battlesJudgeCount: competitions.battlesJudgeCount,
                tieBreakingRule: competitions.tieBreakingRule,
              })
              .from(competitions)
              .where(eq(competitions.id, input.sourceCompetitionId));
            if (!fetched) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Source competition not found',
              });
            }
            sourceComp = fetched;
          }

          const [created] = await tx
            .insert(competitions)
            .values({
              organizerClerkId: ctx.userId,
              name: input.name,
              description: input.description ?? null,
              date: input.date ? new Date(input.date) : null,
              isSimulation: true,
              ...(sourceComp
                ? {
                    participantFormat: sourceComp.participantFormat,
                    cypherJudgeCount: sourceComp.cypherJudgeCount,
                    cypherGroupCount: sourceComp.cypherGroupCount,
                    advancementThreshold: sourceComp.advancementThreshold,
                    battlesJudgeCount: sourceComp.battlesJudgeCount,
                    tieBreakingRule: sourceComp.tieBreakingRule,
                  }
                : {}),
            })
            .returning({
              id: competitions.id,
              name: competitions.name,
              description: competitions.description,
              date: competitions.date,
              status: competitions.status,
              isSimulation: competitions.isSimulation,
              createdAt: competitions.createdAt,
            });

          let criteriaCount = 0;
          if (input.sourceCompetitionId && sourceComp) {
            const sourceCriteria = await tx
              .select()
              .from(evaluationCriteria)
              .where(
                eq(evaluationCriteria.competitionId, input.sourceCompetitionId),
              )
              .orderBy(evaluationCriteria.displayOrder);
            if (sourceCriteria.length > 0) {
              await tx.insert(evaluationCriteria).values(
                sourceCriteria.map((c, i) => ({
                  competitionId: created.id,
                  name: c.name,
                  minScore: c.minScore,
                  maxScore: c.maxScore,
                  precision: c.precision,
                  displayOrder: i,
                })),
              );
              criteriaCount = sourceCriteria.length;
            }
          }

          let participantCount = 0;
          if (input.mockParticipantCount) {
            const padWidth = input.mockParticipantCount >= 100 ? 3 : 2;
            const mockCompetitors = Array.from(
              { length: input.mockParticipantCount },
              (_, i) => {
                const num = String(i + 1).padStart(padWidth, '0');
                return {
                  competitionId: created.id,
                  participantId: `SIM-${num}`,
                  name: `Competitor ${num}`,
                };
              },
            );
            await tx.insert(competitors).values(mockCompetitors);
            participantCount = input.mockParticipantCount;
          }

          return { ...created, participantCount, criteriaCount };
        });
      }),

    listCriteria: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          return tx
            .select()
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, input.competitionId))
            .orderBy(evaluationCriteria.displayOrder);
        });
      }),

    addCriterion: protectedProcedure
      .input(addCriterionSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          const [{ maxOrder }] = await tx
            .select({ maxOrder: max(evaluationCriteria.displayOrder) })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, input.competitionId));
          const nextOrder = (maxOrder ?? -1) + 1;
          const [created] = await tx
            .insert(evaluationCriteria)
            .values({
              competitionId: input.competitionId,
              name: input.name,
              minScore: parseFloat(input.minScore).toFixed(2),
              maxScore: parseFloat(input.maxScore).toFixed(2),
              displayOrder: nextOrder,
            })
            .returning();
          return created;
        });
      }),

    removeCriterion: protectedProcedure
      .input(z.object({ criterionId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const result = await tx.execute(
            sql`DELETE FROM evaluation_criteria
                WHERE id = ${input.criterionId}
                  AND competition_id IN (
                    SELECT id FROM competitions
                    WHERE organizer_clerk_id = ${ctx.userId}
                  )
                RETURNING id`,
          );
          if (result.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Criterion not found',
            });
          }
        });
      }),

    listCompetitionsWithCriteria: protectedProcedure.query(async ({ ctx }) => {
      return db.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
        );
        return tx
          .selectDistinct({
            id: competitions.id,
            name: competitions.name,
            // createdAt must be in the projection because Postgres rejects
            // SELECT DISTINCT … ORDER BY <expr> when <expr> isn't selected.
            createdAt: competitions.createdAt,
          })
          .from(competitions)
          .innerJoin(
            evaluationCriteria,
            eq(evaluationCriteria.competitionId, competitions.id),
          )
          .where(eq(competitions.organizerClerkId, ctx.userId))
          .orderBy(desc(competitions.createdAt));
      });
    }),

    copyCriteriaTemplate: protectedProcedure
      .input(copyCriteriaTemplateSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [source] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.sourceCompetitionId));
          if (!source) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Source competition not found',
            });
          }
          const [target] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.targetCompetitionId));
          if (!target) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Target competition not found',
            });
          }
          const sourceCriteria = await tx
            .select()
            .from(evaluationCriteria)
            .where(
              eq(evaluationCriteria.competitionId, input.sourceCompetitionId),
            )
            .orderBy(evaluationCriteria.displayOrder);
          if (sourceCriteria.length === 0) return { copied: 0 };
          const [{ maxOrder }] = await tx
            .select({ maxOrder: max(evaluationCriteria.displayOrder) })
            .from(evaluationCriteria)
            .where(
              eq(evaluationCriteria.competitionId, input.targetCompetitionId),
            );
          const startOrder = (maxOrder ?? -1) + 1;
          await tx.insert(evaluationCriteria).values(
            sourceCriteria.map((c, i) => ({
              competitionId: input.targetCompetitionId,
              name: c.name,
              minScore: c.minScore,
              maxScore: c.maxScore,
              precision: c.precision,
              displayOrder: startOrder + i,
            })),
          );
          return { copied: sourceCriteria.length };
        });
      }),

    getCompetition: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              name: competitions.name,
              status: competitions.status,
              participantFormat: competitions.participantFormat,
              cypherJudgeCount: competitions.cypherJudgeCount,
              cypherGroupCount: competitions.cypherGroupCount,
              advancementThreshold: competitions.advancementThreshold,
              battlesJudgeCount: competitions.battlesJudgeCount,
              tieBreakingRule: competitions.tieBreakingRule,
              cypherCompletedAt: competitions.cypherCompletedAt,
              soloMode: competitions.soloMode,
              isSimulation: competitions.isSimulation,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          return comp;
        });
      }),

    listParticipants: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          return tx
            .select()
            .from(competitors)
            .where(eq(competitors.competitionId, input.competitionId))
            .orderBy(asc(competitors.createdAt));
        });
      }),

    addParticipant: protectedProcedure
      .input(addParticipantSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          const [existing] = await tx
            .select({ id: competitors.id })
            .from(competitors)
            .where(
              and(
                eq(competitors.competitionId, input.competitionId),
                eq(competitors.participantId, input.participantId),
              ),
            );
          if (existing) {
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                'A participant with this ID already exists in this competition',
            });
          }
          try {
            const [created] = await tx
              .insert(competitors)
              .values({
                competitionId: input.competitionId,
                participantId: input.participantId,
                name: input.name,
              })
              .returning();
            return created;
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message:
                  'A participant with this ID already exists in this competition',
              });
            }
            throw err;
          }
        });
      }),

    addPair: protectedProcedure
      .input(addPairSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              participantFormat: competitions.participantFormat,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (comp.participantFormat !== 'pairs') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'addPair is only valid when participantFormat is "pairs"',
            });
          }
          if (input.leader.participantId === input.follower.participantId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Leader and follower must have different IDs',
            });
          }
          const conflicts = await tx
            .select({ participantId: competitors.participantId })
            .from(competitors)
            .where(
              and(
                eq(competitors.competitionId, input.competitionId),
                inArray(competitors.participantId, [
                  input.leader.participantId,
                  input.follower.participantId,
                ]),
              ),
            );
          if (conflicts.length > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Participant ID already exists: ${conflicts.map((c) => c.participantId).join(', ')}`,
            });
          }
          try {
            const [leaderRow] = await tx
              .insert(competitors)
              .values({
                competitionId: input.competitionId,
                participantId: input.leader.participantId,
                name: input.leader.name,
                role: 'leader',
              })
              .returning();
            const [followerRow] = await tx
              .insert(competitors)
              .values({
                competitionId: input.competitionId,
                participantId: input.follower.participantId,
                name: input.follower.name,
                role: 'follower',
                partnerId: leaderRow.id,
              })
              .returning();
            const [updatedLeader] = await tx
              .update(competitors)
              .set({ partnerId: followerRow.id })
              .where(eq(competitors.id, leaderRow.id))
              .returning();
            return { leader: updatedLeader, follower: followerRow };
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'A participant with this ID already exists',
              });
            }
            throw err;
          }
        });
      }),

    bulkAddParticipants: protectedProcedure
      .input(bulkAddParticipantsSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              participantFormat: competitions.participantFormat,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (comp.participantFormat !== 'individual') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'bulkAddParticipants is only valid for individual format — use bulkAddPairs for pairs',
            });
          }
          const ids = input.rows.map((r) => r.participantId);
          if (new Set(ids).size !== ids.length) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Duplicate participantId within the batch',
            });
          }
          const conflicts = await tx
            .select({ participantId: competitors.participantId })
            .from(competitors)
            .where(
              and(
                eq(competitors.competitionId, input.competitionId),
                inArray(competitors.participantId, ids),
              ),
            );
          if (conflicts.length > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Participant ID already exists: ${conflicts.map((c) => c.participantId).join(', ')}`,
            });
          }
          const inserted = await tx
            .insert(competitors)
            .values(
              input.rows.map((r) => ({
                competitionId: input.competitionId,
                participantId: r.participantId,
                name: r.name,
              })),
            )
            .returning();
          return { inserted: inserted.length };
        });
      }),

    bulkAddPairs: protectedProcedure
      .input(bulkAddPairsSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              participantFormat: competitions.participantFormat,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (comp.participantFormat !== 'pairs') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'bulkAddPairs is only valid for pairs format — use bulkAddParticipants for individual',
            });
          }
          const ids = input.pairs.flatMap((p) => [
            p.leader.participantId,
            p.follower.participantId,
          ]);
          if (new Set(ids).size !== ids.length) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Duplicate participantId within the batch',
            });
          }
          const conflicts = await tx
            .select({ participantId: competitors.participantId })
            .from(competitors)
            .where(
              and(
                eq(competitors.competitionId, input.competitionId),
                inArray(competitors.participantId, ids),
              ),
            );
          if (conflicts.length > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Participant ID already exists: ${conflicts.map((c) => c.participantId).join(', ')}`,
            });
          }
          let createdPairs = 0;
          for (const pair of input.pairs) {
            const [leaderRow] = await tx
              .insert(competitors)
              .values({
                competitionId: input.competitionId,
                participantId: pair.leader.participantId,
                name: pair.leader.name,
                role: 'leader',
              })
              .returning();
            const [followerRow] = await tx
              .insert(competitors)
              .values({
                competitionId: input.competitionId,
                participantId: pair.follower.participantId,
                name: pair.follower.name,
                role: 'follower',
                partnerId: leaderRow.id,
              })
              .returning();
            await tx
              .update(competitors)
              .set({ partnerId: followerRow.id })
              .where(eq(competitors.id, leaderRow.id));
            createdPairs += 1;
          }
          return { inserted: createdPairs };
        });
      }),

    removeParticipant: protectedProcedure
      .input(z.object({ competitorDbId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const result = await tx.execute(
            sql`DELETE FROM competitors
                WHERE id = ${input.competitorDbId}
                  AND competition_id IN (
                    SELECT id FROM competitions
                    WHERE organizer_clerk_id = ${ctx.userId}
                  )
                RETURNING id`,
          );
          if (result.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Participant not found',
            });
          }
        });
      }),

    setParticipantFormat: protectedProcedure
      .input(setParticipantFormatSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          const [updated] = await tx
            .update(competitions)
            .set({ participantFormat: input.format })
            .where(eq(competitions.id, input.competitionId))
            .returning({
              id: competitions.id,
              participantFormat: competitions.participantFormat,
            });
          return updated;
        });
      }),

    setJudgeConfig: protectedProcedure
      .input(setJudgeConfigSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          const [updated] = await tx
            .update(competitions)
            .set({
              cypherJudgeCount: input.cypherJudgeCount,
              cypherGroupCount: input.cypherGroupCount,
              advancementThreshold: input.advancementThreshold,
              battlesJudgeCount: input.battlesJudgeCount,
              tieBreakingRule: input.tieBreakingRule,
              updatedAt: new Date(),
            })
            .where(eq(competitions.id, input.competitionId))
            .returning({
              id: competitions.id,
              cypherJudgeCount: competitions.cypherJudgeCount,
              cypherGroupCount: competitions.cypherGroupCount,
              advancementThreshold: competitions.advancementThreshold,
              battlesJudgeCount: competitions.battlesJudgeCount,
              tieBreakingRule: competitions.tieBreakingRule,
            });
          return updated;
        });
      }),

    setSoloMode: protectedProcedure
      .input(setSoloModeSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              isSimulation: competitions.isSimulation,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (comp.isSimulation) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Solo mode is not applicable to simulation competitions',
              cause: { errorCode: ErrorCodes.SIMULATION_NOT_ENABLED },
            });
          }
          if (comp.status !== 'draft') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Solo mode can only be toggled before the competition starts',
              cause: { errorCode: ErrorCodes.SOLO_MODE_LOCKED },
            });
          }
          const [updated] = await tx
            .update(competitions)
            .set({
              soloMode: input.soloMode,
              updatedAt: new Date(),
            })
            .where(eq(competitions.id, input.competitionId))
            .returning({
              id: competitions.id,
              soloMode: competitions.soloMode,
            });
          return updated;
        });
      }),

    resetSimulation: protectedProcedure
      .input(resetSimulationSchema)
      .mutation(async ({ ctx, input }) => {
        let broadcastPayload: SimulationResetPayload | null = null;
        const result = await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Ownership SELECT.
          const [comp] = await tx
            .select({
              id: competitions.id,
              isSimulation: competitions.isSimulation,
              status: competitions.status,
            })
            .from(competitions)
            .where(
              and(
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (!comp.isSimulation) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Reset is only available for simulation competitions',
              cause: { errorCode: ErrorCodes.SIMULATION_NOT_ENABLED },
            });
          }

          // 2. Advisory lock — serialize concurrent resets.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`sim-reset-${input.competitionId}`}))`,
          );

          // 3. DELETE run-state rows in cascade-safe order. RETURNING id for
          // the audit event.
          const deletedVotes = await tx
            .delete(votes)
            .where(eq(votes.competitionId, input.competitionId))
            .returning({ id: votes.id });
          const deletedScores = await tx
            .delete(scores)
            .where(eq(scores.competitionId, input.competitionId))
            .returning({ id: scores.id });
          const deletedMatchups = await tx
            .delete(battleMatchups)
            .where(eq(battleMatchups.competitionId, input.competitionId))
            .returning({ id: battleMatchups.id });
          const deletedAssignments = await tx
            .delete(competitorGroupAssignments)
            .where(
              eq(competitorGroupAssignments.competitionId, input.competitionId),
            )
            .returning({ id: competitorGroupAssignments.id });

          // 4. Reset competition to draft.
          await tx
            .update(competitions)
            .set({
              status: 'draft',
              cypherCompletedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(competitions.id, input.competitionId));

          // 5. Append simulation.reset event (audit trail — AC #5).
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          const payload: SimulationResetPayload = {
            competitionId: input.competitionId,
            resetAt: new Date().toISOString(),
            scoresDeleted: deletedScores.length,
            votesDeleted: deletedVotes.length,
            matchupsDeleted: deletedMatchups.length,
            groupAssignmentsDeleted: deletedAssignments.length,
          };
          try {
            await tx.insert(events).values({
              type: 'simulation.reset',
              aggregateId: input.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: ctx.userId,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent simulation reset, please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;
          return payload;
        });

        if (broadcastPayload !== null) {
          gateway.broadcastSimulationReset(
            input.competitionId,
            broadcastPayload,
          );
        }
        return result;
      }),

    listSimulationResetEvents: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              isSimulation: competitions.isSimulation,
            })
            .from(competitions)
            .where(
              and(
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (!comp.isSimulation) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Not a simulation competition',
              cause: { errorCode: ErrorCodes.SIMULATION_NOT_ENABLED },
            });
          }
          const rows = await tx
            .select({
              payload: events.payload,
              createdAt: events.createdAt,
            })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
                eq(events.type, 'simulation.reset'),
              ),
            )
            .orderBy(desc(events.createdAt));
          return rows.map((r) => ({
            ...(r.payload as SimulationResetPayload),
            createdAt: r.createdAt.toISOString(),
          }));
        });
      }),

    listSimulatedJudgeSessions: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({
              id: competitions.id,
              isSimulation: competitions.isSimulation,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          if (!comp.isSimulation) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Not a simulation competition',
              cause: { errorCode: ErrorCodes.SIMULATION_NOT_ENABLED },
            });
          }
          return tx
            .select({
              id: judgeSessions.id,
              label: judgeSessions.label,
              groupIndex: judgeSessions.groupIndex,
            })
            .from(judgeSessions)
            .where(
              and(
                eq(judgeSessions.competitionId, input.competitionId),
                like(judgeSessions.label, 'Sim Judge%'),
              ),
            )
            .orderBy(asc(judgeSessions.label));
        });
      }),

    generateJudgeLinks: protectedProcedure
      .input(generateJudgeLinksSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          const existing = await tx
            .select({ id: judgeSessions.id })
            .from(judgeSessions)
            .where(eq(judgeSessions.competitionId, input.competitionId));
          const startLabel = existing.length + 1;
          const tokens = Array.from({ length: input.count }, (_, i) => {
            const { raw, hash } = generateJudgeToken();
            return { raw, hash, label: `Judge ${startLabel + i}` };
          });
          const inserted = await tx
            .insert(judgeSessions)
            .values(
              tokens.map((tk) => ({
                competitionId: input.competitionId,
                tokenHash: tk.hash,
                label: tk.label,
                createdBy: ctx.userId,
              })),
            )
            .returning({
              id: judgeSessions.id,
              label: judgeSessions.label,
              createdAt: judgeSessions.createdAt,
            });
          return inserted.map((row, i) => ({
            id: row.id,
            label: row.label,
            token: tokens[i].raw,
            createdAt: row.createdAt.toISOString(),
          }));
        });
      }),

    listJudgeLinks: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }
          return tx
            .select({
              id: judgeSessions.id,
              label: judgeSessions.label,
              createdAt: judgeSessions.createdAt,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.competitionId, input.competitionId))
            .orderBy(asc(judgeSessions.createdAt));
        });
      }),

    revokeJudgeLink: protectedProcedure
      .input(z.object({ judgeSessionId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );
          const result = await tx.execute(
            sql`DELETE FROM judge_sessions
                WHERE id = ${input.judgeSessionId}
                  AND competition_id IN (
                    SELECT id FROM competitions WHERE organizer_clerk_id = ${ctx.userId}
                  )
                RETURNING id`,
          );
          if (result.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Judge link not found',
            });
          }
        });
      }),

    validateJudgeToken: t.procedure
      .input(validateJudgeTokenSchema)
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `validateJudgeToken:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );
        const hash = createHash('sha256').update(input.token).digest('hex');
        const [session] = await db.db
          .select({
            id: judgeSessions.id,
            competitionId: judgeSessions.competitionId,
            label: judgeSessions.label,
          })
          .from(judgeSessions)
          .where(eq(judgeSessions.tokenHash, hash));
        if (!session) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Link not valid',
          });
        }
        const [comp] = await db.db
          .select({
            id: competitions.id,
            name: competitions.name,
            status: competitions.status,
            cypherCompletedAt: competitions.cypherCompletedAt,
            isSimulation: competitions.isSimulation,
          })
          .from(competitions)
          .where(eq(competitions.id, session.competitionId));
        if (!comp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Link not valid',
          });
        }
        return {
          judgeSessionId: session.id,
          label: session.label,
          competitionId: comp.id,
          competitionName: comp.name,
          competitionStatus: comp.status,
          cypherCompletedAt: comp.cypherCompletedAt?.toISOString() ?? null,
          isSimulation: comp.isSimulation,
        };
      }),

    startCypherPhase: protectedProcedure
      .input(startCypherPhaseSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Verify competition exists + ownership (RLS enforces ownership)
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              cypherGroupCount: competitions.cypherGroupCount,
              cypherJudgeCount: competitions.cypherJudgeCount,
              soloMode: competitions.soloMode,
              isSimulation: competitions.isSimulation,
              participantFormat: competitions.participantFormat,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          // 2. Idempotency guard — must be draft
          if (comp.status !== 'draft') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Competition has already been started',
              cause: { errorCode: ErrorCodes.COMPETITION_ALREADY_STARTED },
            });
          }

          // 3. Validate group count configured. Solo mode forces 1 group
          // (the organizer is the sole judge covering all competitors).
          const groupCount = comp.soloMode ? 1 : comp.cypherGroupCount;
          if (!groupCount || groupCount < 1) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Judge group count must be configured before starting',
              cause: { errorCode: ErrorCodes.JUDGE_CONFIG_MISSING },
            });
          }

          // 4. Validate at least 1 criterion
          const criteria = await tx
            .select({ id: evaluationCriteria.id })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, input.competitionId));
          if (criteria.length === 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'At least one evaluation criterion must be defined before starting',
              cause: { errorCode: ErrorCodes.NO_CRITERIA_DEFINED },
            });
          }

          // 5. Load competitors — must have at least 1
          const allCompetitors = await tx
            .select({
              id: competitors.id,
              role: competitors.role,
              partnerId: competitors.partnerId,
            })
            .from(competitors)
            .where(eq(competitors.competitionId, input.competitionId))
            .orderBy(asc(competitors.createdAt));
          if (allCompetitors.length === 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'At least one participant must be registered before starting',
              cause: { errorCode: ErrorCodes.NO_PARTICIPANTS_REGISTERED },
            });
          }

          // 5a. Pairs format guard — every competitor must be paired with the
          // opposite role. Without this, partner matchups can't be generated.
          if (comp.participantFormat === 'pairs') {
            const unpaired = allCompetitors.filter(
              (c) => c.role === null || c.partnerId === null,
            );
            if (unpaired.length > 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Pairs competition has ${unpaired.length} unpaired competitor(s); every competitor needs a partner and a role before starting`,
                cause: { errorCode: ErrorCodes.NO_PARTICIPANTS_REGISTERED },
              });
            }
          }

          // 6. Load judge sessions — must have at least groupCount sessions.
          // Solo mode bypasses this check entirely; the organizer's judge
          // session is auto-created on their first submitOrganizerScore call.
          // Simulations also bypass — sim sessions are auto-created below so
          // the round-robin assignment + competition.started event payload
          // are byte-identical to live competitions.
          let allJudgeSessions = await tx
            .select({ id: judgeSessions.id })
            .from(judgeSessions)
            .where(eq(judgeSessions.competitionId, input.competitionId))
            .orderBy(asc(judgeSessions.createdAt));

          if (
            comp.isSimulation &&
            comp.cypherGroupCount &&
            comp.cypherJudgeCount
          ) {
            const desired = comp.cypherGroupCount * comp.cypherJudgeCount;
            if (allJudgeSessions.length < desired) {
              const toCreate = [] as {
                competitionId: string;
                tokenHash: string;
                label: string;
                createdBy: string;
                groupIndex: number;
              }[];
              for (let j = 0; j < comp.cypherJudgeCount; j++) {
                for (let g = 0; g < comp.cypherGroupCount; g++) {
                  const { hash } = generateJudgeToken();
                  toCreate.push({
                    competitionId: input.competitionId,
                    tokenHash: hash,
                    label: `Sim Judge G${String.fromCharCode(65 + g)}-J${j + 1}`,
                    createdBy: ctx.userId,
                    groupIndex: g,
                  });
                }
              }
              await tx.insert(judgeSessions).values(toCreate);
              allJudgeSessions = await tx
                .select({ id: judgeSessions.id })
                .from(judgeSessions)
                .where(eq(judgeSessions.competitionId, input.competitionId))
                .orderBy(asc(judgeSessions.createdAt));
            }
          }

          if (
            !comp.soloMode &&
            !comp.isSimulation &&
            allJudgeSessions.length < groupCount
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `At least ${groupCount} judge links must be generated (one per group)`,
              cause: { errorCode: ErrorCodes.INSUFFICIENT_JUDGE_LINKS },
            });
          }

          // 7. Round-robin assignment
          const competitorAssignmentResults = roundRobinAssign(
            allCompetitors,
            groupCount,
          );
          const judgeAssignmentResults = roundRobinAssign(
            allJudgeSessions,
            groupCount,
          );

          // 8. Persist competitor group assignments
          await tx.insert(competitorGroupAssignments).values(
            competitorAssignmentResults.map((a) => ({
              competitionId: input.competitionId,
              competitorId: a.id,
              groupIndex: a.groupIndex,
            })),
          );

          // 9. Update judge sessions with their group index (batch CASE update).
          // Solo mode starts with 0 sessions — skip to avoid empty reduce().
          if (judgeAssignmentResults.length > 0) {
            const caseExpr = judgeAssignmentResults
              .map(
                // Cast THEN value to integer: Drizzle binds JS numbers as text
                // params by default; without ::int the CASE result is TEXT,
                // which Postgres rejects against the integer `group_index` column.
                (ja) =>
                  sql`WHEN ${judgeSessions.id} = ${ja.id} THEN ${ja.groupIndex}::int`,
              )
              .reduce((acc, clause) => sql`${acc} ${clause}`);
            const judgeIds = judgeAssignmentResults.map((ja) => ja.id);
            await tx
              .update(judgeSessions)
              .set({ groupIndex: sql`CASE ${caseExpr} END` })
              .where(
                sql`${judgeSessions.id} = ANY(ARRAY[${sql.join(
                  judgeIds.map((id) => sql`${id}`),
                  sql`, `,
                )}]::text[])`,
              );
          }

          // 10. Update competition status to active
          await tx
            .update(competitions)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(competitions.id, input.competitionId));

          // 11. Determine next event sequence
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          // 12. Emit domain event to append-only event store
          const payload: CompetitionStartedPayload = {
            competitionId: input.competitionId,
            groupCount,
            judgeAssignments: judgeAssignmentResults.map((ja) => ({
              judgeSessionId: ja.id,
              groupIndex: ja.groupIndex,
            })),
            competitorAssignments: competitorAssignmentResults.map((ca) => ({
              competitorId: ca.id,
              groupIndex: ca.groupIndex,
            })),
            startedAt: new Date().toISOString(),
          };
          await tx.insert(events).values({
            type: 'competition.started',
            aggregateId: input.competitionId,
            aggregateType: 'competition',
            payload: payload as unknown as Record<string, unknown>,
            sequence: nextSeq,
            createdBy: ctx.userId,
          });

          // 13. Broadcast via WebSocket (MVP: inside transaction — see gotcha #10)
          gateway.broadcastCompetitionStarted(input.competitionId, payload);

          return {
            success: true,
            groupCount,
            competitorCount: allCompetitors.length,
            judgeCount: allJudgeSessions.length,
          };
        });
      }),

    completeCypherPhase: protectedProcedure
      .input(completeCypherPhaseSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Load competition + ownership check (RLS-filtered).
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              advancementThreshold: competitions.advancementThreshold,
              cypherCompletedAt: competitions.cypherCompletedAt,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          // 2. Phase guard — fail fast before loading any scores.
          if (comp.status !== 'active') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cypher phase is not active',
              cause: { errorCode: ErrorCodes.CYPHER_NOT_ACTIVE },
            });
          }

          // 3. Threshold guard — fail fast before loading any scores.
          if (
            comp.advancementThreshold === null ||
            comp.advancementThreshold === undefined ||
            comp.advancementThreshold <= 0
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Advancement threshold has not been configured',
              cause: { errorCode: ErrorCodes.ADVANCEMENT_THRESHOLD_NOT_SET },
            });
          }

          // 4. Load standings. Guards above ensure we only pay the DB cost when
          // the request is valid. Reuses the public `computeStandings` helper.
          // Exclude withdrawn competitors — they must not be advanced (Story 4.3 AC #1).
          const scoreRows = await tx
            .select({
              competitorId: scores.competitorId,
              judgeSessionId: scores.judgeSessionId,
              criteriaScores: scores.criteriaScores,
              competitorName: competitors.name,
              participantId: competitors.participantId,
            })
            .from(scores)
            .innerJoin(competitors, eq(scores.competitorId, competitors.id))
            .where(
              and(
                eq(scores.competitionId, input.competitionId),
                eq(competitors.status, 'active'),
              ),
            );
          const finalStandings = computeStandings(scoreRows);

          // 5. Idempotency-by-state: cypher already locked.
          // Re-read the prior phase.transitioned event and return its payload.
          // No second UPDATE, no second event INSERT.
          if (comp.cypherCompletedAt !== null) {
            const [priorEvent] = await tx
              .select({ payload: events.payload })
              .from(events)
              .where(
                and(
                  eq(events.aggregateId, input.competitionId),
                  eq(events.aggregateType, 'competition'),
                  eq(events.type, 'phase.transitioned'),
                ),
              )
              .orderBy(desc(events.sequence))
              .limit(1);
            const [priorBracketEvent] = await tx
              .select({ payload: events.payload })
              .from(events)
              .where(
                and(
                  eq(events.aggregateId, input.competitionId),
                  eq(events.aggregateType, 'competition'),
                  eq(events.type, 'bracket.generated'),
                ),
              )
              .orderBy(desc(events.sequence))
              .limit(1);
            const priorBracket =
              (priorBracketEvent?.payload as
                | BracketGeneratedPayload
                | undefined) ?? null;
            const priorPayload = priorEvent?.payload as
              | PhaseTransitionedPayload
              | undefined;
            if (priorPayload) {
              return {
                idempotent: true,
                advancedCompetitorIds: priorPayload.advancedCompetitorIds,
                advancedCount: priorPayload.advancedCompetitorIds.length,
                totalParticipants: finalStandings.length,
                finalStandings,
                bracket: priorBracket,
              };
            }
            // Belt-and-suspenders: cypherCompletedAt is set but no event row
            // exists. Should be impossible (both inserted in the same
            // transaction); recompute from current state and proceed without
            // emitting a second event.
            console.warn(
              `[completeCypherPhase] cypherCompletedAt set but no phase.transitioned event found for ${input.competitionId}; falling back to recompute`,
            );
            const fallbackThreshold = comp.advancementThreshold ?? 0;
            const fallbackCount = Math.min(
              fallbackThreshold > 0 ? fallbackThreshold : finalStandings.length,
              finalStandings.length,
            );
            return {
              idempotent: true,
              advancedCompetitorIds: finalStandings
                .slice(0, fallbackCount)
                .map((s) => s.competitorId),
              advancedCount: fallbackCount,
              totalParticipants: finalStandings.length,
              finalStandings,
              bracket: priorBracket,
            };
          }

          // 6. AC #6 — never overflow. Cap top-N at the actual standings
          // length so under-populated competitions advance everyone.
          // TODO: tie-breaking at the cutoff is FUTURE work (Story 5.x);
          // current sort is stable on insertion order for equal totals.
          const advancedCount = Math.min(
            comp.advancementThreshold,
            finalStandings.length,
          );
          const advancedCompetitorIds = finalStandings
            .slice(0, advancedCount)
            .map((s) => s.competitorId);

          // 7. Stamp the projection column.
          const transitionedAt = new Date();
          await tx
            .update(competitions)
            .set({
              cypherCompletedAt: transitionedAt,
              updatedAt: transitionedAt,
            })
            .where(eq(competitions.id, input.competitionId));

          // 8. Determine next event sequence (matches startCypherPhase pattern).
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          // 9. Build payload + emit event. Idempotency-by-conflict: if two
          // organizers click Confirm concurrently, the unique
          // (aggregate_id, aggregate_type, sequence) index causes one INSERT
          // to fail with 23505. Re-read the now-existing event and return
          // its payload — both clients converge to the same outcome.
          const payload: PhaseTransitionedPayload = {
            competitionId: input.competitionId,
            fromPhase: 'cypher',
            toPhase: 'battles',
            advancedCompetitorIds,
            triggerType: 'admin_confirmed',
            transitionedAt: transitionedAt.toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'phase.transitioned',
              aggregateId: input.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: ctx.userId,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              const [winning] = await tx
                .select({ payload: events.payload })
                .from(events)
                .where(
                  and(
                    eq(events.aggregateId, input.competitionId),
                    eq(events.aggregateType, 'competition'),
                    eq(events.type, 'phase.transitioned'),
                  ),
                )
                .orderBy(desc(events.sequence))
                .limit(1);
              const winningPayload = winning?.payload as
                | PhaseTransitionedPayload
                | undefined;
              if (winningPayload) {
                // Cannot safely re-read bracket.generated here: a 23505 puts
                // postgres into a "tx aborted" state where subsequent SELECTs
                // are rejected. Return bracket: null for shape-consistency
                // with the other idempotent paths; clients pull current bracket
                // state via tournament.getBracket on the next render.
                return {
                  idempotent: true,
                  advancedCompetitorIds: winningPayload.advancedCompetitorIds,
                  advancedCount: winningPayload.advancedCompetitorIds.length,
                  totalParticipants: finalStandings.length,
                  finalStandings,
                  bracket: null,
                };
              }
            }
            throw err;
          }

          // 10. Bracket generation. Belt-and-suspenders: re-check that no
          // battle_matchups exist. Step 5 already short-circuits on
          // cypherCompletedAt, so this only fires for direct re-entry paths.
          let bracketPayload: BracketGeneratedPayload | null = null;
          // Only broadcast on paths where this transaction freshly produced
          // (or converged via 23505) the bracket. The existingMatchup branch
          // re-reads a prior payload whose original broadcast already fired —
          // re-emitting would be noise; clients refetch via getBracket.
          let bracketWasGenerated = false;
          const qualifierCount = advancedCompetitorIds.length;

          if (qualifierCount >= 2) {
            const [existingMatchup] = await tx
              .select({ id: battleMatchups.id })
              .from(battleMatchups)
              .where(eq(battleMatchups.competitionId, input.competitionId))
              .limit(1);

            if (existingMatchup) {
              // Bracket already persisted by an earlier path that committed
              // before our step-5 idempotency check could see it. Re-read the
              // prior bracket.generated event so the response carries the same
              // payload other idempotent paths return (cypherCompletedAt path
              // does the same thing).
              const [priorBracketEvent] = await tx
                .select({ payload: events.payload })
                .from(events)
                .where(
                  and(
                    eq(events.aggregateId, input.competitionId),
                    eq(events.aggregateType, 'competition'),
                    eq(events.type, 'bracket.generated'),
                  ),
                )
                .orderBy(desc(events.sequence))
                .limit(1);
              bracketPayload =
                (priorBracketEvent?.payload as
                  | BracketGeneratedPayload
                  | undefined) ?? null;
            } else {
              const seeds: BracketSeed[] = advancedCompetitorIds.map(
                (id, i) => ({
                  competitorId: id,
                  seed: i + 1,
                }),
              );
              const bracket = generateBracket(seeds);

              if (bracket.matchups.length > 0) {
                await tx.insert(battleMatchups).values(
                  bracket.matchups.map((m) => ({
                    competitionId: input.competitionId,
                    roundNumber: m.roundNumber,
                    bracketPosition: m.bracketPosition,
                    competitorAId: m.competitorAId,
                    competitorBId: m.competitorBId,
                    seedA: m.seedA,
                    seedB: m.seedB,
                    isBye: m.isBye,
                    // Pre-resolve byes: an auto-advancing seed has no vote to cast,
                    // so Story 5.3 can treat winnerCompetitorId IS NOT NULL as "done".
                    winnerCompetitorId: m.isBye ? m.competitorAId : null,
                  })),
                );
              }

              bracketPayload = {
                competitionId: input.competitionId,
                bracketSize: bracket.bracketSize,
                qualifierCount: bracket.qualifierCount,
                seeds,
                matchups: bracket.matchups,
                generatedAt: transitionedAt.toISOString(),
              };
              bracketWasGenerated = true;

              const bracketSeq = nextSeq + 1;
              try {
                await tx.insert(events).values({
                  type: 'bracket.generated',
                  aggregateId: input.competitionId,
                  aggregateType: 'competition',
                  payload: bracketPayload as unknown as Record<string, unknown>,
                  sequence: bracketSeq,
                  createdBy: ctx.userId,
                });
              } catch (err: unknown) {
                if ((err as { code?: string }).code === '23505') {
                  const [winning] = await tx
                    .select({ payload: events.payload })
                    .from(events)
                    .where(
                      and(
                        eq(events.aggregateId, input.competitionId),
                        eq(events.aggregateType, 'competition'),
                        eq(events.type, 'bracket.generated'),
                      ),
                    )
                    .orderBy(desc(events.sequence))
                    .limit(1);
                  const winningPayload = winning?.payload as
                    | BracketGeneratedPayload
                    | undefined;
                  if (winningPayload) {
                    bracketPayload = winningPayload;
                  } else {
                    throw err;
                  }
                } else {
                  throw err;
                }
              }
            }
          } else {
            // AC #7: under-populated cypher (0 or 1 qualifier). Skip the
            // bracket entirely — no matchups, no event, no broadcast.
            console.warn(
              `[completeCypherPhase] Skipping bracket generation for ${input.competitionId} — only ${qualifierCount} qualifier(s)`,
            );
          }

          // 11. Broadcast via WebSocket (MVP: inside transaction — same
          // gotcha as startCypherPhase #10).
          gateway.broadcastPhaseTransitioned(input.competitionId, payload);
          if (bracketPayload && bracketWasGenerated) {
            gateway.broadcastBracketGenerated(
              input.competitionId,
              bracketPayload,
            );
          }

          return {
            idempotent: false,
            advancedCompetitorIds,
            advancedCount,
            totalParticipants: finalStandings.length,
            finalStandings,
            bracket: bracketPayload,
          };
        });
      }),

    getBracket: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          const [comp] = await tx
            .select({ id: competitions.id, status: competitions.status })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          const rows = await tx
            .select({
              id: battleMatchups.id,
              roundNumber: battleMatchups.roundNumber,
              bracketPosition: battleMatchups.bracketPosition,
              competitorAId: battleMatchups.competitorAId,
              competitorBId: battleMatchups.competitorBId,
              seedA: battleMatchups.seedA,
              seedB: battleMatchups.seedB,
              isBye: battleMatchups.isBye,
              winnerCompetitorId: battleMatchups.winnerCompetitorId,
              tieStatus: battleMatchups.tieStatus,
              revoteCount: battleMatchups.revoteCount,
              organizerDecisionReason: battleMatchups.organizerDecisionReason,
              organizerDecisionBy: battleMatchups.organizerDecisionBy,
              completedAt: battleMatchups.completedAt,
            })
            .from(battleMatchups)
            .where(eq(battleMatchups.competitionId, input.competitionId))
            .orderBy(
              asc(battleMatchups.roundNumber),
              asc(battleMatchups.bracketPosition),
            );

          const ids = new Set<string>();
          for (const r of rows) {
            if (r.competitorAId) ids.add(r.competitorAId);
            if (r.competitorBId) ids.add(r.competitorBId);
          }

          const names: Record<string, { name: string; participantId: string }> =
            {};
          if (ids.size > 0) {
            const compRows = await tx
              .select({
                id: competitors.id,
                name: competitors.name,
                participantId: competitors.participantId,
              })
              .from(competitors)
              .where(inArray(competitors.id, [...ids]));
            for (const c of compRows) {
              names[c.id] = { name: c.name, participantId: c.participantId };
            }
          }

          // Champion: when competition is completed, the highest-round matchup
          // with a winnerCompetitorId is the champion.
          let championCompetitorId: string | null = null;
          if (comp.status === 'completed') {
            let maxRound = -1;
            for (const r of rows) {
              if (r.winnerCompetitorId !== null && r.roundNumber > maxRound) {
                maxRound = r.roundNumber;
                championCompetitorId = r.winnerCompetitorId;
              }
            }
          }

          // Current round: lowest round with at least one unresolved non-bye
          // matchup. Null when bracket is empty or fully resolved.
          let currentRoundNumber: number | null = null;
          for (const r of rows) {
            if (r.winnerCompetitorId === null && !r.isBye) {
              if (
                currentRoundNumber === null ||
                r.roundNumber < currentRoundNumber
              ) {
                currentRoundNumber = r.roundNumber;
              }
            }
          }

          return {
            matchups: rows.map((r) => ({
              ...r,
              completedAt: r.completedAt ? r.completedAt.toISOString() : null,
              competitorA: r.competitorAId
                ? (names[r.competitorAId] ?? null)
                : null,
              competitorB: r.competitorBId
                ? (names[r.competitorBId] ?? null)
                : null,
            })),
            championCompetitorId,
            currentRoundNumber,
          };
        });
      }),

    getStandings: t.procedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `getStandings:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );
        const [scoreRows, enrichment] = await Promise.all([
          db.db
            .select({
              competitorId: scores.competitorId,
              judgeSessionId: scores.judgeSessionId,
              criteriaScores: scores.criteriaScores,
              competitorName: competitors.name,
              participantId: competitors.participantId,
            })
            .from(scores)
            .innerJoin(competitors, eq(scores.competitorId, competitors.id))
            .where(
              and(
                eq(scores.competitionId, input.competitionId),
                eq(competitors.status, 'active'),
              ),
            ),
          fetchStandingsEnrichment(db, input.competitionId),
        ]);
        return computeStandings(scoreRows, enrichment);
      }),

    // Story 6.1: public-facing "next matchup" lookups for the standings page.
    // Separated from getBracket (admin-only, full structure) and from
    // getStandings (high-frequency hot path) so a matchup completion only
    // invalidates the small per-row hint, not the standings cache.
    getPublicNextMatchups: t.procedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `getPublicNextMatchups:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );

        const [comp] = await db.db
          .select({
            id: competitions.id,
            cypherCompletedAt: competitions.cypherCompletedAt,
          })
          .from(competitions)
          .where(eq(competitions.id, input.competitionId));
        if (!comp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Competition not found',
          });
        }
        // Battles not active yet → no next-matchup hints to render.
        if (comp.cypherCompletedAt === null) return [];

        // All non-bye matchups for this competition.
        const matchupRows = await db.db
          .select({
            id: battleMatchups.id,
            roundNumber: battleMatchups.roundNumber,
            bracketPosition: battleMatchups.bracketPosition,
            competitorAId: battleMatchups.competitorAId,
            competitorBId: battleMatchups.competitorBId,
            isBye: battleMatchups.isBye,
            winnerCompetitorId: battleMatchups.winnerCompetitorId,
          })
          .from(battleMatchups)
          .where(eq(battleMatchups.competitionId, input.competitionId))
          .orderBy(asc(battleMatchups.roundNumber));

        // Find the lowest round with at least one unresolved non-bye matchup.
        let currentRound: number | null = null;
        for (const m of matchupRows) {
          if (m.isBye) continue;
          if (m.winnerCompetitorId !== null) continue;
          if (currentRound === null || m.roundNumber < currentRound) {
            currentRound = m.roundNumber;
          }
        }
        if (currentRound === null) return [];

        const pending = matchupRows.filter(
          (m) =>
            m.roundNumber === currentRound &&
            !m.isBye &&
            m.winnerCompetitorId === null,
        );
        if (pending.length === 0) return [];

        // Resolve competitor names in one round-trip.
        const ids = new Set<string>();
        for (const m of pending) {
          if (m.competitorAId) ids.add(m.competitorAId);
          if (m.competitorBId) ids.add(m.competitorBId);
        }
        const names = new Map<string, string>();
        if (ids.size > 0) {
          const rows = await db.db
            .select({ id: competitors.id, name: competitors.name })
            .from(competitors)
            .where(inArray(competitors.id, [...ids]));
          for (const r of rows) names.set(r.id, r.name);
        }

        // One entry per competitor, with opponent fields cross-pointing.
        const entries: Array<{
          competitorId: string;
          matchupId: string;
          roundNumber: number;
          bracketPosition: number;
          opponentCompetitorId: string | null;
          opponentName: string | null;
        }> = [];
        for (const m of pending) {
          if (m.competitorAId) {
            entries.push({
              competitorId: m.competitorAId,
              matchupId: m.id,
              roundNumber: m.roundNumber,
              bracketPosition: m.bracketPosition,
              opponentCompetitorId: m.competitorBId,
              opponentName: m.competitorBId
                ? (names.get(m.competitorBId) ?? null)
                : null,
            });
          }
          if (m.competitorBId) {
            entries.push({
              competitorId: m.competitorBId,
              matchupId: m.id,
              roundNumber: m.roundNumber,
              bracketPosition: m.bracketPosition,
              opponentCompetitorId: m.competitorAId,
              opponentName: m.competitorAId
                ? (names.get(m.competitorAId) ?? null)
                : null,
            });
          }
        }
        return entries;
      }),

    getPublicBracket: t.procedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `getPublicBracket:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );

        const [comp] = await db.db
          .select({
            id: competitions.id,
            cypherCompletedAt: competitions.cypherCompletedAt,
            status: competitions.status,
          })
          .from(competitions)
          .where(eq(competitions.id, input.competitionId));
        if (!comp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Competition not found',
          });
        }
        if (comp.cypherCompletedAt === null) {
          return {
            matchups: [],
            championCompetitorId: null,
            currentRoundNumber: null,
          };
        }

        const rows = await db.db
          .select({
            id: battleMatchups.id,
            roundNumber: battleMatchups.roundNumber,
            bracketPosition: battleMatchups.bracketPosition,
            competitorAId: battleMatchups.competitorAId,
            competitorBId: battleMatchups.competitorBId,
            seedA: battleMatchups.seedA,
            seedB: battleMatchups.seedB,
            isBye: battleMatchups.isBye,
            winnerCompetitorId: battleMatchups.winnerCompetitorId,
          })
          .from(battleMatchups)
          .where(eq(battleMatchups.competitionId, input.competitionId))
          .orderBy(
            asc(battleMatchups.roundNumber),
            asc(battleMatchups.bracketPosition),
          );

        const ids = new Set<string>();
        for (const r of rows) {
          if (r.competitorAId) ids.add(r.competitorAId);
          if (r.competitorBId) ids.add(r.competitorBId);
        }

        const names: Record<string, { name: string; participantId: string }> =
          {};
        if (ids.size > 0) {
          const compRows = await db.db
            .select({
              id: competitors.id,
              name: competitors.name,
              participantId: competitors.participantId,
            })
            .from(competitors)
            .where(inArray(competitors.id, [...ids]));
          for (const c of compRows) {
            names[c.id] = { name: c.name, participantId: c.participantId };
          }
        }

        let championCompetitorId: string | null = null;
        if (comp.status === 'completed') {
          let maxRound = -1;
          for (const r of rows) {
            if (r.winnerCompetitorId !== null && r.roundNumber > maxRound) {
              maxRound = r.roundNumber;
              championCompetitorId = r.winnerCompetitorId;
            }
          }
        }

        let currentRoundNumber: number | null = null;
        for (const r of rows) {
          if (r.winnerCompetitorId === null && !r.isBye) {
            if (
              currentRoundNumber === null ||
              r.roundNumber < currentRoundNumber
            ) {
              currentRoundNumber = r.roundNumber;
            }
          }
        }

        return {
          matchups: rows.map((r) => ({
            ...r,
            competitorA: r.competitorAId
              ? (names[r.competitorAId] ?? null)
              : null,
            competitorB: r.competitorBId
              ? (names[r.competitorBId] ?? null)
              : null,
          })),
          championCompetitorId,
          currentRoundNumber,
        };
      }),

    getJudgeAssignments: t.procedure
      .input(z.object({ token: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `getJudgeAssignments:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );
        return db.db.transaction(async (tx) => {
          const hash = createHash('sha256').update(input.token).digest('hex');
          const [session] = await tx
            .select({
              id: judgeSessions.id,
              competitionId: judgeSessions.competitionId,
              groupIndex: judgeSessions.groupIndex,
              label: judgeSessions.label,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.tokenHash, hash));
          if (!session) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Link not valid',
            });
          }
          if (session.groupIndex === null) {
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              phaseStarted: false,
              assignedCompetitors: [],
              criteria: [],
              scoredCompetitorIds: [],
            };
          }
          const assigned = await tx
            .select({
              id: competitors.id,
              participantId: competitors.participantId,
              name: competitors.name,
            })
            .from(competitorGroupAssignments)
            .innerJoin(
              competitors,
              eq(competitors.id, competitorGroupAssignments.competitorId),
            )
            .where(
              and(
                eq(
                  competitorGroupAssignments.competitionId,
                  session.competitionId,
                ),
                eq(competitorGroupAssignments.groupIndex, session.groupIndex),
              ),
            )
            .orderBy(asc(competitors.name));
          const criteriaRows = await tx
            .select({
              id: evaluationCriteria.id,
              name: evaluationCriteria.name,
              minScore: evaluationCriteria.minScore,
              maxScore: evaluationCriteria.maxScore,
              displayOrder: evaluationCriteria.displayOrder,
            })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, session.competitionId))
            .orderBy(evaluationCriteria.displayOrder);
          const scoredRows = await tx
            .select({ competitorId: scores.competitorId })
            .from(scores)
            .where(eq(scores.judgeSessionId, session.id));
          const scoredCompetitorIds = scoredRows.map((r) => r.competitorId);
          return {
            judgeSessionId: session.id,
            label: session.label,
            competitionId: session.competitionId,
            phaseStarted: true,
            assignedCompetitors: assigned,
            criteria: criteriaRows,
            scoredCompetitorIds,
          };
        });
      }),

    getBattlesAssignment: t.procedure
      .input(z.object({ token: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `getBattlesAssignment:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );
        return db.db.transaction(async (tx) => {
          // 1. Validate token.
          const hash = createHash('sha256').update(input.token).digest('hex');
          const [session] = await tx
            .select({
              id: judgeSessions.id,
              competitionId: judgeSessions.competitionId,
              label: judgeSessions.label,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.tokenHash, hash));
          if (!session) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Link not valid',
            });
          }

          // 2. Battles-phase guard. cypherCompletedAt is the source of truth
          //    because Story 5.1's bracket generation is atomic with that flip.
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              cypherCompletedAt: competitions.cypherCompletedAt,
            })
            .from(competitions)
            .where(eq(competitions.id, session.competitionId));
          if (
            !comp ||
            comp.status !== 'active' ||
            comp.cypherCompletedAt === null
          ) {
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              battlesActive: false as const,
              currentMatchup: null,
            };
          }

          // 3. Find next matchup the judge hasn't voted on, that is not a bye
          //    and not yet resolved. Order by (round_number, bracket_position)
          //    so judges progress through the bracket deterministically.
          const votedRows = await tx
            .select({ matchupId: votes.matchupId })
            .from(votes)
            .where(eq(votes.judgeSessionId, session.id));
          const votedIds = votedRows.map((v) => v.matchupId);

          const candidateRows = await tx
            .select({
              id: battleMatchups.id,
              roundNumber: battleMatchups.roundNumber,
              bracketPosition: battleMatchups.bracketPosition,
              competitorAId: battleMatchups.competitorAId,
              competitorBId: battleMatchups.competitorBId,
              seedA: battleMatchups.seedA,
              seedB: battleMatchups.seedB,
              winnerCompetitorId: battleMatchups.winnerCompetitorId,
              isBye: battleMatchups.isBye,
            })
            .from(battleMatchups)
            .where(eq(battleMatchups.competitionId, session.competitionId))
            .orderBy(
              asc(battleMatchups.roundNumber),
              asc(battleMatchups.bracketPosition),
            );

          const next = candidateRows.find(
            (m) =>
              !m.isBye &&
              m.winnerCompetitorId === null &&
              !votedIds.includes(m.id) &&
              m.competitorAId !== null &&
              m.competitorBId !== null,
          );

          if (!next || !next.competitorAId || !next.competitorBId) {
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              battlesActive: true as const,
              currentMatchup: null,
            };
          }

          // 4. Resolve competitor names — single batched fetch.
          const compRows = await tx
            .select({
              id: competitors.id,
              name: competitors.name,
              participantId: competitors.participantId,
            })
            .from(competitors)
            .where(
              inArray(competitors.id, [next.competitorAId, next.competitorBId]),
            );
          const byId = new Map(compRows.map((c) => [c.id, c]));
          const a = byId.get(next.competitorAId);
          const b = byId.get(next.competitorBId);
          if (!a || !b) {
            // Defensive: a referenced competitor was not found. Withdrawn flips
            // status, doesn't delete, so this should not normally trigger.
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              battlesActive: true as const,
              currentMatchup: null,
            };
          }

          return {
            judgeSessionId: session.id,
            label: session.label,
            competitionId: session.competitionId,
            battlesActive: true as const,
            currentMatchup: {
              matchupId: next.id,
              roundNumber: next.roundNumber,
              bracketPosition: next.bracketPosition,
              competitorA: {
                id: a.id,
                name: a.name,
                participantId: a.participantId,
                seed: next.seedA,
              },
              competitorB: {
                id: b.id,
                name: b.name,
                participantId: b.participantId,
                seed: next.seedB,
              },
            },
          };
        });
      }),

    submitScore: t.procedure
      .input(submitScoreSchema)
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(`submitScore:${ctx.clientIp ?? 'unknown'}`, SUBMIT_RL);
        let broadcastPayload: ScoreSubmittedPayload | null = null;
        const result = await db.db.transaction(async (tx) => {
          // 1. Validate token
          const hash = createHash('sha256').update(input.token).digest('hex');
          const [session] = await tx
            .select({
              id: judgeSessions.id,
              competitionId: judgeSessions.competitionId,
              groupIndex: judgeSessions.groupIndex,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.tokenHash, hash));
          if (!session) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Judge link not valid',
            });
          }

          // 2. Validate competition is active
          const [comp] = await tx
            .select({ status: competitions.status })
            .from(competitions)
            .where(eq(competitions.id, session.competitionId));
          if (!comp || comp.status !== 'active') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Competition is not in active scoring phase',
              cause: { errorCode: ErrorCodes.PHASE_NOT_ACTIVE },
            });
          }

          // 3. Idempotency check — same key from the same judge = already processed.
          // Scoped per judge so one judge's key cannot short-circuit another's
          // legitimate submission (UUID collision or token-predictability attack).
          const [existing] = await tx
            .select({ id: scores.id })
            .from(scores)
            .where(
              and(
                eq(scores.judgeSessionId, session.id),
                eq(scores.idempotencyKey, input.idempotencyKey),
              ),
            );
          if (existing) {
            return { success: true, idempotent: true };
          }

          // 4. Validate judge has been assigned a group
          if (session.groupIndex === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Competition phase has not started yet',
              cause: { errorCode: ErrorCodes.PHASE_NOT_ACTIVE },
            });
          }

          // 5. Validate competitor is assigned to this judge's group
          const [assignment] = await tx
            .select({ groupIndex: competitorGroupAssignments.groupIndex })
            .from(competitorGroupAssignments)
            .where(
              and(
                eq(
                  competitorGroupAssignments.competitionId,
                  session.competitionId,
                ),
                eq(competitorGroupAssignments.competitorId, input.competitorId),
              ),
            );
          if (!assignment || assignment.groupIndex !== session.groupIndex) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Competitor is not assigned to your judge group',
              cause: { errorCode: ErrorCodes.COMPETITOR_NOT_ASSIGNED },
            });
          }

          // 6. Fetch criteria and validate completeness + ranges against DB.
          // Shared with overrideScore (Story 4.2) via validateCriteriaScores.
          const criteriaForComp = await tx
            .select({
              id: evaluationCriteria.id,
              name: evaluationCriteria.name,
              minScore: evaluationCriteria.minScore,
              maxScore: evaluationCriteria.maxScore,
            })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, session.competitionId));
          const validation = validateCriteriaScores(
            criteriaForComp,
            input.scores,
          );
          if (!validation.ok) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: validation.error,
              cause: { errorCode: ErrorCodes[validation.errorCode] },
            });
          }

          // 7. Get next event sequence
          const [{ maxSeq }] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, session.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (maxSeq ?? 0) + 1;

          // 8. Persist score
          try {
            await tx.insert(scores).values({
              competitionId: session.competitionId,
              judgeSessionId: session.id,
              competitorId: input.competitorId,
              idempotencyKey: input.idempotencyKey,
              criteriaScores: input.scores as CriteriaScoreEntry[],
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Score already submitted for this competitor',
                cause: { errorCode: ErrorCodes.SCORE_ALREADY_SUBMITTED },
              });
            }
            throw err;
          }

          // 9. Persist domain event
          const payload: ScoreSubmittedPayload = {
            judgeSessionId: session.id,
            competitorId: input.competitorId,
            competitionId: session.competitionId,
            scores: input.scores,
            idempotencyKey: input.idempotencyKey,
            submittedAt: new Date().toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'score.submitted',
              aggregateId: session.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: session.id,
            });
          } catch (err: unknown) {
            // Sequence collision from a concurrent submitScore for the same
            // competition — the unique constraint on (aggregate_id, aggregate_type,
            // sequence) prevents silent event-log corruption. Client should retry.
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent submission conflict, please retry',
              });
            }
            throw err;
          }

          // 10. Stash payload for broadcast AFTER commit (set outside transaction
          // so a rollback does not fire a false WebSocket notification).
          broadcastPayload = payload;
          return { success: true, idempotent: false };
        });
        // Broadcast only after the DB transaction has committed successfully.
        if (broadcastPayload !== null) {
          const competitionId = (broadcastPayload as ScoreSubmittedPayload)
            .competitionId;
          gateway.broadcastScoreSubmitted(
            competitionId,
            broadcastPayload as ScoreSubmittedPayload,
          );
          await broadcastEnrichedStandings(
            db,
            gateway,
            competitionId,
            'submitScore',
          );
        }
        return result;
      }),

    submitVote: t.procedure
      .input(submitVoteSchema)
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(`submitVote:${ctx.clientIp ?? 'unknown'}`, SUBMIT_RL);
        let broadcastPayload: VoteSubmittedPayload | null = null;
        let outcomeBroadcasts: MatchupOutcomeBroadcasts = EMPTY_BROADCASTS;
        const result = await db.db.transaction(async (tx) => {
          // 1. Validate token.
          const hash = createHash('sha256').update(input.token).digest('hex');
          const [session] = await tx
            .select({
              id: judgeSessions.id,
              competitionId: judgeSessions.competitionId,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.tokenHash, hash));
          if (!session) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Judge link not valid',
            });
          }

          // 2. Idempotency-by-key.
          const [existingByKey] = await tx
            .select({ id: votes.id })
            .from(votes)
            .where(
              and(
                eq(votes.judgeSessionId, session.id),
                eq(votes.idempotencyKey, input.idempotencyKey),
              ),
            );
          if (existingByKey) {
            return { success: true as const, idempotent: true as const };
          }

          // 3. Battles-phase guard.
          const [comp] = await tx
            .select({
              status: competitions.status,
              cypherCompletedAt: competitions.cypherCompletedAt,
            })
            .from(competitions)
            .where(eq(competitions.id, session.competitionId));
          if (
            !comp ||
            comp.status !== 'active' ||
            comp.cypherCompletedAt === null
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Battles phase is not active',
              cause: { errorCode: ErrorCodes.BATTLES_NOT_ACTIVE },
            });
          }

          // 4. Matchup load + guards.
          const [matchup] = await tx
            .select({
              id: battleMatchups.id,
              competitionId: battleMatchups.competitionId,
              isBye: battleMatchups.isBye,
              winnerCompetitorId: battleMatchups.winnerCompetitorId,
            })
            .from(battleMatchups)
            .where(eq(battleMatchups.id, input.matchupId));
          if (!matchup) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Matchup not found',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_FOUND },
            });
          }
          if (matchup.competitionId !== session.competitionId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Matchup does not belong to your competition',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_IN_COMPETITION },
            });
          }
          if (matchup.isBye) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Bye matchups auto-advance and accept no votes',
              cause: { errorCode: ErrorCodes.MATCHUP_IS_BYE },
            });
          }
          if (matchup.winnerCompetitorId !== null) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Matchup is already resolved',
              cause: { errorCode: ErrorCodes.MATCHUP_ALREADY_RESOLVED },
            });
          }

          // 5. Get next event sequence.
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, session.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          // 6. Persist vote. 23505 here means same judge tried to vote twice on
          //    the same matchup (uq_votes_matchup_judge); the idempotency-by-key
          //    pre-check at step 2 already covered the offline-queue retry path.
          try {
            await tx.insert(votes).values({
              competitionId: session.competitionId,
              matchupId: input.matchupId,
              judgeSessionId: session.id,
              vote: input.vote,
              idempotencyKey: input.idempotencyKey,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Vote already cast for this matchup',
                cause: { errorCode: ErrorCodes.MATCHUP_ALREADY_RESOLVED },
              });
            }
            throw err;
          }

          // 7. Persist vote.submitted event. We do NOT re-read on conflict —
          //    a sequence collision means a concurrent submission grabbed the
          //    slot; bubble up so the client retries with a fresh sequence.
          const payload: VoteSubmittedPayload = {
            competitionId: session.competitionId,
            matchupId: input.matchupId,
            judgeSessionId: session.id,
            vote: input.vote,
            idempotencyKey: input.idempotencyKey,
            submittedAt: new Date().toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'vote.submitted',
              aggregateId: session.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: session.id,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent submission conflict, please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;

          // Story 5.3 — tally + advancement after the vote is persisted.
          outcomeBroadcasts = await processMatchupOutcome(tx, {
            competitionId: session.competitionId,
            matchupId: input.matchupId,
            organizerClerkId: null,
          });

          return { success: true as const, idempotent: false as const };
        });

        if (broadcastPayload !== null) {
          const finalPayload: VoteSubmittedPayload = broadcastPayload;
          gateway.broadcastVoteSubmitted(
            finalPayload.competitionId,
            finalPayload,
          );
          emitMatchupBroadcasts(
            gateway,
            finalPayload.competitionId,
            outcomeBroadcasts,
          );
        }
        return result;
      }),

    submitOrganizerScore: protectedProcedure
      .input(submitOrganizerScoreSchema)
      .mutation(async ({ ctx, input }) => {
        let broadcastPayload: ScoreSubmittedPayload | null = null;
        const result = await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Load competition + ownership check.
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              soloMode: competitions.soloMode,
              isSimulation: competitions.isSimulation,
              cypherGroupCount: competitions.cypherGroupCount,
              cypherJudgeCount: competitions.cypherJudgeCount,
            })
            .from(competitions)
            .where(
              and(
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          // 2. Phase guard.
          if (comp.status !== 'active') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Competition is not in active scoring phase',
              cause: { errorCode: ErrorCodes.PHASE_NOT_ACTIVE },
            });
          }

          // 3. Mode guard — organizer scoring requires solo OR simulation.
          if (!comp.soloMode && !comp.isSimulation) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Organizer scoring requires solo mode or simulation mode',
              cause: { errorCode: ErrorCodes.ORGANIZER_SCORING_NOT_ENABLED },
            });
          }

          // Simulation takes precedence: if both flags somehow set, we use the
          // stricter (multi-judge) simulation path.
          const mode: 'solo' | 'simulation-cypher' = comp.isSimulation
            ? 'simulation-cypher'
            : 'solo';

          if (mode === 'simulation-cypher') {
            if (
              input.simulatedGroupIndex === undefined ||
              input.simulatedJudgeIndex === undefined
            ) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'simulatedGroupIndex and simulatedJudgeIndex are required for simulation scoring',
                cause: {
                  errorCode: ErrorCodes.SIMULATION_JUDGE_INDEX_OUT_OF_RANGE,
                },
              });
            }
            if (
              !comp.cypherGroupCount ||
              input.simulatedGroupIndex >= comp.cypherGroupCount
            ) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `simulatedGroupIndex must be less than ${comp.cypherGroupCount ?? 0}`,
                cause: {
                  errorCode: ErrorCodes.SIMULATION_JUDGE_INDEX_OUT_OF_RANGE,
                },
              });
            }
            if (
              !comp.cypherJudgeCount ||
              input.simulatedJudgeIndex >= comp.cypherJudgeCount
            ) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `simulatedJudgeIndex must be less than ${comp.cypherJudgeCount ?? 0}`,
                cause: {
                  errorCode: ErrorCodes.SIMULATION_JUDGE_INDEX_OUT_OF_RANGE,
                },
              });
            }
          }

          // 4. Verify competitor belongs to this competition AND is active
          // (Story 4.3: withdrawn competitors cannot be scored).
          const [competitorRow] = await tx
            .select({ id: competitors.id })
            .from(competitors)
            .where(
              and(
                eq(competitors.id, input.competitorId),
                eq(competitors.competitionId, input.competitionId),
                eq(competitors.status, 'active'),
              ),
            );
          if (!competitorRow) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competitor not found',
              cause: { errorCode: ErrorCodes.COMPETITOR_NOT_FOUND },
            });
          }

          // 5. Resolve the organizer/sim judge session (find-or-create).
          const { judgeSessionId: organizerSessionId } =
            await resolveOrganizerJudgeSession({
              tx,
              competitionId: input.competitionId,
              organizerClerkId: ctx.userId,
              mode,
              simulatedGroupIndex:
                mode === 'simulation-cypher'
                  ? input.simulatedGroupIndex
                  : undefined,
              simulatedJudgeIndex:
                mode === 'simulation-cypher'
                  ? input.simulatedJudgeIndex
                  : undefined,
            });

          // 6. Idempotency check.
          const [existing] = await tx
            .select({ id: scores.id })
            .from(scores)
            .where(
              and(
                eq(scores.judgeSessionId, organizerSessionId),
                eq(scores.idempotencyKey, input.idempotencyKey),
              ),
            );
          if (existing) {
            return { success: true as const, idempotent: true as const };
          }

          // 7. Validate criteria scores (shared with submitScore via the
          // validateCriteriaScores helper from Story 4.2).
          const criteriaForComp = await tx
            .select({
              id: evaluationCriteria.id,
              name: evaluationCriteria.name,
              minScore: evaluationCriteria.minScore,
              maxScore: evaluationCriteria.maxScore,
            })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, input.competitionId));
          const validation = validateCriteriaScores(
            criteriaForComp,
            input.scores,
          );
          if (!validation.ok) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: validation.error,
              cause: { errorCode: ErrorCodes[validation.errorCode] },
            });
          }

          // 8. Get next event sequence.
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          // 9. Persist score row.
          try {
            await tx.insert(scores).values({
              competitionId: input.competitionId,
              judgeSessionId: organizerSessionId,
              competitorId: input.competitorId,
              idempotencyKey: input.idempotencyKey,
              criteriaScores: input.scores as CriteriaScoreEntry[],
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Score already submitted for this competitor',
                cause: { errorCode: ErrorCodes.SCORE_ALREADY_SUBMITTED },
              });
            }
            throw err;
          }

          // 10. Persist score.submitted event.
          const payload: ScoreSubmittedPayload = {
            judgeSessionId: organizerSessionId,
            competitorId: input.competitorId,
            competitionId: input.competitionId,
            scores: input.scores,
            idempotencyKey: input.idempotencyKey,
            submittedAt: new Date().toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'score.submitted',
              aggregateId: input.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: organizerSessionId,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent submission conflict, please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;
          return { success: true as const, idempotent: false as const };
        });

        if (broadcastPayload !== null) {
          const finalPayload: ScoreSubmittedPayload = broadcastPayload;
          const competitionId = finalPayload.competitionId;
          gateway.broadcastScoreSubmitted(competitionId, finalPayload);
          await broadcastEnrichedStandings(
            db,
            gateway,
            competitionId,
            'submitOrganizerScore',
          );
        }

        return result;
      }),

    submitOrganizerVote: protectedProcedure
      .input(submitOrganizerVoteSchema)
      .mutation(async ({ ctx, input }) => {
        let broadcastPayload: VoteSubmittedPayload | null = null;
        let outcomeBroadcasts: MatchupOutcomeBroadcasts = EMPTY_BROADCASTS;
        const result = await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Load competition + ownership check.
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              soloMode: competitions.soloMode,
              isSimulation: competitions.isSimulation,
              battlesJudgeCount: competitions.battlesJudgeCount,
              cypherCompletedAt: competitions.cypherCompletedAt,
            })
            .from(competitions)
            .where(
              and(
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          // 2. Battles-phase guard.
          if (comp.status !== 'active' || comp.cypherCompletedAt === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Battles phase is not active',
              cause: { errorCode: ErrorCodes.BATTLES_NOT_ACTIVE },
            });
          }

          // 3. Mode guard — organizer voting requires solo OR simulation.
          if (!comp.soloMode && !comp.isSimulation) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Organizer voting requires solo mode or simulation mode',
              cause: { errorCode: ErrorCodes.ORGANIZER_SCORING_NOT_ENABLED },
            });
          }

          const mode: 'solo' | 'simulation-battles' = comp.isSimulation
            ? 'simulation-battles'
            : 'solo';

          if (mode === 'simulation-battles') {
            if (input.simulatedJudgeIndex === undefined) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'simulatedJudgeIndex is required for simulation voting',
                cause: {
                  errorCode: ErrorCodes.SIMULATION_JUDGE_INDEX_OUT_OF_RANGE,
                },
              });
            }
            if (
              !comp.battlesJudgeCount ||
              input.simulatedJudgeIndex >= comp.battlesJudgeCount
            ) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `simulatedJudgeIndex must be less than ${comp.battlesJudgeCount ?? 0}`,
                cause: {
                  errorCode: ErrorCodes.SIMULATION_JUDGE_INDEX_OUT_OF_RANGE,
                },
              });
            }
          }

          // 4. Resolve the organizer/sim judge session (find-or-create).
          const { judgeSessionId: organizerSessionId } =
            await resolveOrganizerJudgeSession({
              tx,
              competitionId: input.competitionId,
              organizerClerkId: ctx.userId,
              mode,
              simulatedJudgeIndex:
                mode === 'simulation-battles'
                  ? input.simulatedJudgeIndex
                  : undefined,
            });

          // 5. Idempotency-by-key.
          const [existingByKey] = await tx
            .select({ id: votes.id })
            .from(votes)
            .where(
              and(
                eq(votes.judgeSessionId, organizerSessionId),
                eq(votes.idempotencyKey, input.idempotencyKey),
              ),
            );
          if (existingByKey) {
            return { success: true as const, idempotent: true as const };
          }

          // 6. Matchup load + guards.
          const [matchup] = await tx
            .select({
              id: battleMatchups.id,
              competitionId: battleMatchups.competitionId,
              isBye: battleMatchups.isBye,
              winnerCompetitorId: battleMatchups.winnerCompetitorId,
            })
            .from(battleMatchups)
            .where(eq(battleMatchups.id, input.matchupId));
          if (!matchup) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Matchup not found',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_FOUND },
            });
          }
          if (matchup.competitionId !== input.competitionId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Matchup does not belong to your competition',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_IN_COMPETITION },
            });
          }
          if (matchup.isBye) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Bye matchups auto-advance and accept no votes',
              cause: { errorCode: ErrorCodes.MATCHUP_IS_BYE },
            });
          }
          if (matchup.winnerCompetitorId !== null) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Matchup is already resolved',
              cause: { errorCode: ErrorCodes.MATCHUP_ALREADY_RESOLVED },
            });
          }

          // 7. Get next event sequence.
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          // 8. Persist vote.
          try {
            await tx.insert(votes).values({
              competitionId: input.competitionId,
              matchupId: input.matchupId,
              judgeSessionId: organizerSessionId,
              vote: input.vote,
              idempotencyKey: input.idempotencyKey,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Vote already cast for this matchup',
                cause: { errorCode: ErrorCodes.MATCHUP_ALREADY_RESOLVED },
              });
            }
            throw err;
          }

          // 9. Persist vote.submitted event.
          const payload: VoteSubmittedPayload = {
            competitionId: input.competitionId,
            matchupId: input.matchupId,
            judgeSessionId: organizerSessionId,
            vote: input.vote,
            idempotencyKey: input.idempotencyKey,
            submittedAt: new Date().toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'vote.submitted',
              aggregateId: input.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: organizerSessionId,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent submission conflict, please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;

          // Story 5.3 — tally + advancement on solo-mode organizer votes too.
          outcomeBroadcasts = await processMatchupOutcome(tx, {
            competitionId: input.competitionId,
            matchupId: input.matchupId,
            organizerClerkId: ctx.userId,
          });

          return { success: true as const, idempotent: false as const };
        });

        if (broadcastPayload !== null) {
          const finalPayload: VoteSubmittedPayload = broadcastPayload;
          gateway.broadcastVoteSubmitted(
            finalPayload.competitionId,
            finalPayload,
          );
          emitMatchupBroadcasts(
            gateway,
            finalPayload.competitionId,
            outcomeBroadcasts,
          );
        }
        return result;
      }),

    resolveTie: protectedProcedure
      .input(resolveTieSchema)
      .mutation(async ({ ctx, input }) => {
        let outcomeBroadcasts: MatchupOutcomeBroadcasts = EMPTY_BROADCASTS;
        const result = await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Ownership check + matchup load (single round-trip).
          const [row] = await tx
            .select({
              matchupId: battleMatchups.id,
              competitionId: battleMatchups.competitionId,
              roundNumber: battleMatchups.roundNumber,
              bracketPosition: battleMatchups.bracketPosition,
              competitorAId: battleMatchups.competitorAId,
              competitorBId: battleMatchups.competitorBId,
              tieStatus: battleMatchups.tieStatus,
              winnerCompetitorId: battleMatchups.winnerCompetitorId,
            })
            .from(battleMatchups)
            .innerJoin(
              competitions,
              eq(competitions.id, battleMatchups.competitionId),
            )
            .where(
              and(
                eq(battleMatchups.id, input.matchupId),
                eq(battleMatchups.competitionId, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!row) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Matchup not found',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_FOUND },
            });
          }

          // 2. Guards.
          if (row.tieStatus !== 'organizer_decision_pending') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Matchup is not awaiting tie resolution',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_TIED },
            });
          }
          if (
            input.winnerCompetitorId !== row.competitorAId &&
            input.winnerCompetitorId !== row.competitorBId
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Winner must be one of the two competitors in the matchup',
              cause: { errorCode: ErrorCodes.WINNER_NOT_IN_MATCHUP },
            });
          }

          // Concurrency: serialise on this matchup so a late vote can't race.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`matchup-outcome:${input.matchupId}`}))`,
          );

          // 3. Re-aggregate tally for the audit footprint.
          const voteRows = await tx
            .select({ vote: votes.vote })
            .from(votes)
            .where(eq(votes.matchupId, input.matchupId));
          const tally: VoteTally = { player1: 0, player2: 0, tie: 0, total: 0 };
          for (const v of voteRows) {
            if (v.vote === 'player1') tally.player1 += 1;
            else if (v.vote === 'player2') tally.player2 += 1;
            else if (v.vote === 'tie') tally.tie += 1;
            tally.total += 1;
          }

          // 4. UPDATE matchup with winner + clear limbo + audit columns.
          const completedAt = new Date();
          await tx
            .update(battleMatchups)
            .set({
              winnerCompetitorId: input.winnerCompetitorId,
              tieStatus: null,
              organizerDecisionReason: input.reason,
              organizerDecisionBy: ctx.userId,
              completedAt,
            })
            .where(eq(battleMatchups.id, input.matchupId));

          // 5. Append matchup.completed event with advancedFromTie=true.
          const seq = await nextEventSequence(tx, input.competitionId);
          const payload: MatchupCompletedPayload = {
            competitionId: input.competitionId,
            matchupId: input.matchupId,
            roundNumber: row.roundNumber,
            bracketPosition: row.bracketPosition,
            winnerCompetitorId: input.winnerCompetitorId,
            tally,
            advancedFromTie: true,
            organizerDecisionReason: input.reason,
            completedAt: completedAt.toISOString(),
          };
          await insertEventOrRetry(tx, {
            type: 'matchup.completed',
            aggregateId: input.competitionId,
            aggregateType: 'competition',
            payload: payload as unknown as Record<string, unknown>,
            sequence: seq,
            createdBy: ctx.userId,
          });

          // 6. Round advancement / competition completion in same tx.
          const adv = await maybeAdvanceRound(tx, {
            competitionId: input.competitionId,
            justCompletedRound: row.roundNumber,
            organizerClerkId: ctx.userId,
          });

          outcomeBroadcasts = {
            matchupCompleted: payload,
            matchupRevoteRequired: null,
            matchupTieResolutionRequired: null,
            bracketAdvanced: adv.bracketAdvanced,
            competitionCompleted: adv.competitionCompleted,
          };

          return { success: true as const, matchupId: input.matchupId };
        });

        emitMatchupBroadcasts(gateway, input.competitionId, outcomeBroadcasts);
        return result;
      }),

    getDashboardSnapshot: protectedProcedure
      .input(getDashboardSnapshotSchema)
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Ownership check via RLS-filtered SELECT.
          const [comp] = await tx
            .select({
              id: competitions.id,
              name: competitions.name,
              status: competitions.status,
              cypherCompletedAt: competitions.cypherCompletedAt,
              soloMode: competitions.soloMode,
            })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          // 2. Derive current phase from status + cypherCompletedAt.
          type CurrentPhase =
            | 'configuration'
            | 'cypher'
            | 'cypher-review'
            | 'battles'
            | 'completed';
          let currentPhase: CurrentPhase;
          if (comp.status === 'draft') {
            currentPhase = 'configuration';
          } else if (
            comp.status === 'active' &&
            comp.cypherCompletedAt !== null
          ) {
            currentPhase = 'cypher-review';
          } else if (comp.status === 'active') {
            currentPhase = 'cypher';
          } else {
            currentPhase = 'completed';
          }

          // 3. Load all judge sessions for this competition.
          const judgeSessionRows = await tx
            .select({
              id: judgeSessions.id,
              label: judgeSessions.label,
              groupIndex: judgeSessions.groupIndex,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.competitionId, input.competitionId));

          // 4. Score counts per judge session.
          const scoreCountRows = await tx
            .select({
              judgeSessionId: scores.judgeSessionId,
              submittedCount: sql<number>`COUNT(*)::integer`,
            })
            .from(scores)
            .where(eq(scores.competitionId, input.competitionId))
            .groupBy(scores.judgeSessionId);
          const scoreCountByJudge = new Map<string, number>(
            scoreCountRows.map((r) => [r.judgeSessionId, r.submittedCount]),
          );

          // 5. Competitor counts per group (expected scores per judge in that group).
          const groupSizeRows = await tx
            .select({
              groupIndex: competitorGroupAssignments.groupIndex,
              competitorCount: sql<number>`COUNT(*)::integer`,
            })
            .from(competitorGroupAssignments)
            .where(
              eq(competitorGroupAssignments.competitionId, input.competitionId),
            )
            .groupBy(competitorGroupAssignments.groupIndex);
          const competitorCountByGroup = new Map<number, number>(
            groupSizeRows.map((r) => [r.groupIndex, r.competitorCount]),
          );

          // 6. Merge judge sessions with gateway presence and score counts.
          const livePresence = gateway.getJudgePresence(input.competitionId);
          const presenceBySessionId = new Map<string, JudgeLiveStatus>(
            livePresence.map((p) => [p.judgeSessionId, p]),
          );

          const judges = judgeSessionRows.map((session) => {
            const presence = presenceBySessionId.get(session.id);
            const groupIdx = session.groupIndex ?? null;
            const expectedCount =
              groupIdx !== null
                ? (competitorCountByGroup.get(groupIdx) ?? 0)
                : 0;
            return {
              judgeSessionId: session.id,
              label: session.label,
              groupIndex: groupIdx,
              connected: presence?.connected ?? false,
              queueSize: presence?.queueSize ?? 0,
              lastSeenAt: presence?.lastSeenAt ?? null,
              submittedCount: scoreCountByJudge.get(session.id) ?? 0,
              expectedCount,
            };
          });

          // 7. KPI rollups.
          const totalScoresSubmitted = judges.reduce(
            (s, j) => s + j.submittedCount,
            0,
          );
          const totalScoresExpected = judges.reduce(
            (s, j) => s + j.expectedCount,
            0,
          );

          // 8. Per-group score breakdown.
          const groupIndices = [
            ...new Set(
              judgeSessionRows
                .map((j) => j.groupIndex)
                .filter((g): g is number => g !== null),
            ),
          ];
          const scoresByGroup = groupIndices.map((groupIndex) => {
            const groupJudges = judges.filter(
              (j) => j.groupIndex === groupIndex,
            );
            return {
              groupIndex,
              submitted: groupJudges.reduce((s, j) => s + j.submittedCount, 0),
              expected: groupJudges.reduce((s, j) => s + j.expectedCount, 0),
            };
          });

          // 9. Top 10 standings preview (reuse existing computeStandings + getStandings data).
          const scoreRows = await tx
            .select({
              competitorId: scores.competitorId,
              judgeSessionId: scores.judgeSessionId,
              criteriaScores: scores.criteriaScores,
              competitorName: competitors.name,
              participantId: competitors.participantId,
            })
            .from(scores)
            .innerJoin(competitors, eq(scores.competitorId, competitors.id))
            .where(
              and(
                eq(scores.competitionId, input.competitionId),
                eq(competitors.status, 'active'),
              ),
            );
          const allStandings = computeStandings(scoreRows);
          const topStandings = allStandings.slice(0, 10);

          return {
            competitionId: comp.id,
            competitionName: comp.name,
            status: comp.status,
            soloMode: comp.soloMode,
            currentPhase,
            judges,
            totalScoresSubmitted,
            totalScoresExpected,
            scoresByGroup,
            topStandings,
          };
        });
      }),

    overrideScore: protectedProcedure
      .input(overrideScoreSchema)
      .mutation(async ({ ctx, input }) => {
        let broadcastPayload: ScoreOverriddenPayload | null = null;
        let competitionIdForBroadcast: string | null = null;
        const result = await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Load score row joined with competition. RLS handles ownership
          // filtering, but the explicit JOIN gives a useful NOT_FOUND.
          const [row] = await tx
            .select({
              scoreId: scores.id,
              competitionId: scores.competitionId,
              judgeSessionId: scores.judgeSessionId,
              competitorId: scores.competitorId,
              criteriaScores: scores.criteriaScores,
              competitionStatus: competitions.status,
            })
            .from(scores)
            .innerJoin(competitions, eq(competitions.id, scores.competitionId))
            .where(
              and(
                eq(scores.id, input.scoreId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!row) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Score not found',
              cause: { errorCode: ErrorCodes.SCORE_NOT_FOUND },
            });
          }

          // 2. Phase guard — overrides only allowed while competition is active.
          if (row.competitionStatus !== 'active') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Score overrides are not allowed while the competition is '${row.competitionStatus}'`,
              cause: { errorCode: ErrorCodes.OVERRIDE_NOT_ALLOWED_IN_PHASE },
            });
          }

          // 3. Validate new scores against current criteria (shared helper).
          const criteriaForComp = await tx
            .select({
              id: evaluationCriteria.id,
              name: evaluationCriteria.name,
              minScore: evaluationCriteria.minScore,
              maxScore: evaluationCriteria.maxScore,
            })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, row.competitionId));
          const validation = validateCriteriaScores(
            criteriaForComp,
            input.newScores,
          );
          if (!validation.ok) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: validation.error,
              cause: { errorCode: ErrorCodes[validation.errorCode] },
            });
          }

          // 4. Compute original + new totals via the format SDK
          // (single-judge-single-competitor sum). Defensively sanitize the
          // existing jsonb against any malformed entries.
          const originalCriteriaScores = sanitizeCriteriaScores(
            row.criteriaScores,
          );
          const originalTotalScore = aggregateCypherScore({
            judgeId: row.judgeSessionId,
            competitorId: row.competitorId,
            roundId: '',
            scores: originalCriteriaScores,
            idempotencyKey: '',
          });
          const newTotalScore = aggregateCypherScore({
            judgeId: row.judgeSessionId,
            competitorId: row.competitorId,
            roundId: '',
            scores: input.newScores,
            idempotencyKey: '',
          });

          // 5. UPDATE the scores projection row.
          await tx
            .update(scores)
            .set({ criteriaScores: input.newScores as CriteriaScoreEntry[] })
            .where(eq(scores.id, input.scoreId));

          // 6. Get next event sequence (matches submitScore pattern).
          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, row.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          // 7. INSERT immutable score.overridden event.
          const overriddenAt = new Date();
          const payload: ScoreOverriddenPayload = {
            scoreId: input.scoreId,
            competitionId: row.competitionId,
            judgeSessionId: row.judgeSessionId,
            competitorId: row.competitorId,
            originalCriteriaScores,
            newCriteriaScores: input.newScores,
            originalTotalScore,
            newTotalScore,
            reason: input.reason,
            overriddenByClerkId: ctx.userId,
            overriddenAt: overriddenAt.toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'score.overridden',
              aggregateId: row.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: ctx.userId,
            });
          } catch (err: unknown) {
            // Sequence collision from a concurrent event for the same
            // competition — client should retry; same precedent as submitScore.
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent event conflict, please retry',
              });
            }
            throw err;
          }

          // 8. Stash payload for broadcast AFTER commit.
          broadcastPayload = payload;
          competitionIdForBroadcast = row.competitionId;
          return {
            success: true as const,
            scoreId: input.scoreId,
            originalTotalScore,
            newTotalScore,
          };
        });

        // 9. Broadcast post-commit. Failure is non-critical — the mutation
        // already committed and the organizer received their success response.
        const competitionId: string | null = competitionIdForBroadcast;
        const finalPayload: ScoreOverriddenPayload | null = broadcastPayload;
        if (finalPayload !== null && competitionId !== null) {
          gateway.broadcastScoreOverridden(competitionId, finalPayload);
          await broadcastEnrichedStandings(
            db,
            gateway,
            competitionId,
            'overrideScore',
          );
        }
        return result;
      }),

    getScoreAuditTrail: protectedProcedure
      .input(getScoreAuditTrailSchema)
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Ownership check — load score + competition + competitor + judge.
          const [row] = await tx
            .select({
              scoreId: scores.id,
              competitionId: scores.competitionId,
              judgeSessionId: scores.judgeSessionId,
              competitorId: scores.competitorId,
              competitorName: competitors.name,
              judgeLabel: judgeSessions.label,
            })
            .from(scores)
            .innerJoin(competitions, eq(competitions.id, scores.competitionId))
            .innerJoin(competitors, eq(competitors.id, scores.competitorId))
            .innerJoin(
              judgeSessions,
              eq(judgeSessions.id, scores.judgeSessionId),
            )
            .where(
              and(
                eq(scores.id, input.scoreId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!row) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Score not found',
              cause: { errorCode: ErrorCodes.SCORE_NOT_FOUND },
            });
          }

          // 2. Read submitted event for this specific (judge, competitor) pair
          // using SQL-level jsonb filtering — avoids loading all competition
          // submissions. At most one such event exists (unique constraint).
          const submittedRows = await tx
            .select({
              sequence: events.sequence,
              createdAt: events.createdAt,
              payload: events.payload,
            })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, row.competitionId),
                eq(events.aggregateType, 'competition'),
                eq(events.type, 'score.submitted'),
                sql`${events.payload}->>'judgeSessionId' = ${row.judgeSessionId}`,
                sql`${events.payload}->>'competitorId' = ${row.competitorId}`,
              ),
            )
            .orderBy(asc(events.sequence))
            .limit(1);
          const overriddenRows = await tx
            .select({
              sequence: events.sequence,
              createdAt: events.createdAt,
              payload: events.payload,
            })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, row.competitionId),
                eq(events.aggregateType, 'competition'),
                eq(events.type, 'score.overridden'),
              ),
            )
            .orderBy(asc(events.sequence));

          type SubmittedEntry = {
            kind: 'submitted';
            sequence: number;
            createdAt: string;
            judgeSessionId: string;
            criteriaScores: { criterionId: string; value: string }[];
            totalScore: string;
          };
          type OverriddenEntry = {
            kind: 'overridden';
            sequence: number;
            createdAt: string;
            overriddenByClerkId: string;
            originalCriteriaScores: { criterionId: string; value: string }[];
            newCriteriaScores: { criterionId: string; value: string }[];
            originalTotalScore: string;
            newTotalScore: string;
            reason: string;
          };
          type ChainEntry = SubmittedEntry | OverriddenEntry;
          const chain: ChainEntry[] = [];

          // SQL already filtered to the matching (judge, competitor) pair.
          // At most one entry in submittedRows; the loop is kept for defensive
          // handling of any malformed payload.
          for (const ev of submittedRows) {
            const p = ev.payload as Partial<ScoreSubmittedPayload> | null;
            if (!p) continue;
            const sanitized = sanitizeCriteriaScores(p.scores);
            chain.push({
              kind: 'submitted',
              sequence: ev.sequence,
              createdAt: ev.createdAt.toISOString(),
              judgeSessionId: p.judgeSessionId ?? row.judgeSessionId,
              criteriaScores: sanitized,
              totalScore: aggregateCypherScore({
                judgeId: row.judgeSessionId,
                competitorId: row.competitorId,
                roundId: '',
                scores: sanitized,
                idempotencyKey: '',
              }),
            });
          }

          for (const ev of overriddenRows) {
            const p = ev.payload as Partial<ScoreOverriddenPayload> | null;
            if (p?.scoreId === input.scoreId) {
              chain.push({
                kind: 'overridden',
                sequence: ev.sequence,
                createdAt: ev.createdAt.toISOString(),
                overriddenByClerkId: p.overriddenByClerkId ?? '',
                originalCriteriaScores: sanitizeCriteriaScores(
                  p.originalCriteriaScores,
                ),
                newCriteriaScores: sanitizeCriteriaScores(p.newCriteriaScores),
                originalTotalScore: p.originalTotalScore ?? '0.00',
                newTotalScore: p.newTotalScore ?? '0.00',
                reason: p.reason ?? '',
              });
            }
          }

          chain.sort((a, b) => a.sequence - b.sequence);

          return {
            scoreId: row.scoreId,
            competitorId: row.competitorId,
            competitorName: row.competitorName,
            judgeSessionId: row.judgeSessionId,
            judgeLabel: row.judgeLabel,
            chain,
          };
        });
      }),

    listScoresForOverride: protectedProcedure
      .input(listScoresForCompetitionSchema)
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          // 1. Ownership check — explicit organizerClerkId filter alongside
          // RLS for defense-in-depth (matches pattern in overrideScore).
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(
              and(
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          // 2. Fetch all scores joined with competitor + judge metadata.
          const rows = await tx
            .select({
              scoreId: scores.id,
              judgeSessionId: scores.judgeSessionId,
              judgeLabel: judgeSessions.label,
              groupIndex: judgeSessions.groupIndex,
              competitorId: scores.competitorId,
              competitorName: competitors.name,
              participantId: competitors.participantId,
              criteriaScores: scores.criteriaScores,
              submittedAt: scores.createdAt,
            })
            .from(scores)
            .innerJoin(competitors, eq(competitors.id, scores.competitorId))
            .innerJoin(
              judgeSessions,
              eq(judgeSessions.id, scores.judgeSessionId),
            )
            .where(eq(scores.competitionId, input.competitionId));

          // 3. Build the set of scoreIds that have at least one override.
          const overrideEvents = await tx
            .select({ payload: events.payload })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
                eq(events.type, 'score.overridden'),
              ),
            );
          const overriddenScoreIds = new Set<string>();
          for (const ev of overrideEvents) {
            const p = ev.payload as Partial<ScoreOverriddenPayload> | null;
            if (typeof p?.scoreId === 'string') {
              overriddenScoreIds.add(p.scoreId);
            }
          }

          // 4. Compute total per row + hasOverrides flag.
          const result = rows.map((r) => {
            const sanitized = sanitizeCriteriaScores(r.criteriaScores);
            const totalScore = aggregateCypherScore({
              judgeId: r.judgeSessionId,
              competitorId: r.competitorId,
              roundId: '',
              scores: sanitized,
              idempotencyKey: '',
            });
            return {
              scoreId: r.scoreId,
              judgeSessionId: r.judgeSessionId,
              judgeLabel: r.judgeLabel,
              groupIndex: r.groupIndex ?? null,
              competitorId: r.competitorId,
              competitorName: r.competitorName,
              participantId: r.participantId,
              criteriaScores: sanitized,
              totalScore,
              submittedAt: r.submittedAt.toISOString(),
              hasOverrides: overriddenScoreIds.has(r.scoreId),
            };
          });

          // 5. Sort: group, then judge, then competitor name.
          result.sort((a, b) => {
            const gA = a.groupIndex ?? Number.MAX_SAFE_INTEGER;
            const gB = b.groupIndex ?? Number.MAX_SAFE_INTEGER;
            if (gA !== gB) return gA - gB;
            if (a.judgeLabel !== b.judgeLabel) {
              return a.judgeLabel.localeCompare(b.judgeLabel);
            }
            return a.competitorName.localeCompare(b.competitorName);
          });

          return result;
        });
      }),

    listCompetitorsWithStatus: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(
              and(
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );
          if (!comp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competition not found',
            });
          }

          return tx
            .select({
              id: competitors.id,
              participantId: competitors.participantId,
              name: competitors.name,
              status: competitors.status,
              createdAt: competitors.createdAt,
              groupIndex: competitorGroupAssignments.groupIndex,
            })
            .from(competitors)
            .leftJoin(
              competitorGroupAssignments,
              and(
                eq(
                  competitorGroupAssignments.competitionId,
                  competitors.competitionId,
                ),
                eq(competitorGroupAssignments.competitorId, competitors.id),
              ),
            )
            .where(eq(competitors.competitionId, input.competitionId))
            .orderBy(asc(competitors.name));
        });
      }),

    withdrawCompetitor: protectedProcedure
      .input(withdrawCompetitorSchema)
      .mutation(async ({ ctx, input }) => {
        let broadcastPayload: CompetitorWithdrawnPayload | null = null;
        let competitionIdForBroadcast: string | null = null;

        await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          const [row] = await tx
            .select({
              competitorId: competitors.id,
              competitorName: competitors.name,
              competitorStatus: competitors.status,
              competitionId: competitions.id,
              competitionStatus: competitions.status,
            })
            .from(competitors)
            .innerJoin(
              competitions,
              eq(competitions.id, competitors.competitionId),
            )
            .where(
              and(
                eq(competitors.id, input.competitorId),
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );

          if (!row) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competitor not found',
              cause: { errorCode: ErrorCodes.COMPETITOR_NOT_FOUND },
            });
          }

          if (row.competitionStatus !== 'active') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Competitor actions are only allowed while the competition is active',
              cause: { errorCode: ErrorCodes.ACTION_NOT_ALLOWED_IN_PHASE },
            });
          }

          if (row.competitorStatus === 'withdrawn') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Competitor is already withdrawn',
              cause: { errorCode: ErrorCodes.COMPETITOR_ALREADY_WITHDRAWN },
            });
          }

          await tx
            .update(competitors)
            .set({ status: 'withdrawn' })
            .where(eq(competitors.id, input.competitorId));

          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          const payload: CompetitorWithdrawnPayload = {
            competitorId: input.competitorId,
            competitionId: input.competitionId,
            competitorName: row.competitorName,
            reason: input.reason,
            withdrawnByClerkId: ctx.userId,
            withdrawnAt: new Date().toISOString(),
          };

          try {
            await tx.insert(events).values({
              aggregateId: input.competitionId,
              aggregateType: 'competition',
              type: 'competitor.withdrawn',
              payload: payload as unknown as Record<string, unknown>,
              createdBy: ctx.userId,
              sequence: nextSeq,
            });
          } catch (err) {
            const pgErr = err as { code?: string };
            if (pgErr?.code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Sequence collision — please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;
          competitionIdForBroadcast = input.competitionId;
        });

        if (broadcastPayload !== null && competitionIdForBroadcast !== null) {
          const competitionId: string = competitionIdForBroadcast;
          const payload: CompetitorWithdrawnPayload = broadcastPayload;
          gateway.broadcastCompetitorWithdrawn(competitionId, payload);
          await broadcastEnrichedStandings(
            db,
            gateway,
            competitionId,
            'withdrawCompetitor',
          );
        }

        return { success: true as const, competitorId: input.competitorId };
      }),

    rescueCompetitor: protectedProcedure
      .input(rescueCompetitorSchema)
      .mutation(async ({ ctx, input }) => {
        let broadcastPayload: CompetitorRescuedPayload | null = null;
        let competitionIdForBroadcast: string | null = null;

        await db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`,
          );

          const [row] = await tx
            .select({
              competitorId: competitors.id,
              competitorName: competitors.name,
              competitorStatus: competitors.status,
              competitionId: competitions.id,
              competitionStatus: competitions.status,
              cypherCompletedAt: competitions.cypherCompletedAt,
            })
            .from(competitors)
            .innerJoin(
              competitions,
              eq(competitions.id, competitors.competitionId),
            )
            .where(
              and(
                eq(competitors.id, input.competitorId),
                eq(competitions.id, input.competitionId),
                eq(competitions.organizerClerkId, ctx.userId),
              ),
            );

          if (!row) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Competitor not found',
              cause: { errorCode: ErrorCodes.COMPETITOR_NOT_FOUND },
            });
          }

          if (row.competitionStatus !== 'active') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Competitor actions are only allowed while the competition is active',
              cause: { errorCode: ErrorCodes.ACTION_NOT_ALLOWED_IN_PHASE },
            });
          }

          if (!row.cypherCompletedAt) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Rescue is only available during advancement review (after cypher phase is locked)',
              cause: { errorCode: ErrorCodes.ACTION_NOT_ALLOWED_IN_PHASE },
            });
          }

          if (row.competitorStatus !== 'withdrawn') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Only withdrawn competitors can be rescued',
              cause: { errorCode: ErrorCodes.COMPETITOR_NOT_WITHDRAWN },
            });
          }

          await tx
            .update(competitors)
            .set({ status: 'active' })
            .where(eq(competitors.id, input.competitorId));

          const [seqRow] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, input.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          const payload: CompetitorRescuedPayload = {
            competitorId: input.competitorId,
            competitionId: input.competitionId,
            competitorName: row.competitorName,
            reason: input.reason,
            rescuedByClerkId: ctx.userId,
            rescuedAt: new Date().toISOString(),
          };

          try {
            await tx.insert(events).values({
              aggregateId: input.competitionId,
              aggregateType: 'competition',
              type: 'competitor.rescued',
              payload: payload as unknown as Record<string, unknown>,
              createdBy: ctx.userId,
              sequence: nextSeq,
            });
          } catch (err) {
            const pgErr = err as { code?: string };
            if (pgErr?.code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Sequence collision — please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;
          competitionIdForBroadcast = input.competitionId;
        });

        if (broadcastPayload !== null && competitionIdForBroadcast !== null) {
          const competitionId: string = competitionIdForBroadcast;
          const payload: CompetitorRescuedPayload = broadcastPayload;
          gateway.broadcastCompetitorRescued(competitionId, payload);
          await broadcastEnrichedStandings(
            db,
            gateway,
            competitionId,
            'rescueCompetitor',
          );
        }

        return { success: true as const, competitorId: input.competitorId };
      }),
  });
}

export type TournamentRouter = ReturnType<typeof createTournamentRouter>;
