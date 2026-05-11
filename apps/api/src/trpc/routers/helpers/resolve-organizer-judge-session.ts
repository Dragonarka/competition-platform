import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { sql, eq, and } from 'drizzle-orm';
import { judgeSessions } from '@competition-platform/db';
import type { Db } from '../../../modules/database/database.service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type OrganizerJudgeMode =
  | 'solo'
  | 'simulation-cypher'
  | 'simulation-battles';

export interface ResolveOrganizerJudgeSessionInput {
  tx: Tx;
  competitionId: string;
  organizerClerkId: string;
  mode: OrganizerJudgeMode;
  simulatedGroupIndex?: number;
  simulatedJudgeIndex?: number;
}

export interface ResolveOrganizerJudgeSessionResult {
  judgeSessionId: string;
}

function generateTokenHash(): string {
  const raw = randomBytes(32).toString('hex');
  return createHash('sha256').update(raw).digest('hex');
}

function deriveSessionDescriptor(input: ResolveOrganizerJudgeSessionInput): {
  label: string;
  groupIndex: number | null;
  lockKey: string;
} {
  const { competitionId, organizerClerkId, mode } = input;
  if (mode === 'solo') {
    return {
      label: 'Organizer',
      groupIndex: 0,
      lockKey: `org-session-${competitionId}-${organizerClerkId}`,
    };
  }
  if (mode === 'simulation-cypher') {
    if (
      input.simulatedGroupIndex === undefined ||
      input.simulatedJudgeIndex === undefined
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Simulated group and judge indices are required for cypher simulation',
      });
    }
    const g = input.simulatedGroupIndex;
    const j = input.simulatedJudgeIndex;
    return {
      label: `Sim Judge G${String.fromCharCode(65 + g)}-J${j + 1}`,
      groupIndex: g,
      lockKey: `org-session-${competitionId}-${organizerClerkId}-G${g}-J${j}`,
    };
  }
  // simulation-battles
  if (input.simulatedJudgeIndex === undefined) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Simulated judge index is required for battles simulation',
    });
  }
  const j = input.simulatedJudgeIndex;
  return {
    label: `Sim Judge BAT-J${j + 1}`,
    groupIndex: null,
    lockKey: `org-session-${competitionId}-${organizerClerkId}-BAT-J${j}`,
  };
}

export async function resolveOrganizerJudgeSession(
  input: ResolveOrganizerJudgeSessionInput,
): Promise<ResolveOrganizerJudgeSessionResult> {
  const { tx, competitionId, organizerClerkId } = input;
  const { label, groupIndex, lockKey } = deriveSessionDescriptor(input);

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

  const [existing] = await tx
    .select({ id: judgeSessions.id })
    .from(judgeSessions)
    .where(
      and(
        eq(judgeSessions.competitionId, competitionId),
        eq(judgeSessions.createdBy, organizerClerkId),
        eq(judgeSessions.label, label),
      ),
    );
  if (existing) {
    return { judgeSessionId: existing.id };
  }

  const [created] = await tx
    .insert(judgeSessions)
    .values({
      competitionId,
      tokenHash: generateTokenHash(),
      label,
      createdBy: organizerClerkId,
      groupIndex,
    })
    .returning({ id: judgeSessions.id });
  if (!created) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create organizer judge session',
    });
  }
  return { judgeSessionId: created.id };
}
