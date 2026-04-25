import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { sql, eq, desc, max, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { t } from '../trpc.init';
import { protectedProcedure } from '../trpc.procedures';
import {
  competitions,
  evaluationCriteria,
  competitors,
  judgeSessions,
  events,
  competitorGroupAssignments,
  scores,
} from '@competition-platform/db';
import type { CriteriaScoreEntry } from '@competition-platform/db';
import {
  createCompetitionSchema,
  addCriterionSchema,
  copyCriteriaTemplateSchema,
  addParticipantSchema,
  setParticipantFormatSchema,
  setJudgeConfigSchema,
  generateJudgeLinksSchema,
  validateJudgeTokenSchema,
  startCypherPhaseSchema,
  submitScoreSchema,
  ErrorCodes,
} from '@competition-platform/shared';
import type {
  CompetitionStartedPayload,
  ScoreSubmittedPayload,
  StandingsEntry,
} from '@competition-platform/shared';
// TODO: load from format registry — cypher-battles aggregation is hardcoded for MVP
import { aggregateCompetitorScores } from '@competition-platform/format-cypher-battles/scoring';
import type { ScorePayload } from '@competition-platform/format-sdk';
import type { DatabaseService } from '../../modules/database/database.service';
import type { ICompetitionGateway } from '../../modules/websocket/competition-gateway.interface';
import { roundRobinAssign } from '../../modules/competition/domain/group-assigner';
import { enforceRateLimit } from '../rate-limit';

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

function computeStandings(scoreRows: StandingsRow[]): StandingsEntry[] {
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
    unsorted.push({
      competitorId,
      competitorName: name,
      participantId,
      totalScore: result.totalScore,
      scoresByJudge: result.scoresByJudge,
      judgeCount: payloads.length,
    });
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
          sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
        );
        return tx
          .select({
            id: competitions.id,
            name: competitions.name,
            description: competitions.description,
            date: competitions.date,
            status: competitions.status,
            participantFormat: competitions.participantFormat,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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

    listCriteria: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
          sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
        );
        return tx
          .selectDistinct({ id: competitions.id, name: competitions.name })
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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

    removeParticipant: protectedProcedure
      .input(z.object({ competitorDbId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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

    generateJudgeLinks: protectedProcedure
      .input(generateJudgeLinksSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
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
        };
      }),

    startCypherPhase: protectedProcedure
      .input(startCypherPhaseSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
          );

          // 1. Verify competition exists + ownership (RLS enforces ownership)
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              cypherGroupCount: competitions.cypherGroupCount,
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

          // 3. Validate group count configured
          const groupCount = comp.cypherGroupCount;
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
            .select({ id: competitors.id })
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

          // 6. Load judge sessions — must have at least groupCount sessions
          const allJudgeSessions = await tx
            .select({ id: judgeSessions.id })
            .from(judgeSessions)
            .where(eq(judgeSessions.competitionId, input.competitionId))
            .orderBy(asc(judgeSessions.createdAt));
          if (allJudgeSessions.length < groupCount) {
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

          // 9. Update judge sessions with their group index (batch CASE update)
          const caseExpr = judgeAssignmentResults
            .map(
              (ja) =>
                sql`WHEN ${judgeSessions.id} = ${ja.id} THEN ${ja.groupIndex}`,
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

    getStandings: t.procedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(
          `getStandings:${ctx.clientIp ?? 'unknown'}`,
          PUBLIC_RL,
        );
        const scoreRows = await db.db
          .select({
            competitorId: scores.competitorId,
            judgeSessionId: scores.judgeSessionId,
            criteriaScores: scores.criteriaScores,
            competitorName: competitors.name,
            participantId: competitors.participantId,
          })
          .from(scores)
          .innerJoin(competitors, eq(scores.competitorId, competitors.id))
          .where(eq(scores.competitionId, input.competitionId));
        return computeStandings(scoreRows);
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

          // 6. Fetch criteria and validate completeness + ranges against DB
          const criteriaForComp = await tx
            .select({
              id: evaluationCriteria.id,
              name: evaluationCriteria.name,
              minScore: evaluationCriteria.minScore,
              maxScore: evaluationCriteria.maxScore,
            })
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.competitionId, session.competitionId));
          const validCriterionIds = new Set(criteriaForComp.map((c) => c.id));
          // Reject unknown criterionIds — prevents junk payload from polluting
          // the jsonb column and downstream aggregations.
          for (const submitted of input.scores) {
            if (!validCriterionIds.has(submitted.criterionId)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Unknown criterion: ${submitted.criterionId}`,
                cause: { errorCode: ErrorCodes.SCORE_OUTSIDE_RANGE },
              });
            }
          }
          const submittedMap = new Map(
            input.scores.map((s) => [s.criterionId, s.value]),
          );
          for (const criterion of criteriaForComp) {
            const value = submittedMap.get(criterion.id);
            if (value === undefined) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Missing score for criterion: ${criterion.name}`,
                cause: { errorCode: ErrorCodes.SCORE_OUTSIDE_RANGE },
              });
            }
            const val = parseFloat(value);
            const min = parseFloat(criterion.minScore);
            const max = parseFloat(criterion.maxScore);
            if (val < min || val > max) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `${criterion.name}: value ${value} must be between ${criterion.minScore} and ${criterion.maxScore}`,
                cause: { errorCode: ErrorCodes.SCORE_OUTSIDE_RANGE },
              });
            }
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
          // Recompute and broadcast aggregated standings to the public room.
          // Failure is non-critical — the mutation already committed and the
          // judge already received their success response.
          // MVP trade-off: re-reads and re-aggregates ALL scores for the
          // competition on every submission. For ~200 participants × 5 judges
          // (1000 rows max) this is fine; at larger scale this should be
          // replaced with an incremental update against an in-memory or Redis
          // standings cache that mutates only the affected competitor's entry.
          try {
            const updatedRows = await db.db
              .select({
                competitorId: scores.competitorId,
                judgeSessionId: scores.judgeSessionId,
                criteriaScores: scores.criteriaScores,
                competitorName: competitors.name,
                participantId: competitors.participantId,
              })
              .from(scores)
              .innerJoin(competitors, eq(scores.competitorId, competitors.id))
              .where(eq(scores.competitionId, competitionId));
            gateway.broadcastStandingsUpdated(
              competitionId,
              computeStandings(updatedRows),
            );
          } catch (err) {
            // Log but do not fail: client-side TanStack Query invalidation on
            // the next `score.submitted` event or on reconnect will refresh the
            // view. A silent no-log swallow would hide computeStandings bugs.

            console.warn(
              `[submitScore] standings broadcast failed for ${competitionId}: ${String(err)}`,
            );
          }
        }
        return result;
      }),
  });
}

export type TournamentRouter = ReturnType<typeof createTournamentRouter>;
