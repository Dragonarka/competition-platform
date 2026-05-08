import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { t } from '../trpc.init';
import { createTournamentRouter } from './tournament.router';
import type { ICompetitionGateway } from '../../modules/websocket/competition-gateway.interface';
import { __resetRateLimitBuckets } from '../rate-limit';

beforeEach(() => {
  __resetRateLimitBuckets();
});

// Mock DB — should never be reached in validation/auth tests
const mockDb = {
  db: {
    transaction: () => {
      throw new Error('DB should not be called in validation tests');
    },
  },
} as any;

const mockGateway: ICompetitionGateway = {
  broadcastCompetitionStarted: vi.fn(),
  broadcastScoreSubmitted: vi.fn(),
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
  broadcastScoreOverridden: vi.fn(),
  broadcastCompetitorWithdrawn: vi.fn(),
  broadcastCompetitorRescued: vi.fn(),
  getJudgePresence: vi.fn().mockReturnValue([]),
  clearPresence: vi.fn(),
};

const router = createTournamentRouter(mockDb, mockGateway);
const appRouter = t.router({ tournament: router });

const caller = (userId: string | null) =>
  appRouter.createCaller({ userId, clientIp: '127.0.0.1' });

describe('tournament.create', () => {
  it('rejects empty name with Zod validation error', async () => {
    await expect(
      caller('user_123').tournament.create({
        name: '',
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects whitespace-only name with Zod validation error', async () => {
    await expect(
      caller('user_123').tournament.create({
        name: '   ',
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects name exceeding 200 characters', async () => {
    await expect(
      caller('user_123').tournament.create({
        name: 'a'.repeat(201),
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.create({
        name: 'Test Competition',
        date: null,
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.addCriterion', () => {
  it('rejects when minScore equals maxScore', async () => {
    await expect(
      caller('user_123').tournament.addCriterion({
        competitionId: 'comp_abc',
        name: 'Musicality',
        minScore: '5.00',
        maxScore: '5.00',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects when minScore is greater than maxScore', async () => {
    await expect(
      caller('user_123').tournament.addCriterion({
        competitionId: 'comp_abc',
        name: 'Musicality',
        minScore: '8.00',
        maxScore: '3.00',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects empty name', async () => {
    await expect(
      caller('user_123').tournament.addCriterion({
        competitionId: 'comp_abc',
        name: '',
        minScore: '0.00',
        maxScore: '10.00',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects whitespace-only name', async () => {
    await expect(
      caller('user_123').tournament.addCriterion({
        competitionId: 'comp_abc',
        name: '   ',
        minScore: '0.00',
        maxScore: '10.00',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.addCriterion({
        competitionId: 'comp_abc',
        name: 'Musicality',
        minScore: '0.00',
        maxScore: '10.00',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.listCriteria', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.listCriteria({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.removeCriterion', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.removeCriterion({ criterionId: 'crit_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.copyCriteriaTemplate', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.copyCriteriaTemplate({
        sourceCompetitionId: 'comp_abc',
        targetCompetitionId: 'comp_def',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects when source and target are the same competition', async () => {
    await expect(
      caller('user_123').tournament.copyCriteriaTemplate({
        sourceCompetitionId: 'comp_abc',
        targetCompetitionId: 'comp_abc',
      }),
    ).rejects.toThrow(TRPCError);
  });
});

describe('tournament.addParticipant', () => {
  it('rejects empty name', async () => {
    await expect(
      caller('user_123').tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: 'MC-001',
        name: '',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects whitespace-only name', async () => {
    await expect(
      caller('user_123').tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: 'MC-001',
        name: '   ',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects empty participantId', async () => {
    await expect(
      caller('user_123').tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: '',
        name: 'DJ Sample',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: 'MC-001',
        name: 'DJ Sample',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.setParticipantFormat', () => {
  it('rejects invalid format value', async () => {
    await expect(
      caller('user_123').tournament.setParticipantFormat({
        competitionId: 'comp_abc',
        format: 'trio' as any,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.setParticipantFormat({
        competitionId: 'comp_abc',
        format: 'individual',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.listParticipants', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.listParticipants({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.removeParticipant', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.removeParticipant({ competitorDbId: 'abc123' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.setJudgeConfig', () => {
  it('rejects cypherJudgeCount of 0', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 0,
        cypherGroupCount: 1,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects cypherGroupCount greater than cypherJudgeCount', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 3,
        cypherGroupCount: 5,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects advancementThreshold of 0', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 0,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects invalid tieBreakingRule value', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 'coin_flip' as any,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects battlesJudgeCount of 0', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 8,
        battlesJudgeCount: 0,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });
});

describe('tournament.getCompetition', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.getCompetition({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.generateJudgeLinks', () => {
  it('rejects count of 0', async () => {
    await expect(
      caller('user_123').tournament.generateJudgeLinks({
        competitionId: 'comp_abc',
        count: 0,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects count greater than 50', async () => {
    await expect(
      caller('user_123').tournament.generateJudgeLinks({
        competitionId: 'comp_abc',
        count: 51,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.generateJudgeLinks({
        competitionId: 'comp_abc',
        count: 3,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.validateJudgeToken', () => {
  it('rejects empty token string (Zod error)', async () => {
    await expect(
      caller(null).tournament.validateJudgeToken({ token: '' }),
    ).rejects.toThrow(TRPCError);
  });
});

describe('tournament.listJudgeLinks', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.listJudgeLinks({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.revokeJudgeLink', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.revokeJudgeLink({
        judgeSessionId: 'session_abc',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.startCypherPhase', () => {
  it('rejects empty competitionId (Zod error)', async () => {
    await expect(
      caller('user_123').tournament.startCypherPhase({ competitionId: '' }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.startCypherPhase({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.completeCypherPhase', () => {
  it('rejects empty competitionId (Zod error)', async () => {
    await expect(
      caller('user_123').tournament.completeCypherPhase({ competitionId: '' }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.completeCypherPhase({
        competitionId: 'comp_abc',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.getJudgeAssignments', () => {
  it('rejects empty token (Zod error)', async () => {
    await expect(
      caller(null).tournament.getJudgeAssignments({ token: '' }),
    ).rejects.toThrow(TRPCError);
  });
});

// ─── Story 5.1: tournament.getBracket ─────────────────────────────────────────

describe('tournament.getBracket', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.getBracket({ competitionId: 'comp_1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty competitionId (Zod error)', async () => {
    await expect(
      caller('user_1').tournament.getBracket({ competitionId: '' }),
    ).rejects.toThrow(TRPCError);
  });

  it('returns NOT_FOUND when competition is absent (RLS / ownership)', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_1').tournament.getBracket({
        competitionId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns matchups in (roundNumber, bracketPosition) order with resolved competitor names', async () => {
    const compRows = [{ id: 'comp_1' }];
    const matchupRows = [
      {
        id: 'm1',
        roundNumber: 1,
        bracketPosition: 0,
        competitorAId: 'a',
        competitorBId: 'b',
        seedA: 1,
        seedB: 2,
        isBye: false,
        winnerCompetitorId: null,
      },
      {
        id: 'm2',
        roundNumber: 1,
        bracketPosition: 1,
        competitorAId: 'c',
        competitorBId: null,
        seedA: 3,
        seedB: null,
        isBye: true,
        winnerCompetitorId: 'c',
      },
    ];
    const competitorRows = [
      { id: 'a', name: 'Alice', participantId: 'P-A' },
      { id: 'b', name: 'Bob', participantId: 'P-B' },
      { id: 'c', name: 'Carol', participantId: 'P-C' },
    ];

    let whereCallIdx = 0;
    const whereResults: unknown[][] = [compRows, matchupRows, competitorRows];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() =>
          makeChainable(whereResults[whereCallIdx++] ?? []),
        ),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;

    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getBracket({ competitionId: 'comp_1' });

    expect(result.matchups).toHaveLength(2);
    expect(result.matchups[0]).toMatchObject({
      id: 'm1',
      roundNumber: 1,
      bracketPosition: 0,
      isBye: false,
      competitorA: { name: 'Alice', participantId: 'P-A' },
      competitorB: { name: 'Bob', participantId: 'P-B' },
    });
    expect(result.matchups[1]).toMatchObject({
      id: 'm2',
      isBye: true,
      winnerCompetitorId: 'c',
      competitorA: { name: 'Carol', participantId: 'P-C' },
      competitorB: null,
    });
  });

  it('returns empty matchups when no battle_matchups exist for the competition', async () => {
    const compRows = [{ id: 'comp_1' }];
    let whereCallIdx = 0;
    const whereResults: unknown[][] = [compRows, []];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() =>
          makeChainable(whereResults[whereCallIdx++] ?? []),
        ),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;

    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getBracket({ competitionId: 'comp_1' });

    expect(result.matchups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Helpers for integration-style tests that need a real DB chain mock
// ---------------------------------------------------------------------------

function createLazyResult(result: unknown[]) {
  return {
    then: (
      onfulfilled: (v: unknown) => unknown,
      onrejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected: (e: unknown) => unknown) =>
      Promise.resolve(result).catch(onrejected),
    finally: (cb: () => unknown) => Promise.resolve(result).finally(cb),
    orderBy: vi.fn().mockResolvedValue(result),
    [Symbol.toStringTag]: 'Promise' as const,
  };
}

// Build a mock DB for submitScore (transaction-based, sequential where() calls)
// `postCommitStandingsRows` mocks the non-transactional db.db.select() chain
// used by the post-commit standings broadcast in submitScore. If omitted, the
// chain throws TypeError (db.db.select is undefined) and the try/catch in the
// router swallows it — safe default for tests that don't care about standings.
function makeSubmitScoreTxDb(
  selectResults: unknown[][],
  postCommitStandingsRows?: unknown[],
) {
  let callIdx = 0;
  const txMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() =>
        createLazyResult(selectResults[callIdx++] ?? []),
      ),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  };
  const dbMock: Record<string, unknown> = {
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
  };
  if (postCommitStandingsRows !== undefined) {
    dbMock['select'] = vi.fn().mockReturnThis();
    dbMock['from'] = vi.fn().mockReturnThis();
    dbMock['innerJoin'] = vi.fn().mockReturnThis();
    dbMock['where'] = vi
      .fn()
      .mockImplementation(() => createLazyResult(postCommitStandingsRows));
  }
  return { db: dbMock } as any;
}

// Build a mock DB for getJudgeAssignments (now transaction-based)
function makeGetAssignmentsDb(selectResults: unknown[][]) {
  let callIdx = 0;
  const txMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() =>
        createLazyResult(selectResults[callIdx++] ?? []),
      ),
  };
  return {
    db: {
      transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
    },
  } as any;
}

// Build a mock DB for submitScore where the score insert throws a DB error
function makeSubmitScoreTxDbWithInsertError(
  selectResults: unknown[][],
  insertError: unknown,
) {
  let callIdx = 0;
  const txMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() =>
        createLazyResult(selectResults[callIdx++] ?? []),
      ),
    insert: vi
      .fn()
      .mockReturnValue({ values: vi.fn().mockRejectedValue(insertError) }),
  };
  return {
    db: {
      transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
    },
  } as any;
}

function makeFullGateway(): ICompetitionGateway {
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
    getJudgePresence: vi.fn().mockReturnValue([]),
    clearPresence: vi.fn(),
  };
}

function makeCallerFor(
  db: any,
  gateway: ICompetitionGateway,
  userId: string | null = null,
) {
  const r = createTournamentRouter(db, gateway);
  const appR = t.router({ tournament: r });
  return appR.createCaller({ userId, clientIp: '127.0.0.1' });
}

// ---------------------------------------------------------------------------
// submitScore tests
// ---------------------------------------------------------------------------

const VALID_SESSION = {
  id: 'session_1',
  competitionId: 'comp_1',
  groupIndex: 0,
};
const ACTIVE_COMP = { status: 'active' };
const MATCHING_ASSIGNMENT = { groupIndex: 0 };
const MAX_SEQ = { maxSeq: 1 };

const MOCK_CRITERIA = [
  { id: 'musicality', name: 'Musicality', minScore: '0.00', maxScore: '10.00' },
  { id: 'technique', name: 'Technique', minScore: '0.00', maxScore: '10.00' },
  { id: 'creativity', name: 'Creativity', minScore: '0.00', maxScore: '10.00' },
  {
    id: 'overall-impression',
    name: 'Overall Impression',
    minScore: '0.00',
    maxScore: '10.00',
  },
];

const VALID_SCORES = [
  { criterionId: 'musicality', value: '8.00' },
  { criterionId: 'technique', value: '7.50' },
  { criterionId: 'creativity', value: '9.00' },
  { criterionId: 'overall-impression', value: '8.50' },
];

describe('tournament.submitScore', () => {
  it('rejects empty token (Zod error)', async () => {
    await expect(
      caller(null).tournament.submitScore({
        token: '',
        competitorId: 'comp_1',
        scores: [{ criterionId: 'musicality', value: '8.00' }],
        idempotencyKey: 'key_1',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects score value with invalid format (Zod error)', async () => {
    await expect(
      caller(null).tournament.submitScore({
        token: 'some-token',
        competitorId: 'comp_1',
        scores: [{ criterionId: 'musicality', value: '8' }], // missing .XX
        idempotencyKey: 'key_1',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when token is invalid', async () => {
    const db = makeSubmitScoreTxDb([[]]);
    const c = makeCallerFor(db, makeFullGateway());
    await expect(
      c.tournament.submitScore({
        token: 'bad-token',
        competitorId: 'comp_1',
        scores: VALID_SCORES,
        idempotencyKey: 'key_1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST with PHASE_NOT_ACTIVE when competition is draft', async () => {
    const db = makeSubmitScoreTxDb([[VALID_SESSION], [{ status: 'draft' }]]);
    const c = makeCallerFor(db, makeFullGateway());
    const err = await c.tournament
      .submitScore({
        token: 'valid-token',
        competitorId: 'comp_1',
        scores: VALID_SCORES,
        idempotencyKey: 'key_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({ errorCode: 'PHASE_NOT_ACTIVE' });
  });

  it('returns { success: true, idempotent: true } on duplicate idempotencyKey', async () => {
    const db = makeSubmitScoreTxDb([
      [VALID_SESSION],
      [ACTIVE_COMP],
      [{ id: 'existing_score' }], // idempotency hit
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.submitScore({
      token: 'valid-token',
      competitorId: 'comp_1',
      scores: VALID_SCORES,
      idempotencyKey: 'dup-key',
    });
    expect(result).toEqual({ success: true, idempotent: true });
  });

  it('throws BAD_REQUEST with COMPETITOR_NOT_ASSIGNED when competitor is in different group', async () => {
    const db = makeSubmitScoreTxDb([
      [VALID_SESSION], // session groupIndex: 0
      [ACTIVE_COMP],
      [], // no existing score
      [{ groupIndex: 1 }], // assignment groupIndex: 1 ≠ 0
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const err = await c.tournament
      .submitScore({
        token: 'valid-token',
        competitorId: 'comp_wrong',
        scores: VALID_SCORES,
        idempotencyKey: 'key_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'COMPETITOR_NOT_ASSIGNED',
    });
  });

  it('throws BAD_REQUEST with PHASE_NOT_ACTIVE when judge has no group assigned', async () => {
    const sessionWithNullGroup = { ...VALID_SESSION, groupIndex: null };
    const db = makeSubmitScoreTxDb([
      [sessionWithNullGroup],
      [ACTIVE_COMP],
      [], // no existing idempotency key
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const err = await c.tournament
      .submitScore({
        token: 'valid-token',
        competitorId: 'comp_1',
        scores: VALID_SCORES,
        idempotencyKey: 'key_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({ errorCode: 'PHASE_NOT_ACTIVE' });
  });

  it('throws BAD_REQUEST with SCORE_OUTSIDE_RANGE when score value exceeds criterion max', async () => {
    const singleCriterion = [
      {
        id: 'musicality',
        name: 'Musicality',
        minScore: '0.00',
        maxScore: '10.00',
      },
    ];
    const db = makeSubmitScoreTxDb([
      [VALID_SESSION],
      [ACTIVE_COMP],
      [], // no existing score
      [MATCHING_ASSIGNMENT],
      singleCriterion, // criteria
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const err = await c.tournament
      .submitScore({
        token: 'valid-token',
        competitorId: 'comp_1',
        scores: [{ criterionId: 'musicality', value: '11.00' }],
        idempotencyKey: 'key_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'SCORE_OUTSIDE_RANGE',
    });
  });

  it('throws BAD_REQUEST with SCORE_OUTSIDE_RANGE when a criterion score is missing', async () => {
    const db = makeSubmitScoreTxDb([
      [VALID_SESSION],
      [ACTIVE_COMP],
      [], // no existing score
      [MATCHING_ASSIGNMENT],
      MOCK_CRITERIA, // 4 criteria required
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const err = await c.tournament
      .submitScore({
        token: 'valid-token',
        competitorId: 'comp_1',
        scores: [{ criterionId: 'musicality', value: '8.00' }], // only 1 of 4 submitted
        idempotencyKey: 'key_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'SCORE_OUTSIDE_RANGE',
    });
  });

  it('throws CONFLICT with SCORE_ALREADY_SUBMITTED when DB unique constraint fires', async () => {
    const db = makeSubmitScoreTxDbWithInsertError(
      [
        [VALID_SESSION],
        [ACTIVE_COMP],
        [], // no idempotency key match
        [MATCHING_ASSIGNMENT],
        MOCK_CRITERIA,
        [MAX_SEQ],
      ],
      Object.assign(new Error('unique violation'), { code: '23505' }),
    );
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitScore({
        token: 'valid-token',
        competitorId: 'comp_1',
        scores: VALID_SCORES,
        idempotencyKey: 'new-key',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'SCORE_ALREADY_SUBMITTED',
    });
  });

  it('throws BAD_REQUEST with SCORE_OUTSIDE_RANGE when an unknown criterionId is submitted', async () => {
    const db = makeSubmitScoreTxDb([
      [VALID_SESSION],
      [ACTIVE_COMP],
      [], // no existing score
      [MATCHING_ASSIGNMENT],
      MOCK_CRITERIA,
    ]);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitScore({
        token: 'valid-token',
        competitorId: 'comp_1',
        scores: [
          ...VALID_SCORES,
          { criterionId: 'ghost-criterion', value: '9.99' },
        ],
        idempotencyKey: 'key_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'SCORE_OUTSIDE_RANGE',
    });
  });

  it('idempotency check is scoped per judge session (AND judgeSessionId condition)', async () => {
    // Judge B sends the same idempotencyKey as Judge A. The per-judge scoping
    // means judge B's select returns [] (no match for their session) and we
    // advance past the short-circuit. We verify by driving the mock past the
    // idempotency select with the full happy-path tail.
    const db = makeSubmitScoreTxDb(
      [
        [VALID_SESSION], // session lookup
        [ACTIVE_COMP],
        [], // per-judge idempotency select returns [] even though key is shared
        [MATCHING_ASSIGNMENT],
        MOCK_CRITERIA,
        [MAX_SEQ],
      ],
      [],
    );
    const gateway = makeFullGateway();
    const result = await makeCallerFor(db, gateway).tournament.submitScore({
      token: 'valid-token',
      competitorId: 'comp_1',
      scores: VALID_SCORES,
      idempotencyKey: 'shared-across-judges-key',
    });
    expect(result).toEqual({ success: true, idempotent: false });
  });

  it('returns { success: true, idempotent: false } and broadcasts on valid submission', async () => {
    const db = makeSubmitScoreTxDb(
      [
        [VALID_SESSION],
        [ACTIVE_COMP],
        [], // no existing score
        [MATCHING_ASSIGNMENT],
        MOCK_CRITERIA, // criteria
        [MAX_SEQ],
      ],
      [],
    );
    const gateway = makeFullGateway();
    const c = makeCallerFor(db, gateway);
    const result = await c.tournament.submitScore({
      token: 'valid-token',
      competitorId: 'comp_1',
      scores: VALID_SCORES,
      idempotencyKey: 'key_1',
    });
    expect(result).toEqual({ success: true, idempotent: false });
    expect(gateway.broadcastScoreSubmitted).toHaveBeenCalledOnce();
  });

  it('broadcasts standings.updated with aggregated leaderboard after commit', async () => {
    // Post-commit rows simulate the state of the scores table after the insert.
    // Two judges scored competitor_1; totals 33.00 + 20.00 = 53.00.
    const postCommitRows = [
      {
        competitorId: 'competitor_1',
        judgeSessionId: 'session_A',
        criteriaScores: [
          { criterionId: 'musicality', value: '8.00' },
          { criterionId: 'technique', value: '7.50' },
          { criterionId: 'creativity', value: '9.00' },
          { criterionId: 'overall-impression', value: '8.50' },
        ],
        competitorName: 'DJ Sample',
        participantId: 'MC-001',
      },
      {
        competitorId: 'competitor_1',
        judgeSessionId: 'session_B',
        criteriaScores: [
          { criterionId: 'musicality', value: '5.00' },
          { criterionId: 'technique', value: '5.00' },
          { criterionId: 'creativity', value: '5.00' },
          { criterionId: 'overall-impression', value: '5.00' },
        ],
        competitorName: 'DJ Sample',
        participantId: 'MC-001',
      },
    ];
    const db = makeSubmitScoreTxDb(
      [
        [VALID_SESSION],
        [ACTIVE_COMP],
        [],
        [MATCHING_ASSIGNMENT],
        MOCK_CRITERIA,
        [MAX_SEQ],
      ],
      postCommitRows,
    );
    const gateway = makeFullGateway();
    const c = makeCallerFor(db, gateway);

    await c.tournament.submitScore({
      token: 'valid-token',
      competitorId: 'competitor_1',
      scores: VALID_SCORES,
      idempotencyKey: 'broadcast_test_key',
    });

    expect(gateway.broadcastStandingsUpdated).toHaveBeenCalledOnce();
    const call = (gateway.broadcastStandingsUpdated as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(call?.[0]).toBe('comp_1');
    const standings = call?.[1] as Array<{
      rank: number;
      competitorId: string;
      totalScore: string;
      judgeCount: number;
    }>;
    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({
      rank: 1,
      competitorId: 'competitor_1',
      totalScore: '53.00', // 33.00 (judge A) + 20.00 (judge B)
      judgeCount: 2,
    });
  });

  it('does NOT broadcast standings when submitScore returns idempotent: true', async () => {
    const db = makeSubmitScoreTxDb([
      [VALID_SESSION],
      [ACTIVE_COMP],
      [{ id: 'existing_score' }], // idempotency hit
    ]);
    const gateway = makeFullGateway();
    const c = makeCallerFor(db, gateway);

    const result = await c.tournament.submitScore({
      token: 'valid-token',
      competitorId: 'competitor_1',
      scores: VALID_SCORES,
      idempotencyKey: 'duplicate_key',
    });

    expect(result).toEqual({ success: true, idempotent: true });
    expect(gateway.broadcastScoreSubmitted).not.toHaveBeenCalled();
    expect(gateway.broadcastStandingsUpdated).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Extended getJudgeAssignments tests
// ---------------------------------------------------------------------------

describe('public procedure rate limiting', () => {
  it('throws TOO_MANY_REQUESTS once submitScore exceeds the per-IP budget', async () => {
    const db = makeSubmitScoreTxDb([[]]); // any DB — first call just throws NOT_FOUND
    const c = makeCallerFor(db, makeFullGateway());
    // SUBMIT_RL = 30/min. Drive 30 NOT_FOUND-producing calls through, then the
    // 31st should be rejected by rate limit BEFORE the DB is touched.
    for (let i = 0; i < 30; i += 1) {
      await c.tournament
        .submitScore({
          token: 'bad-token',
          competitorId: 'comp_1',
          scores: VALID_SCORES,
          idempotencyKey: `key_${i}`,
        })
        .catch(() => undefined);
    }
    const err = await c.tournament
      .submitScore({
        token: 'bad-token',
        competitorId: 'comp_1',
        scores: VALID_SCORES,
        idempotencyKey: 'key_31',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});

describe('tournament.getJudgeAssignments (extended)', () => {
  it('returns criteria and scoredCompetitorIds when phase is started', async () => {
    const mockSession = {
      id: 'session_1',
      competitionId: 'comp_1',
      groupIndex: 0,
      label: 'Judge 1',
    };
    const mockAssigned = [
      { id: 'competitor_1', participantId: 'MC-001', name: 'DJ Sample' },
    ];
    const mockCriteria = [
      {
        id: 'crit_1',
        name: 'Musicality',
        minScore: '0.00',
        maxScore: '10.00',
        displayOrder: 0,
      },
    ];
    const mockScoredRows = [{ competitorId: 'competitor_1' }];

    // getJudgeAssignments (tx): session → assigned → criteria → scored
    const db = makeGetAssignmentsDb([
      [mockSession],
      mockAssigned,
      mockCriteria,
      mockScoredRows,
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getJudgeAssignments({
      token: 'valid-token',
    });

    expect(result.phaseStarted).toBe(true);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]).toMatchObject({ name: 'Musicality' });
    expect(result.scoredCompetitorIds).toEqual(['competitor_1']);
  });

  it('returns empty criteria and scoredCompetitorIds when phase has not started', async () => {
    const mockSession = {
      id: 'session_1',
      competitionId: 'comp_1',
      groupIndex: null,
      label: 'Judge 1',
    };
    const db = makeGetAssignmentsDb([[mockSession]]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getJudgeAssignments({
      token: 'valid-token',
    });

    expect(result.phaseStarted).toBe(false);
    expect(result.criteria).toEqual([]);
    expect(result.scoredCompetitorIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getStandings tests
// ---------------------------------------------------------------------------

// getStandings uses a direct db.db.select().from().innerJoin().where() chain
// (no transaction). Story 6.1 added 2 parallel queries (criteria + judges)
// alongside the scores query — the helper cycles results per .where() call:
//   1st call → scoreRows (joined with competitors)
//   2nd call → criteriaRows (evaluation_criteria)
//   3rd call → judgeRows (judge_sessions)
// Existing tests pass only scoreRows; criteriaRows and judgeRows default to [],
// which yields empty criteriaBreakdown and a single "Ungrouped" groupBreakdown
// entry per judge — invisible to existing assertions.
function makeStandingsDb(
  scoreRows: unknown[],
  options: { criteriaRows?: unknown[]; judgeRows?: unknown[] } = {},
) {
  const { criteriaRows = [], judgeRows = [] } = options;
  const queue = [scoreRows, criteriaRows, judgeRows];
  let idx = 0;
  const dbMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      const result = queue[idx] ?? [];
      idx += 1;
      return createLazyResult(result);
    }),
  };
  return { db: dbMock } as any;
}

describe('tournament.getStandings', () => {
  it('returns empty array when no scores have been submitted', async () => {
    const db = makeStandingsDb([]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });
    expect(result).toEqual([]);
  });

  it('returns rank 1 with correct totalScore for a single judge single competitor', async () => {
    const db = makeStandingsDb([
      {
        competitorId: 'competitor_1',
        judgeSessionId: 'session_1',
        // Two criteria: 8.00 + 7.50 = 15.50
        criteriaScores: [
          { criterionId: 'musicality', value: '8.00' },
          { criterionId: 'technique', value: '7.50' },
        ],
        competitorName: 'DJ Sample',
        participantId: 'MC-001',
      },
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rank: 1,
      competitorId: 'competitor_1',
      competitorName: 'DJ Sample',
      participantId: 'MC-001',
      totalScore: '15.50',
      judgeCount: 1,
    });
    expect(result[0]?.scoresByJudge['session_1']).toBe('15.50');
  });

  it('sums totals across multiple judges for the same competitor', async () => {
    // Judge A: 8.00 + 9.00 = 17.00
    // Judge B: 6.00 + 7.00 = 13.00
    // Expected competitor total: 17.00 + 13.00 = 30.00
    const db = makeStandingsDb([
      {
        competitorId: 'competitor_1',
        judgeSessionId: 'session_A',
        criteriaScores: [
          { criterionId: 'musicality', value: '8.00' },
          { criterionId: 'technique', value: '9.00' },
        ],
        competitorName: 'DJ Sample',
        participantId: 'MC-001',
      },
      {
        competitorId: 'competitor_1',
        judgeSessionId: 'session_B',
        criteriaScores: [
          { criterionId: 'musicality', value: '6.00' },
          { criterionId: 'technique', value: '7.00' },
        ],
        competitorName: 'DJ Sample',
        participantId: 'MC-001',
      },
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });

    expect(result).toHaveLength(1);
    expect(result[0]?.totalScore).toBe('30.00');
    expect(result[0]?.judgeCount).toBe(2);
    expect(result[0]?.scoresByJudge['session_A']).toBe('17.00');
    expect(result[0]?.scoresByJudge['session_B']).toBe('13.00');
  });

  it('sorts multiple competitors by totalScore descending and assigns correct ranks', async () => {
    // Competitor A: 8.00 total, Competitor B: 9.50 total, Competitor C: 7.00 total
    // Expected rank: B (1), A (2), C (3)
    const db = makeStandingsDb([
      {
        competitorId: 'comp_A',
        judgeSessionId: 'session_1',
        criteriaScores: [{ criterionId: 'musicality', value: '8.00' }],
        competitorName: 'Alpha',
        participantId: 'P-001',
      },
      {
        competitorId: 'comp_B',
        judgeSessionId: 'session_1',
        criteriaScores: [{ criterionId: 'musicality', value: '9.50' }],
        competitorName: 'Beta',
        participantId: 'P-002',
      },
      {
        competitorId: 'comp_C',
        judgeSessionId: 'session_1',
        criteriaScores: [{ criterionId: 'musicality', value: '7.00' }],
        competitorName: 'Gamma',
        participantId: 'P-003',
      },
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      rank: 1,
      competitorName: 'Beta',
      totalScore: '9.50',
    });
    expect(result[1]).toMatchObject({
      rank: 2,
      competitorName: 'Alpha',
      totalScore: '8.00',
    });
    expect(result[2]).toMatchObject({
      rank: 3,
      competitorName: 'Gamma',
      totalScore: '7.00',
    });
  });

  it('throws TOO_MANY_REQUESTS once getStandings exceeds the per-IP rate limit', async () => {
    // PUBLIC_RL = 60 req/min. Drive 60 calls through, then the 61st is rejected.
    const db = makeStandingsDb([]);
    const c = makeCallerFor(db, makeFullGateway());
    for (let i = 0; i < 60; i += 1) {
      await c.tournament
        .getStandings({ competitionId: 'comp_1' })
        .catch(() => undefined);
    }
    const err = await c.tournament
      .getStandings({ competitionId: 'comp_1' })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('filters malformed criteriaScores entries instead of returning "NaN" totalScore', async () => {
    // Simulate a corrupted jsonb row: non-string values, missing fields,
    // non-X.XX format. These must NOT propagate to totalScore as "NaN".
    const db = makeStandingsDb([
      {
        competitorId: 'comp_A',
        judgeSessionId: 'session_1',
        // Mix of valid and malformed entries — valid ones should still count.
        criteriaScores: [
          { criterionId: 'musicality', value: '8.00' },
          { criterionId: 'technique', value: 7.5 }, // number, not string
          { criterionId: 'creativity', value: '9' }, // not X.XX format
          null, // null entry
          { value: '5.00' }, // missing criterionId
          { criterionId: 'overall', value: '8.50' },
        ],
        competitorName: 'Alpha',
        participantId: 'P-001',
      },
      {
        competitorId: 'comp_B',
        judgeSessionId: 'session_1',
        criteriaScores: null, // fully corrupted row
        competitorName: 'Beta',
        participantId: 'P-002',
      },
    ]);
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });

    expect(result).toHaveLength(2);
    // comp_A: only 8.00 + 8.50 = 16.50 from valid entries (others filtered)
    const alpha = result.find((r) => r.competitorId === 'comp_A');
    expect(alpha?.totalScore).toBe('16.50');
    // comp_B: null array → 0.00, not NaN
    const beta = result.find((r) => r.competitorId === 'comp_B');
    expect(beta?.totalScore).toBe('0.00');
    // No entry should have "NaN"
    for (const entry of result) {
      expect(entry.totalScore).not.toBe('NaN');
      expect(parseFloat(entry.totalScore)).not.toBeNaN();
    }
  });

  it('AC #8: SQL filter combines competitionId AND competitors.status=active', async () => {
    // Capture the WHERE call argument to verify the SQL filter is the result
    // of `and(...)` (multiple conditions) — not `eq(...)` (single condition).
    // Drizzle's `and()` returns an SQL chunk whose `.queryChunks` array contains
    // the underlying conditions. A bare `eq()` would have a different shape.
    const captured: unknown[] = [];
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((arg: unknown) => {
        captured.push(arg);
        return createLazyResult([]);
      }),
    };
    const db = { db: dbMock } as any;
    const c = makeCallerFor(db, makeFullGateway());
    await c.tournament.getStandings({ competitionId: 'comp_1' });

    // Story 6.1: getStandings now also fires criteria + judges queries in
    // parallel. The first capture is the scores WHERE — that's the one we
    // assert on for the AC #8 contract.
    expect(captured.length).toBeGreaterThanOrEqual(1);
    const whereArg = captured[0] as { queryChunks?: unknown[] };
    // `and(eq(...), eq(...))` produces an SQL whose queryChunks include both
    // sub-expressions. A single `eq(scores.competitionId, ...)` would not
    // produce a multi-chunk structure with multiple eq sub-expressions.
    const chunks = whereArg.queryChunks;
    expect(Array.isArray(chunks)).toBe(true);
    // Recursively walk the chunks tree and collect any chunks that look like
    // column references with `.name` set. We expect references to BOTH the
    // competitions/scores `competition_id` column AND the competitors `status` column.
    const columnNames: string[] = [];
    function walk(node: unknown): void {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const x of node) walk(x);
        return;
      }
      if (typeof node === 'object') {
        const n = node as { name?: unknown; queryChunks?: unknown };
        if (typeof n.name === 'string') columnNames.push(n.name);
        if (n.queryChunks) walk(n.queryChunks);
      }
    }
    walk(chunks);
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('competition_id');
  });

  // ─── Story 6.1: getStandings enrichment ──────────────────────────────────

  it('Story 6.1: criteriaBreakdown populated with criterion names from evaluation_criteria', async () => {
    const db = makeStandingsDb(
      [
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_1',
          criteriaScores: [
            { criterionId: 'crit_foundations', value: '8.50' },
            { criterionId: 'crit_musicality', value: '7.75' },
            { criterionId: 'crit_style', value: '9.00' },
          ],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
      ],
      {
        criteriaRows: [
          { id: 'crit_foundations', name: 'Foundations' },
          { id: 'crit_musicality', name: 'Musicality' },
          { id: 'crit_style', name: 'Style' },
        ],
        judgeRows: [{ id: 'js_1', groupIndex: 0, label: 'Judge 1' }],
      },
    );
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });
    expect(result[0]?.criteriaBreakdown).toEqual([
      {
        criterionId: 'crit_foundations',
        criterionName: 'Foundations',
        total: '8.50',
        judgeCount: 1,
      },
      {
        criterionId: 'crit_musicality',
        criterionName: 'Musicality',
        total: '7.75',
        judgeCount: 1,
      },
      {
        criterionId: 'crit_style',
        criterionName: 'Style',
        total: '9.00',
        judgeCount: 1,
      },
    ]);
  });

  it('Story 6.1: groupBreakdown sums per-judge totals by groupIndex', async () => {
    // 4 judges across 2 groups (A=0, B=1).
    // Group A: judge 1 (8) + judge 2 (7) = 15
    // Group B: judge 3 (9) + judge 4 (6) = 15
    const db = makeStandingsDb(
      [
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_1',
          criteriaScores: [{ criterionId: 'c1', value: '8.00' }],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_2',
          criteriaScores: [{ criterionId: 'c1', value: '7.00' }],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_3',
          criteriaScores: [{ criterionId: 'c1', value: '9.00' }],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_4',
          criteriaScores: [{ criterionId: 'c1', value: '6.00' }],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
      ],
      {
        criteriaRows: [{ id: 'c1', name: 'C1' }],
        judgeRows: [
          { id: 'js_1', groupIndex: 0, label: 'J1' },
          { id: 'js_2', groupIndex: 0, label: 'J2' },
          { id: 'js_3', groupIndex: 1, label: 'J3' },
          { id: 'js_4', groupIndex: 1, label: 'J4' },
        ],
      },
    );
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });
    expect(result[0]?.groupBreakdown).toEqual([
      { groupIndex: 0, groupLabel: 'Group A', total: '15.00', judgeCount: 2 },
      { groupIndex: 1, groupLabel: 'Group B', total: '15.00', judgeCount: 2 },
    ]);
  });

  it('Story 6.1: drops criteria entries whose criterionId no longer exists (renamed/deleted)', async () => {
    const db = makeStandingsDb(
      [
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_1',
          criteriaScores: [
            { criterionId: 'crit_alive', value: '8.00' },
            { criterionId: 'crit_orphan', value: '5.00' },
          ],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
      ],
      {
        // Only crit_alive is in the current criteria table.
        criteriaRows: [{ id: 'crit_alive', name: 'Alive' }],
        judgeRows: [{ id: 'js_1', groupIndex: 0, label: 'J1' }],
      },
    );
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });
    expect(result[0]?.criteriaBreakdown).toEqual([
      {
        criterionId: 'crit_alive',
        criterionName: 'Alive',
        total: '8.00',
        judgeCount: 1,
      },
    ]);
    // Total still includes both raw scores (the breakdown drop is display-only).
    expect(result[0]?.totalScore).toBe('13.00');
  });

  it('Story 6.1: scoresByJudge regression — still populated for organizer-side dashboard consumers', async () => {
    const db = makeStandingsDb(
      [
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_1',
          criteriaScores: [{ criterionId: 'c1', value: '8.00' }],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
        {
          competitorId: 'comp_A',
          judgeSessionId: 'js_2',
          criteriaScores: [{ criterionId: 'c1', value: '7.00' }],
          competitorName: 'Alpha',
          participantId: 'P-001',
        },
      ],
      {
        criteriaRows: [{ id: 'c1', name: 'C1' }],
        judgeRows: [
          { id: 'js_1', groupIndex: 0, label: 'J1' },
          { id: 'js_2', groupIndex: 0, label: 'J2' },
        ],
      },
    );
    const c = makeCallerFor(db, makeFullGateway());
    const result = await c.tournament.getStandings({ competitionId: 'comp_1' });
    expect(result[0]?.scoresByJudge).toEqual({ js_1: '8.00', js_2: '7.00' });
  });
});

// ─── Story 6.1: tournament.getPublicNextMatchups ────────────────────────────

describe('tournament.getPublicNextMatchups', () => {
  // Sequential select-where chain: 1st → competition row, 2nd → matchup rows,
  // 3rd → competitor name rows. Cycles through results per .where() call.
  function makeNextMatchupsDb(
    competitionRow: unknown[] | null,
    matchupRows: unknown[],
    competitorNameRows: unknown[] = [],
  ) {
    const queue: unknown[][] = [
      competitionRow ?? [],
      matchupRows,
      competitorNameRows,
    ];
    let idx = 0;
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi
        .fn()
        .mockImplementation(() => createLazyResult(queue[idx++] ?? [])),
    };
    // Some calls don't use orderBy (competition row, competitor names) — they
    // resolve via the .where() thenable directly.
    dbMock.where = vi.fn().mockImplementation(() => {
      // If next call is the matchup rows (which uses orderBy), return a chainable
      // that defers execution to orderBy. Otherwise resolve immediately here.
      const nextResult = queue[idx];
      // Heuristic: matchup rows always include `roundNumber`; the others don't.
      const looksLikeMatchups =
        Array.isArray(nextResult) &&
        nextResult.length > 0 &&
        typeof (nextResult[0] as { roundNumber?: unknown })?.roundNumber ===
          'number';
      if (looksLikeMatchups) {
        // Caller will call .orderBy(...) next — return a chainable that
        // resolves on orderBy.
        return {
          orderBy: vi.fn().mockImplementation(() => {
            const r = queue[idx++] ?? [];
            return createLazyResult(r);
          }),
        };
      }
      const r = queue[idx++] ?? [];
      return createLazyResult(r);
    });
    return { db: dbMock } as any;
  }

  it('rejects empty competitionId (Zod)', async () => {
    await expect(
      caller(null).tournament.getPublicNextMatchups({ competitionId: '' }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when competition does not exist', async () => {
    const db = makeNextMatchupsDb(null, []);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.getPublicNextMatchups({ competitionId: 'comp_404' })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns [] when cypherCompletedAt is null (battles not active)', async () => {
    const db = makeNextMatchupsDb(
      [{ id: 'comp_1', cypherCompletedAt: null }],
      [],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicNextMatchups({ competitionId: 'comp_1' });
    expect(result).toEqual([]);
  });

  it('returns 2 entries per pending matchup (one per competitor) with opponent cross-pointing', async () => {
    const db = makeNextMatchupsDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date() }],
      [
        // Round 1, all resolved
        {
          id: 'm_r1_0',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          isBye: false,
          winnerCompetitorId: 'c_a',
        },
        {
          id: 'm_r1_1',
          roundNumber: 1,
          bracketPosition: 1,
          competitorAId: 'c_c',
          competitorBId: 'c_d',
          isBye: false,
          winnerCompetitorId: 'c_c',
        },
        // Round 2, pending
        {
          id: 'm_r2_0',
          roundNumber: 2,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_c',
          isBye: false,
          winnerCompetitorId: null,
        },
      ],
      [
        { id: 'c_a', name: 'Alpha' },
        { id: 'c_c', name: 'Gamma' },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicNextMatchups({ competitionId: 'comp_1' });
    expect(result).toHaveLength(2);
    const forA = result.find((r) => r.competitorId === 'c_a');
    const forC = result.find((r) => r.competitorId === 'c_c');
    expect(forA).toMatchObject({
      matchupId: 'm_r2_0',
      roundNumber: 2,
      bracketPosition: 0,
      opponentCompetitorId: 'c_c',
      opponentName: 'Gamma',
    });
    expect(forC).toMatchObject({
      matchupId: 'm_r2_0',
      roundNumber: 2,
      bracketPosition: 0,
      opponentCompetitorId: 'c_a',
      opponentName: 'Alpha',
    });
  });

  it('skips bye matchups when computing the current round', async () => {
    const db = makeNextMatchupsDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date() }],
      [
        // Round 1 has 1 real + 1 bye; bye is pre-resolved.
        {
          id: 'm_bye',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_top',
          competitorBId: null,
          isBye: true,
          winnerCompetitorId: 'c_top',
        },
        {
          id: 'm_real',
          roundNumber: 1,
          bracketPosition: 1,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          isBye: false,
          winnerCompetitorId: null,
        },
      ],
      [
        { id: 'c_a', name: 'Alpha' },
        { id: 'c_b', name: 'Bravo' },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicNextMatchups({ competitionId: 'comp_1' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.matchupId === 'm_real')).toBe(true);
  });

  it('returns [] when all matchups are resolved', async () => {
    const db = makeNextMatchupsDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date() }],
      [
        {
          id: 'm_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          isBye: false,
          winnerCompetitorId: 'c_a',
        },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicNextMatchups({ competitionId: 'comp_1' });
    expect(result).toEqual([]);
  });

  it('throws TOO_MANY_REQUESTS once getPublicNextMatchups exceeds the per-IP rate limit', async () => {
    const db = makeNextMatchupsDb(
      [{ id: 'comp_1', cypherCompletedAt: null }],
      [],
    );
    const c = makeCallerFor(db, makeFullGateway());
    for (let i = 0; i < 60; i += 1) {
      await c.tournament
        .getPublicNextMatchups({ competitionId: 'comp_1' })
        .catch(() => undefined);
    }
    const err = await c.tournament
      .getPublicNextMatchups({ competitionId: 'comp_1' })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});

// ─── Story 6.2: tournament.getPublicBracket ──────────────────────────────────

describe('tournament.getPublicBracket', () => {
  // Sequential chain: 1st .where() → competition row, 2nd .where() → matchup
  // rows (calls .orderBy()), 3rd .where() → competitor name rows.
  function makePublicBracketDb(
    competitionRow: unknown[] | null,
    matchupRows: unknown[],
    competitorNameRows: unknown[] = [],
  ) {
    const queue: unknown[][] = [
      competitionRow ?? [],
      matchupRows,
      competitorNameRows,
    ];
    let idx = 0;
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const nextResult = queue[idx];
        const looksLikeMatchups =
          Array.isArray(nextResult) &&
          nextResult.length > 0 &&
          typeof (nextResult[0] as { roundNumber?: unknown })?.roundNumber ===
            'number';
        if (looksLikeMatchups) {
          return {
            orderBy: vi.fn().mockImplementation(() => {
              const r = queue[idx++] ?? [];
              return createLazyResult(r);
            }),
          };
        }
        const r = queue[idx++] ?? [];
        return createLazyResult(r);
      }),
      orderBy: vi
        .fn()
        .mockImplementation(() => createLazyResult(queue[idx++] ?? [])),
    };
    return { db: dbMock } as any;
  }

  it('rejects empty competitionId (Zod)', async () => {
    await expect(
      caller(null).tournament.getPublicBracket({ competitionId: '' }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when competition does not exist', async () => {
    const db = makePublicBracketDb(null, []);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.getPublicBracket({ competitionId: 'comp_404' })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns empty bracket when cypherCompletedAt is null', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: null, status: 'active' }],
      [],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicBracket({ competitionId: 'comp_1' });
    expect(result).toEqual({
      matchups: [],
      championCompetitorId: null,
      currentRoundNumber: null,
    });
  });

  it('returns matchups with competitor names when battles are active', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date(), status: 'active' }],
      [
        {
          id: 'm_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          seedA: 1,
          seedB: 4,
          isBye: false,
          winnerCompetitorId: null,
        },
        {
          id: 'm_2',
          roundNumber: 1,
          bracketPosition: 1,
          competitorAId: 'c_c',
          competitorBId: null,
          seedA: 2,
          seedB: null,
          isBye: true,
          winnerCompetitorId: 'c_c',
        },
      ],
      [
        { id: 'c_a', name: 'Alpha', participantId: 'P-001' },
        { id: 'c_b', name: 'Bravo', participantId: 'P-002' },
        { id: 'c_c', name: 'Charlie', participantId: 'P-003' },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicBracket({ competitionId: 'comp_1' });

    expect(result.matchups).toHaveLength(2);
    expect(result.matchups[0]?.competitorA).toEqual({
      name: 'Alpha',
      participantId: 'P-001',
    });
    expect(result.matchups[0]?.competitorB).toEqual({
      name: 'Bravo',
      participantId: 'P-002',
    });
    expect(result.matchups[1]?.isBye).toBe(true);
    expect(result.matchups[1]?.winnerCompetitorId).toBe('c_c');
    expect(result.currentRoundNumber).toBe(1);
    expect(result.championCompetitorId).toBeNull();
  });

  it('does not return admin-only fields (tieStatus, revoteCount, etc.)', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date(), status: 'active' }],
      [
        {
          id: 'm_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          seedA: 1,
          seedB: 2,
          isBye: false,
          winnerCompetitorId: null,
        },
      ],
      [
        { id: 'c_a', name: 'Alpha', participantId: 'P-001' },
        { id: 'c_b', name: 'Bravo', participantId: 'P-002' },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicBracket({ competitionId: 'comp_1' });
    const matchup = result.matchups[0] as Record<string, unknown>;
    expect(matchup['tieStatus']).toBeUndefined();
    expect(matchup['revoteCount']).toBeUndefined();
    expect(matchup['organizerDecisionReason']).toBeUndefined();
    expect(matchup['organizerDecisionBy']).toBeUndefined();
    expect(matchup['completedAt']).toBeUndefined();
  });

  it('detects champion when competition is completed', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date(), status: 'completed' }],
      [
        {
          id: 'm_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          seedA: 1,
          seedB: 2,
          isBye: false,
          winnerCompetitorId: 'c_a',
        },
        {
          id: 'm_final',
          roundNumber: 2,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_c',
          seedA: 1,
          seedB: 3,
          isBye: false,
          winnerCompetitorId: 'c_a',
        },
      ],
      [
        { id: 'c_a', name: 'Alpha', participantId: 'P-001' },
        { id: 'c_b', name: 'Bravo', participantId: 'P-002' },
        { id: 'c_c', name: 'Charlie', participantId: 'P-003' },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicBracket({ competitionId: 'comp_1' });
    expect(result.championCompetitorId).toBe('c_a');
  });

  it('derives currentRoundNumber from lowest unresolved non-bye round', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: new Date(), status: 'active' }],
      [
        {
          id: 'm_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          seedA: 1,
          seedB: 4,
          isBye: false,
          winnerCompetitorId: 'c_a',
        },
        {
          id: 'm_2',
          roundNumber: 2,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_c',
          seedA: 1,
          seedB: 2,
          isBye: false,
          winnerCompetitorId: null,
        },
      ],
      [
        { id: 'c_a', name: 'Alpha', participantId: 'P-001' },
        { id: 'c_b', name: 'Bravo', participantId: 'P-002' },
        { id: 'c_c', name: 'Charlie', participantId: 'P-003' },
      ],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicBracket({ competitionId: 'comp_1' });
    expect(result.currentRoundNumber).toBe(2);
  });

  it('succeeds without authentication (public procedure)', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: null, status: 'active' }],
      [],
    );
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getPublicBracket({ competitionId: 'comp_1' });
    expect(result.matchups).toEqual([]);
  });

  it('throws TOO_MANY_REQUESTS once getPublicBracket exceeds the per-IP rate limit', async () => {
    const db = makePublicBracketDb(
      [{ id: 'comp_1', cypherCompletedAt: null, status: 'active' }],
      [],
    );
    const c = makeCallerFor(db, makeFullGateway());
    for (let i = 0; i < 60; i += 1) {
      await c.tournament
        .getPublicBracket({ competitionId: 'comp_1' })
        .catch(() => undefined);
    }
    const err = await c.tournament
      .getPublicBracket({ competitionId: 'comp_1' })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});

// ---------------------------------------------------------------------------
// Story 3.6: completeCypherPhase integration tests
// ---------------------------------------------------------------------------

/**
 * Chainable Drizzle-style mock that's awaitable AND supports `.orderBy()` /
 * `.limit()` continuations returning the same result. Used by completeCypherPhase
 * which has a `.where(...).orderBy(...).limit(1)` event lookup chain.
 */
function makeChainable(result: unknown[]): any {
  const chainable: any = {
    then: (
      onfulfilled: (v: unknown) => unknown,
      onrejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected: (e: unknown) => unknown) =>
      Promise.resolve(result).catch(onrejected),
    finally: (cb: () => unknown) => Promise.resolve(result).finally(cb),
    [Symbol.toStringTag]: 'Promise' as const,
  };
  chainable.orderBy = vi.fn(() => chainable);
  chainable.limit = vi.fn(() => chainable);
  chainable.groupBy = vi.fn(() => chainable);
  return chainable;
}

interface CompleteCypherPhaseTxOptions {
  whereResults: unknown[][];
  insertEventThrows?: unknown;
  // When set, the Nth insert call throws insertThrowsPerCall[N] (if defined).
  // Takes precedence over insertEventThrows. Used for tests that need to make
  // a specific insert (e.g., the bracket.generated event) fail while letting
  // earlier inserts succeed.
  insertThrowsPerCall?: unknown[];
}

function makeCompleteCypherPhaseDb(opts: CompleteCypherPhaseTxOptions) {
  const { whereResults, insertEventThrows, insertThrowsPerCall } = opts;
  let callIdx = 0;
  let insertCallIdx = 0;
  const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];
  const updateSpies: Array<{
    set: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  }> = [];
  const whereArgs: unknown[] = [];

  const txMock = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation((arg: unknown) => {
      whereArgs.push(arg);
      return makeChainable(whereResults[callIdx++] ?? []);
    }),
    update: vi.fn(() => {
      const whereSpy = vi.fn().mockResolvedValue([]);
      const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
      updateSpies.push({ set: setSpy, where: whereSpy });
      return { set: setSpy };
    }),
    insert: vi.fn(() => {
      const idx = insertCallIdx++;
      const perCallErr = insertThrowsPerCall?.[idx];
      const errToThrow = perCallErr ?? insertEventThrows;
      const valuesSpy = errToThrow
        ? vi.fn().mockRejectedValue(errToThrow)
        : vi.fn().mockResolvedValue([]);
      insertSpies.push({ values: valuesSpy });
      return { values: valuesSpy };
    }),
  };

  return {
    db: {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any,
    txMock,
    insertSpies,
    updateSpies,
    whereArgs,
  };
}

const COMPETITION_ID = 'comp_abc';

interface MockComp {
  id: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  advancementThreshold: number | null;
  cypherCompletedAt: Date | null;
}

function compRow(overrides: Partial<MockComp> = {}): MockComp {
  return {
    id: COMPETITION_ID,
    status: 'active',
    advancementThreshold: 3,
    cypherCompletedAt: null,
    ...overrides,
  };
}

function scoreRow(
  competitorId: string,
  judgeSessionId: string,
  values: Array<{ criterionId: string; value: string }>,
  competitorName?: string,
  participantId?: string,
) {
  return {
    competitorId,
    judgeSessionId,
    criteriaScores: values,
    competitorName: competitorName ?? `Competitor ${competitorId}`,
    participantId: participantId ?? `P-${competitorId}`,
  };
}

describe('tournament.completeCypherPhase (integration)', () => {
  it('rejects when competition status is draft (CYPHER_NOT_ACTIVE)', async () => {
    const { db } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ status: 'draft' })], // load competition
        [], // load score rows (empty — won't matter)
      ],
    });
    const err = await makeCallerFor(db, makeFullGateway(), 'user_123')
      .tournament.completeCypherPhase({ competitionId: COMPETITION_ID })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'CYPHER_NOT_ACTIVE',
    });
  });

  it('rejects when advancementThreshold is null (ADVANCEMENT_THRESHOLD_NOT_SET)', async () => {
    const { db } = makeCompleteCypherPhaseDb({
      whereResults: [[compRow({ advancementThreshold: null })], []],
    });
    const err = await makeCallerFor(db, makeFullGateway(), 'user_123')
      .tournament.completeCypherPhase({ competitionId: COMPETITION_ID })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'ADVANCEMENT_THRESHOLD_NOT_SET',
    });
  });

  it('rejects when advancementThreshold is zero (ADVANCEMENT_THRESHOLD_NOT_SET)', async () => {
    const { db } = makeCompleteCypherPhaseDb({
      whereResults: [[compRow({ advancementThreshold: 0 })], []],
    });
    const err = await makeCallerFor(db, makeFullGateway(), 'user_123')
      .tournament.completeCypherPhase({ competitionId: COMPETITION_ID })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'ADVANCEMENT_THRESHOLD_NOT_SET',
    });
  });

  it('throws NOT_FOUND when competition does not exist', async () => {
    const { db } = makeCompleteCypherPhaseDb({
      whereResults: [[]], // no competition row
    });
    const err = await makeCallerFor(db, makeFullGateway(), 'user_123')
      .tournament.completeCypherPhase({ competitionId: 'missing' })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('happy path: 5 competitors with threshold=3 advances top-3 and emits event', async () => {
    // Single score per judge × competitor; rank by total.
    // Sorted desc by totalScore from sumScores: comp_5=9.50, comp_4=9.00, comp_3=8.50, comp_2=8.00, comp_1=7.00
    const rows = [
      scoreRow('comp_1', 'jsess_1', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('comp_2', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_3', 'jsess_1', [{ criterionId: 'c', value: '8.50' }]),
      scoreRow('comp_4', 'jsess_1', [{ criterionId: 'c', value: '9.00' }]),
      scoreRow('comp_5', 'jsess_1', [{ criterionId: 'c', value: '9.50' }]),
    ];
    const { db, insertSpies, updateSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 3 })], // load comp
        rows, // load score rows
        [{ maxSeq: 7 }], // event sequence MAX
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({
      competitionId: COMPETITION_ID,
    });
    expect(result.idempotent).toBe(false);
    expect(result.advancedCount).toBe(3);
    expect(result.totalParticipants).toBe(5);
    expect(result.advancedCompetitorIds).toEqual([
      'comp_5',
      'comp_4',
      'comp_3',
    ]);
    expect(result.finalStandings).toHaveLength(5);
    expect(result.finalStandings[0]?.totalScore).toBe('9.50');

    // The competition row was UPDATEd with cypherCompletedAt + updatedAt.
    expect(updateSpies.length).toBeGreaterThan(0);
    const setArgs = (updateSpies[0]?.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setArgs).toMatchObject({
      cypherCompletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    // Three inserts: phase.transitioned event, battle_matchups bulk, bracket.generated event.
    expect(insertSpies.length).toBe(3);
    expect(insertSpies[0]?.values).toHaveBeenCalledTimes(1);
    const eventArgs = (insertSpies[0]?.values as any).mock.calls[0][0];
    expect(eventArgs.type).toBe('phase.transitioned');
    expect(eventArgs.aggregateId).toBe(COMPETITION_ID);
    expect(eventArgs.aggregateType).toBe('competition');
    expect(eventArgs.sequence).toBe(8); // 7 + 1
    expect(eventArgs.createdBy).toBe('user_123');
    expect(eventArgs.payload.fromPhase).toBe('cypher');
    expect(eventArgs.payload.toPhase).toBe('battles');
    expect(eventArgs.payload.triggerType).toBe('admin_confirmed');
    expect(eventArgs.payload.advancedCompetitorIds).toEqual([
      'comp_5',
      'comp_4',
      'comp_3',
    ]);

    // Gateway broadcast called once.
    expect(gateway.broadcastPhaseTransitioned).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastPhaseTransitioned).toHaveBeenCalledWith(
      COMPETITION_ID,
      expect.objectContaining({
        fromPhase: 'cypher',
        toPhase: 'battles',
        advancedCompetitorIds: ['comp_5', 'comp_4', 'comp_3'],
      }),
    );
  });

  it('AC #6 — under-population: 2 competitors with threshold=3 advances all 2', async () => {
    const rows = [
      scoreRow('comp_1', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_2', 'jsess_1', [{ criterionId: 'c', value: '9.00' }]),
    ];
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 3 })],
        rows,
        [{ maxSeq: 0 }],
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({
      competitionId: COMPETITION_ID,
    });
    expect(result.idempotent).toBe(false);
    expect(result.advancedCount).toBe(2); // capped at standings.length
    expect(result.totalParticipants).toBe(2);
    expect(result.advancedCompetitorIds).toEqual(['comp_2', 'comp_1']);
    const eventArgs = (insertSpies[0]?.values as any).mock.calls[0][0];
    expect(eventArgs.payload.advancedCompetitorIds).toHaveLength(2);
  });

  it('AC #6 — pathological: zero competitors → mutation succeeds with empty advanced list', async () => {
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 3 })],
        [], // no score rows
        [{ maxSeq: 0 }],
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_123',
    ).tournament.completeCypherPhase({
      competitionId: COMPETITION_ID,
    });
    expect(result.advancedCount).toBe(0);
    expect(result.advancedCompetitorIds).toEqual([]);
    expect(result.totalParticipants).toBe(0);
    expect(insertSpies[0]?.values).toHaveBeenCalledTimes(1);
  });

  it('AC #5 — idempotency by state: already locked returns prior payload, no second event', async () => {
    const priorPayload = {
      competitionId: COMPETITION_ID,
      fromPhase: 'cypher',
      toPhase: 'battles',
      advancedCompetitorIds: ['comp_2', 'comp_1'],
      triggerType: 'admin_confirmed',
      transitionedAt: '2026-04-25T12:34:56.000Z',
    };
    const rows = [
      scoreRow('comp_1', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_2', 'jsess_1', [{ criterionId: 'c', value: '9.00' }]),
    ];
    const { db, insertSpies, updateSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [
          compRow({
            cypherCompletedAt: new Date('2026-04-25T12:34:56.000Z'),
          }),
        ], // load comp — already locked
        rows, // load score rows for the snapshot reply
        [{ payload: priorPayload }], // prior phase.transitioned event lookup
        [], // prior bracket.generated event lookup → no bracket
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({
      competitionId: COMPETITION_ID,
    });
    expect(result.idempotent).toBe(true);
    expect(result.advancedCompetitorIds).toEqual(['comp_2', 'comp_1']);
    expect(result.advancedCount).toBe(2);
    // No second UPDATE, no second INSERT, no second broadcast.
    expect(updateSpies.length).toBe(0);
    expect(insertSpies.length).toBe(0);
    expect(gateway.broadcastPhaseTransitioned).not.toHaveBeenCalled();
  });

  it('belt-and-suspenders: cypherCompletedAt set but no event row falls back to recomputed result', async () => {
    const rows = [
      scoreRow('comp_1', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_2', 'jsess_1', [{ criterionId: 'c', value: '9.00' }]),
    ];
    const { db, insertSpies, updateSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ cypherCompletedAt: new Date(), advancementThreshold: 1 })],
        rows,
        [], // phase.transitioned event lookup returns empty
        [], // bracket.generated event lookup returns empty
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });
    expect(result.idempotent).toBe(true);
    expect(result.advancedCount).toBe(1);
    expect(result.advancedCompetitorIds).toEqual(['comp_2']);
    expect(result.totalParticipants).toBe(2);
    // No second UPDATE or INSERT — fallback does not re-emit.
    expect(insertSpies.length).toBe(0);
    expect(updateSpies.length).toBe(0);
    expect(gateway.broadcastPhaseTransitioned).not.toHaveBeenCalled();
  });

  it('idempotency-by-conflict: 23505 on event INSERT re-reads winning event and returns idempotent: true', async () => {
    const winningPayload = {
      competitionId: COMPETITION_ID,
      fromPhase: 'cypher',
      toPhase: 'battles',
      advancedCompetitorIds: ['comp_winner'],
      triggerType: 'admin_confirmed',
      transitionedAt: '2026-04-25T12:00:00.000Z',
    };
    const rows = [
      scoreRow('comp_winner', 'jsess_1', [
        { criterionId: 'c', value: '10.00' },
      ]),
      scoreRow('comp_loser', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
    ];
    const conflictErr = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const { db, insertSpies, updateSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 1 })], // not yet locked from this tx's view
        rows, // standings
        [{ maxSeq: 0 }], // sequence
        [{ payload: winningPayload }], // post-23505 winning event re-read
      ],
      insertEventThrows: conflictErr,
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({
      competitionId: COMPETITION_ID,
    });
    expect(result.idempotent).toBe(true);
    expect(result.advancedCompetitorIds).toEqual(['comp_winner']);
    // bracket is null on this path — the 23505 abort prevents a safe re-read of
    // the bracket.generated event from inside the same tx. Shape consistency
    // with other idempotent paths (which return `bracket: T | null`).
    expect(result.bracket).toBeNull();
    // INSERT was attempted (and rejected) — but UPDATE happened first.
    expect(insertSpies.length).toBe(1);
    expect(updateSpies.length).toBeGreaterThan(0);
    expect(gateway.broadcastPhaseTransitioned).not.toHaveBeenCalled();
  });

  it('AC #2 — pairs aggregation regression: each individual aggregates independently across partner rotations', async () => {
    // 4 competitors representing 2 pairs (A+B, C+D). Across 3 rounds the pairs
    // rotate: round 1 pairs A+B and C+D; round 2 pairs A+C and B+D; round 3
    // pairs A+D and B+C. Each round has different judge sessions (j1, j2, j3).
    // Each individual is scored by ALL judges across rounds. The aggregation
    // should produce per-individual totals independent of who their partner
    // was in any given round.
    //
    // Per-individual expected totals (sum of all judge scores received):
    //   A: 8 (j1) + 7 (j2) + 9 (j3) = 24.00
    //   B: 6 (j1) + 5 (j2) + 7 (j3) = 18.00
    //   C: 7 (j1) + 8 (j2) + 6 (j3) = 21.00
    //   D: 5 (j1) + 6 (j2) + 4 (j3) = 15.00
    const rows = [
      scoreRow('comp_A', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_B', 'jsess_1', [{ criterionId: 'c', value: '6.00' }]),
      scoreRow('comp_C', 'jsess_1', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('comp_D', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('comp_A', 'jsess_2', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('comp_B', 'jsess_2', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('comp_C', 'jsess_2', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_D', 'jsess_2', [{ criterionId: 'c', value: '6.00' }]),
      scoreRow('comp_A', 'jsess_3', [{ criterionId: 'c', value: '9.00' }]),
      scoreRow('comp_B', 'jsess_3', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('comp_C', 'jsess_3', [{ criterionId: 'c', value: '6.00' }]),
      scoreRow('comp_D', 'jsess_3', [{ criterionId: 'c', value: '4.00' }]),
    ];
    const { db } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 2 })],
        rows,
        [{ maxSeq: 0 }],
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_123',
    ).tournament.completeCypherPhase({
      competitionId: COMPETITION_ID,
    });
    expect(result.totalParticipants).toBe(4);
    const byId = new Map(
      result.finalStandings.map((s) => [s.competitorId, s.totalScore]),
    );
    expect(byId.get('comp_A')).toBe('24.00');
    expect(byId.get('comp_C')).toBe('21.00');
    expect(byId.get('comp_B')).toBe('18.00');
    expect(byId.get('comp_D')).toBe('15.00');
    // Top 2 = A then C, regardless of partner rotation.
    expect(result.advancedCompetitorIds).toEqual(['comp_A', 'comp_C']);
  });

  // ───── Story 5.1: bracket integration ─────

  it('Story 5.1 happy path: 5 advancing competitors generate a 4-matchup bracket with 3 byes', async () => {
    const rows = [
      scoreRow('comp_a', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('comp_b', 'jsess_1', [{ criterionId: 'c', value: '6.00' }]),
      scoreRow('comp_c', 'jsess_1', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('comp_d', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
      scoreRow('comp_e', 'jsess_1', [{ criterionId: 'c', value: '9.00' }]),
    ];
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 5 })],
        rows,
        [{ maxSeq: 10 }],
        [], // existing battle_matchups → none
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.idempotent).toBe(false);
    expect(result.advancedCompetitorIds).toEqual([
      'comp_e',
      'comp_d',
      'comp_c',
      'comp_b',
      'comp_a',
    ]);
    expect(result.bracket).toMatchObject({
      bracketSize: 8,
      qualifierCount: 5,
    });
    expect(result.bracket?.matchups).toHaveLength(4);

    expect(insertSpies).toHaveLength(3);
    // Insert 1: phase.transitioned event
    expect((insertSpies[0]?.values as any).mock.calls[0][0].type).toBe(
      'phase.transitioned',
    );
    // Insert 2: battle_matchups bulk
    const matchupValues = (insertSpies[1]?.values as any).mock.calls[0][0];
    expect(Array.isArray(matchupValues)).toBe(true);
    expect(matchupValues).toHaveLength(4);
    const byes = matchupValues.filter((m: { isBye: boolean }) => m.isBye);
    expect(byes).toHaveLength(3);
    for (const b of byes) {
      expect(b.winnerCompetitorId).toBe(b.competitorAId);
      expect(b.competitorBId).toBeNull();
    }
    // Insert 3: bracket.generated event
    const bracketEventArgs = (insertSpies[2]?.values as any).mock.calls[0][0];
    expect(bracketEventArgs.type).toBe('bracket.generated');
    expect(bracketEventArgs.aggregateId).toBe(COMPETITION_ID);
    expect(bracketEventArgs.aggregateType).toBe('competition');
    expect(bracketEventArgs.sequence).toBe(12); // phase.transitioned at 11, bracket at 12
    expect(bracketEventArgs.payload.qualifierCount).toBe(5);
    expect(bracketEventArgs.payload.bracketSize).toBe(8);
    expect(bracketEventArgs.payload.seeds).toHaveLength(5);
    expect(bracketEventArgs.payload.matchups).toHaveLength(4);

    expect(gateway.broadcastBracketGenerated).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastBracketGenerated).toHaveBeenCalledWith(
      COMPETITION_ID,
      expect.objectContaining({ bracketSize: 8, qualifierCount: 5 }),
    );
  });

  it('Story 5.1 power-of-2: 4 qualifiers produce 2 matchups with no byes', async () => {
    const rows = [
      scoreRow('c1', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('c2', 'jsess_1', [{ criterionId: 'c', value: '6.00' }]),
      scoreRow('c3', 'jsess_1', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('c4', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
    ];
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 4 })],
        rows,
        [{ maxSeq: 0 }],
        [],
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.bracket?.matchups).toHaveLength(2);
    expect(result.bracket?.matchups.every((m) => !m.isBye)).toBe(true);

    const matchupValues = (insertSpies[1]?.values as any).mock.calls[0][0];
    expect(matchupValues).toHaveLength(2);
    expect(matchupValues.every((m: { isBye: boolean }) => !m.isBye)).toBe(true);
  });

  it('Story 5.1 non-power-of-2: 10 qualifiers produce 8 matchups with 6 byes for top seeds 1-6', async () => {
    const rows: ReturnType<typeof scoreRow>[] = [];
    for (let i = 1; i <= 10; i++) {
      rows.push(
        scoreRow(`c${i}`, 'jsess_1', [
          { criterionId: 'c', value: (10 + i).toFixed(2) },
        ]),
      );
    }
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 10 })],
        rows,
        [{ maxSeq: 0 }],
        [],
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.bracket?.bracketSize).toBe(16);
    expect(result.bracket?.qualifierCount).toBe(10);
    expect(result.bracket?.matchups).toHaveLength(8);

    const byeMatchups = result.bracket!.matchups.filter((m) => m.isBye);
    expect(byeMatchups).toHaveLength(6);
    const byeSeeds = byeMatchups.map((m) => m.seedA!).sort((a, b) => a - b);
    expect(byeSeeds).toEqual([1, 2, 3, 4, 5, 6]);

    const matchupValues = (insertSpies[1]?.values as any).mock.calls[0][0];
    const insertedByes = matchupValues.filter(
      (m: { isBye: boolean }) => m.isBye,
    );
    expect(insertedByes).toHaveLength(6);
    for (const b of insertedByes) {
      expect(b.winnerCompetitorId).toBe(b.competitorAId);
    }
  });

  it('Story 5.1 AC #7: single qualifier (N=1) skips bracket — no matchups, no event, no broadcast', async () => {
    const rows = [
      scoreRow('only', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
    ];
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 1 })],
        rows,
        [{ maxSeq: 0 }],
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.bracket).toBeNull();
    // Only the phase.transitioned event was inserted.
    expect(insertSpies).toHaveLength(1);
    expect((insertSpies[0]?.values as any).mock.calls[0][0].type).toBe(
      'phase.transitioned',
    );
    expect(gateway.broadcastBracketGenerated).not.toHaveBeenCalled();
  });

  it('Story 5.1 AC #7: zero qualifiers (N=0) skips bracket — no matchups, no event, no broadcast', async () => {
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 3 })],
        [], // no scores → no qualifiers
        [{ maxSeq: 0 }],
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.bracket).toBeNull();
    expect(insertSpies).toHaveLength(1);
    expect(gateway.broadcastBracketGenerated).not.toHaveBeenCalled();
  });

  it('Story 5.1 AC #6: idempotency-by-state — existing battle_matchups re-read prior bracket event without re-broadcast', async () => {
    const rows = [
      scoreRow('c1', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('c2', 'jsess_1', [{ criterionId: 'c', value: '6.00' }]),
      scoreRow('c3', 'jsess_1', [{ criterionId: 'c', value: '7.00' }]),
      scoreRow('c4', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
    ];
    const priorBracket = {
      competitionId: COMPETITION_ID,
      bracketSize: 4,
      qualifierCount: 4,
      seeds: [
        { competitorId: 'c4', seed: 1 },
        { competitorId: 'c3', seed: 2 },
        { competitorId: 'c2', seed: 3 },
        { competitorId: 'c1', seed: 4 },
      ],
      matchups: [],
      generatedAt: '2026-04-25T12:00:00.000Z',
    };
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 4 })],
        rows,
        [{ maxSeq: 0 }],
        [{ id: 'existing_matchup_1' }], // existing battle_matchups present
        [{ payload: priorBracket }], // prior bracket.generated event re-read
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    // Response carries the prior bracket payload so callers don't see a null
    // gap when retrying. No re-broadcast because the original generation already
    // emitted one — clients refetch via getBracket on the next render cycle.
    expect(result.bracket).toMatchObject({
      bracketSize: 4,
      qualifierCount: 4,
      generatedAt: '2026-04-25T12:00:00.000Z',
    });
    // Only phase.transitioned was inserted. No battle_matchups, no bracket event.
    expect(insertSpies).toHaveLength(1);
    expect(gateway.broadcastBracketGenerated).not.toHaveBeenCalled();
  });

  it('Story 5.1 idempotency-by-conflict: 23505 on bracket.generated event re-reads existing payload', async () => {
    const rows = [
      scoreRow('c1', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('c2', 'jsess_1', [{ criterionId: 'c', value: '6.00' }]),
    ];
    const winningBracket = {
      competitionId: COMPETITION_ID,
      bracketSize: 2,
      qualifierCount: 2,
      seeds: [
        { competitorId: 'c2', seed: 1 },
        { competitorId: 'c1', seed: 2 },
      ],
      matchups: [
        {
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c2',
          competitorBId: 'c1',
          seedA: 1,
          seedB: 2,
          isBye: false,
        },
      ],
      generatedAt: '2026-04-25T12:00:00.000Z',
    };
    const conflictErr = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const { db, insertSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 2 })],
        rows,
        [{ maxSeq: 0 }],
        [], // existing battle_matchups → none, proceed
        [{ payload: winningBracket }], // post-23505 winning bracket re-read
      ],
      // Insert 0: phase.transitioned (success), 1: battleMatchups (success), 2: bracket.generated (23505)
      insertThrowsPerCall: [undefined, undefined, conflictErr],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.bracket).toMatchObject({
      bracketSize: 2,
      qualifierCount: 2,
      generatedAt: '2026-04-25T12:00:00.000Z',
    });
    expect(insertSpies).toHaveLength(3);
    // Bracket broadcast should still be called with the winning payload.
    expect(gateway.broadcastBracketGenerated).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastBracketGenerated).toHaveBeenCalledWith(
      COMPETITION_ID,
      expect.objectContaining({ generatedAt: '2026-04-25T12:00:00.000Z' }),
    );
  });

  it('Story 5.1: idempotent return path also reads prior bracket.generated event', async () => {
    const priorPayload = {
      competitionId: COMPETITION_ID,
      fromPhase: 'cypher',
      toPhase: 'battles',
      advancedCompetitorIds: ['c2', 'c1'],
      triggerType: 'admin_confirmed',
      transitionedAt: '2026-04-25T12:00:00.000Z',
    };
    const priorBracket = {
      competitionId: COMPETITION_ID,
      bracketSize: 2,
      qualifierCount: 2,
      seeds: [
        { competitorId: 'c2', seed: 1 },
        { competitorId: 'c1', seed: 2 },
      ],
      matchups: [
        {
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c2',
          competitorBId: 'c1',
          seedA: 1,
          seedB: 2,
          isBye: false,
        },
      ],
      generatedAt: '2026-04-25T12:00:00.000Z',
    };
    const rows = [
      scoreRow('c1', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('c2', 'jsess_1', [{ criterionId: 'c', value: '6.00' }]),
    ];
    const { db } = makeCompleteCypherPhaseDb({
      whereResults: [
        [
          compRow({
            cypherCompletedAt: new Date('2026-04-25T12:00:00.000Z'),
            advancementThreshold: 2,
          }),
        ],
        rows,
        [{ payload: priorPayload }],
        [{ payload: priorBracket }], // bracket lookup returns prior bracket
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.idempotent).toBe(true);
    expect(result.bracket).toMatchObject({
      bracketSize: 2,
      generatedAt: '2026-04-25T12:00:00.000Z',
    });
  });

  it('Story 5.1 regression: standings query filters by competitors.status=active so withdrawn rows can never reach the bracket', async () => {
    // Strong assertion: inspect the WHERE clause of the standings query in
    // completeCypherPhase and verify it references BOTH `competition_id` AND
    // `status`. Mirrors the existing AC #8 test for getStandings (line ~1371).
    // The previous version of this test was a tautology (it just omitted
    // withdrawn rows from the mock and asserted they were absent from the
    // result, which would pass even if the SQL filter were deleted).
    const rows = [
      scoreRow('active1', 'jsess_1', [{ criterionId: 'c', value: '5.00' }]),
      scoreRow('active2', 'jsess_1', [{ criterionId: 'c', value: '8.00' }]),
    ];
    const { db, whereArgs } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 2 })],
        rows,
        [{ maxSeq: 0 }],
        [],
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    // 1. SQL filter check: the second WHERE call (the score-rows query) must
    //    combine competitionId AND competitors.status=active. A bare
    //    `eq(scores.competitionId, ...)` would produce a different shape.
    const scoreQueryWhere = whereArgs[1] as { queryChunks?: unknown[] };
    const columnNames: string[] = [];
    function walk(node: unknown): void {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const x of node) walk(x);
        return;
      }
      if (typeof node === 'object') {
        const n = node as { name?: unknown; queryChunks?: unknown };
        if (typeof n.name === 'string') columnNames.push(n.name);
        if (n.queryChunks) walk(n.queryChunks);
      }
    }
    walk(scoreQueryWhere.queryChunks);
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('competition_id');

    // 2. Inheritance check: bracket seeds derive from advancedCompetitorIds,
    //    which derives from the (filtered) standings — so any future change
    //    that bypasses the filter would also bypass the bracket assertion.
    expect(result.advancedCompetitorIds).toEqual(['active2', 'active1']);
    expect(result.bracket?.seeds.map((s) => s.competitorId).sort()).toEqual([
      'active1',
      'active2',
    ]);
  });
});

// ─── getDashboardSnapshot ─────────────────────────────────────────────────────

function makeDashboardSnapshotDb(whereResults: unknown[][]): any {
  let callIdx = 0;
  const txMock = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() => makeChainable(whereResults[callIdx++] ?? [])),
  };
  return {
    db: {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any,
    txMock,
  };
}

describe('tournament.getDashboardSnapshot', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.getDashboardSnapshot({ competitionId: 'x' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty competitionId (Zod)', async () => {
    await expect(
      caller('user_1').tournament.getDashboardSnapshot({ competitionId: '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns NOT_FOUND when competition is absent (RLS / ownership)', async () => {
    const { db } = makeDashboardSnapshotDb([
      [], // competition query → empty (not found or different owner)
    ]);
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.getDashboardSnapshot({
        competitionId: 'other_comp',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns a snapshot with all required keys on happy path', async () => {
    const { db } = makeDashboardSnapshotDb([
      // 1. competition
      [
        {
          id: 'comp_1',
          name: 'Test Cup',
          status: 'active',
          cypherCompletedAt: null,
        },
      ],
      // 2. judge sessions
      [
        { id: 's_1', label: 'Judge A', groupIndex: 0 },
        { id: 's_2', label: 'Judge B', groupIndex: 0 },
      ],
      // 3. score counts per judge
      [{ judgeSessionId: 's_1', submittedCount: 2 }],
      // 4. competitor counts per group
      [{ groupIndex: 0, competitorCount: 3 }],
      // 5. score rows for standings (empty)
      [],
    ]);

    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getDashboardSnapshot({
      competitionId: 'comp_1',
    });

    expect(result).toMatchObject({
      competitionId: 'comp_1',
      competitionName: 'Test Cup',
      status: 'active',
      currentPhase: 'cypher',
      judges: expect.any(Array) as unknown,
      totalScoresSubmitted: expect.any(Number) as unknown,
      totalScoresExpected: expect.any(Number) as unknown,
      scoresByGroup: expect.any(Array) as unknown,
      topStandings: expect.any(Array) as unknown,
    });
    expect(result.judges).toHaveLength(2);
    expect(result.judges[0]).toMatchObject({
      judgeSessionId: 's_1',
      label: 'Judge A',
      groupIndex: 0,
      submittedCount: 2,
      expectedCount: 3,
    });
    expect(result.judges[1]).toMatchObject({
      submittedCount: 0,
      expectedCount: 3,
    });
    expect(result.totalScoresSubmitted).toBe(2);
    expect(result.totalScoresExpected).toBe(6); // 2 judges × 3 expected
  });

  it('currentPhase = configuration when status = draft', async () => {
    const { db } = makeDashboardSnapshotDb([
      [{ id: 'comp_1', name: 'T', status: 'draft', cypherCompletedAt: null }],
      [],
      [],
      [],
      [],
    ]);
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getDashboardSnapshot({ competitionId: 'comp_1' });
    expect(result.currentPhase).toBe('configuration');
  });

  it('currentPhase = cypher when status = active and cypherCompletedAt = null', async () => {
    const { db } = makeDashboardSnapshotDb([
      [{ id: 'comp_1', name: 'T', status: 'active', cypherCompletedAt: null }],
      [],
      [],
      [],
      [],
    ]);
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getDashboardSnapshot({ competitionId: 'comp_1' });
    expect(result.currentPhase).toBe('cypher');
  });

  it('currentPhase = cypher-review when status = active and cypherCompletedAt set', async () => {
    const { db } = makeDashboardSnapshotDb([
      [
        {
          id: 'comp_1',
          name: 'T',
          status: 'active',
          cypherCompletedAt: new Date(),
        },
      ],
      [],
      [],
      [],
      [],
    ]);
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getDashboardSnapshot({ competitionId: 'comp_1' });
    expect(result.currentPhase).toBe('cypher-review');
  });

  it('currentPhase = completed when status = completed', async () => {
    const { db } = makeDashboardSnapshotDb([
      [
        {
          id: 'comp_1',
          name: 'T',
          status: 'completed',
          cypherCompletedAt: new Date(),
        },
      ],
      [],
      [],
      [],
      [],
    ]);
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getDashboardSnapshot({ competitionId: 'comp_1' });
    expect(result.currentPhase).toBe('completed');
  });

  it('merges gateway presence into judge entries', async () => {
    const gateway = makeFullGateway();
    (gateway.getJudgePresence as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        judgeSessionId: 's_1',
        label: 'Judge A',
        groupIndex: 0,
        connected: true,
        queueSize: 0,
        lastSeenAt: '2026-04-27T10:00:00.000Z',
      },
      {
        judgeSessionId: 's_2',
        label: 'Judge B',
        groupIndex: 0,
        connected: false,
        queueSize: 2,
        lastSeenAt: '2026-04-27T09:55:00.000Z',
      },
    ]);
    const { db } = makeDashboardSnapshotDb([
      [{ id: 'comp_1', name: 'T', status: 'active', cypherCompletedAt: null }],
      [
        { id: 's_1', label: 'Judge A', groupIndex: 0 },
        { id: 's_2', label: 'Judge B', groupIndex: 0 },
      ],
      [],
      [],
      [],
    ]);
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.getDashboardSnapshot({ competitionId: 'comp_1' });
    const j1 = result.judges.find((j) => j.judgeSessionId === 's_1')!;
    const j2 = result.judges.find((j) => j.judgeSessionId === 's_2')!;
    expect(j1.connected).toBe(true);
    expect(j1.queueSize).toBe(0);
    expect(j2.connected).toBe(false);
    expect(j2.queueSize).toBe(2);
  });
});

// ─── overrideScore / getScoreAuditTrail / listScoresForOverride ──────────────

interface OverrideTxOptions {
  whereResults: unknown[][];
  insertEventThrows?: unknown;
}

function makeOverrideScoreDb(opts: OverrideTxOptions) {
  const { whereResults, insertEventThrows } = opts;
  let callIdx = 0;
  const updateSpies: Array<{
    set: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  }> = [];
  const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];

  const txMock = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() => makeChainable(whereResults[callIdx++] ?? [])),
    update: vi.fn(() => {
      const whereSpy = vi.fn().mockResolvedValue([]);
      const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
      updateSpies.push({ set: setSpy, where: whereSpy });
      return { set: setSpy };
    }),
    insert: vi.fn(() => {
      const valuesSpy = insertEventThrows
        ? vi.fn().mockRejectedValue(insertEventThrows)
        : vi.fn().mockResolvedValue([]);
      insertSpies.push({ values: valuesSpy });
      return { values: valuesSpy };
    }),
  };

  return {
    db: {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
        // Standings post-commit broadcast — non-tx select chain; resolves []
        // so the gateway's broadcastStandingsUpdated still runs without error.
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      },
    } as any,
    txMock,
    updateSpies,
    insertSpies,
  };
}

const SCORE_ROW_BASE = {
  scoreId: 'score_xyz',
  competitionId: 'comp_abc',
  judgeSessionId: 'jsess_1',
  competitorId: 'comp_1',
  criteriaScores: [{ criterionId: 'c_flow', value: '5.00' }] as unknown,
  competitionStatus: 'active' as const,
};
const CRITERIA_ROWS = [
  { id: 'c_flow', name: 'Flow', minScore: '0.00', maxScore: '10.00' },
];

describe('tournament.overrideScore', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_flow', value: '7.00' }],
        reason: 'fix typo',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty reason (Zod)', async () => {
    await expect(
      caller('user_1').tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_flow', value: '7.00' }],
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects whitespace-only reason (verifies .trim().min(1) order)', async () => {
    await expect(
      caller('user_1').tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_flow', value: '7.00' }],
        reason: '   ',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects reason longer than 500 characters', async () => {
    await expect(
      caller('user_1').tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_flow', value: '7.00' }],
        reason: 'a'.repeat(501),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws SCORE_NOT_FOUND when the score is missing or owned by another organizer', async () => {
    const { db } = makeOverrideScoreDb({ whereResults: [[]] });
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_1').tournament.overrideScore({
        scoreId: 'score_does_not_exist',
        newScores: [{ criterionId: 'c_flow', value: '7.00' }],
        reason: 'attempted access',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each(['draft', 'completed', 'archived'] as const)(
    'rejects override when competition status is %s',
    async (status) => {
      const { db } = makeOverrideScoreDb({
        whereResults: [[{ ...SCORE_ROW_BASE, competitionStatus: status }]],
      });
      await expect(
        makeCallerFor(db, makeFullGateway(), 'user_1').tournament.overrideScore(
          {
            scoreId: 'score_xyz',
            newScores: [{ criterionId: 'c_flow', value: '7.00' }],
            reason: 'mid-competition fix',
          },
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    },
  );

  it('rejects when newScores fail criterion validation (out-of-range)', async () => {
    const { db } = makeOverrideScoreDb({
      whereResults: [[SCORE_ROW_BASE], CRITERIA_ROWS],
    });
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_1').tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_flow', value: '99.00' }],
        reason: 'out of range',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects when a required criterion is missing from newScores', async () => {
    const { db } = makeOverrideScoreDb({
      whereResults: [[SCORE_ROW_BASE], CRITERIA_ROWS],
    });
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_1').tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_other', value: '5.00' }],
        reason: 'wrong criterion',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('happy path: persists score.overridden event with full payload, broadcasts', async () => {
    const { db, updateSpies, insertSpies } = makeOverrideScoreDb({
      whereResults: [
        [SCORE_ROW_BASE],
        CRITERIA_ROWS,
        [{ maxSeq: 5 }], // sequence query
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.overrideScore({
      scoreId: 'score_xyz',
      newScores: [{ criterionId: 'c_flow', value: '7.00' }],
      reason: 'corrected typo',
    });

    expect(result).toMatchObject({
      success: true,
      scoreId: 'score_xyz',
      originalTotalScore: '5.00',
      newTotalScore: '7.00',
    });

    // UPDATE applied to the projection row.
    expect(updateSpies.length).toBeGreaterThan(0);
    const setArgs = (updateSpies[0]?.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setArgs).toMatchObject({
      criteriaScores: [{ criterionId: 'c_flow', value: '7.00' }],
    });

    // Event INSERT recorded.
    expect(insertSpies.length).toBeGreaterThan(0);
    const eventValues = (insertSpies[0]?.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues).toMatchObject({
      type: 'score.overridden',
      aggregateId: 'comp_abc',
      aggregateType: 'competition',
      sequence: 6,
      createdBy: 'user_1',
    });
    expect(eventValues.payload).toMatchObject({
      scoreId: 'score_xyz',
      reason: 'corrected typo',
      originalTotalScore: '5.00',
      newTotalScore: '7.00',
      overriddenByClerkId: 'user_1',
    });

    // Broadcasts.
    expect(gateway.broadcastScoreOverridden).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastStandingsUpdated).toHaveBeenCalledTimes(1);
  });

  it('trims reason whitespace before persisting', async () => {
    const { db, insertSpies } = makeOverrideScoreDb({
      whereResults: [[SCORE_ROW_BASE], CRITERIA_ROWS, [{ maxSeq: 0 }]],
    });
    await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.overrideScore({
      scoreId: 'score_xyz',
      newScores: [{ criterionId: 'c_flow', value: '7.00' }],
      reason: '   trimmed reason   ',
    });
    const eventValues = (insertSpies[0]?.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues.payload.reason).toBe('trimmed reason');
  });

  it('maps event-INSERT 23505 to INTERNAL_SERVER_ERROR (sequence collision retry)', async () => {
    const { db } = makeOverrideScoreDb({
      whereResults: [[SCORE_ROW_BASE], CRITERIA_ROWS, [{ maxSeq: 0 }]],
      insertEventThrows: { code: '23505' },
    });
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_1').tournament.overrideScore({
        scoreId: 'score_xyz',
        newScores: [{ criterionId: 'c_flow', value: '7.00' }],
        reason: 'concurrent',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('NFR11: original score.submitted event is preserved — only one INSERT, only one UPDATE', async () => {
    const { db, updateSpies, insertSpies } = makeOverrideScoreDb({
      whereResults: [[SCORE_ROW_BASE], CRITERIA_ROWS, [{ maxSeq: 3 }]],
    });
    await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.overrideScore({
      scoreId: 'score_xyz',
      newScores: [{ criterionId: 'c_flow', value: '7.00' }],
      reason: 'NFR11 check',
    });
    // Exactly one UPDATE — the scores projection row. No UPDATE to the events table.
    expect(updateSpies).toHaveLength(1);
    // Exactly one INSERT — the score.overridden event. The score.submitted event
    // is never touched (no update, no delete, no second insert replacing it).
    expect(insertSpies).toHaveLength(1);
    const eventValues = (insertSpies[0]?.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues?.type).toBe('score.overridden');
  });
});

describe('tournament.getScoreAuditTrail', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.getScoreAuditTrail({ scoreId: 'score_xyz' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty scoreId (Zod)', async () => {
    await expect(
      caller('user_1').tournament.getScoreAuditTrail({ scoreId: '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns NOT_FOUND when score is absent or owned by another organizer', async () => {
    const { db } = makeOverrideScoreDb({ whereResults: [[]] });
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.getScoreAuditTrail({
        scoreId: 'score_other',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reconstructs full chain: 1 submitted + 2 overridden in sequence order', async () => {
    const ownershipRow = {
      scoreId: 'score_xyz',
      competitionId: 'comp_abc',
      judgeSessionId: 'jsess_1',
      competitorId: 'comp_1',
      competitorName: 'Alice',
      judgeLabel: 'Judge A',
    };
    // SQL-level filtering (judgeSessionId + competitorId jsonb predicates) means
    // the mock only returns the single matching event — other judge/competitor
    // pairs are excluded by the DB before the loop runs.
    const submittedEvents = [
      {
        sequence: 5,
        createdAt: new Date('2026-04-27T10:00:00Z'),
        payload: {
          judgeSessionId: 'jsess_1',
          competitorId: 'comp_1',
          competitionId: 'comp_abc',
          scores: [{ criterionId: 'c_flow', value: '5.00' }],
        },
      },
    ];
    const overriddenEvents = [
      {
        sequence: 7,
        createdAt: new Date('2026-04-27T10:05:00Z'),
        payload: {
          scoreId: 'score_xyz',
          originalTotalScore: '5.00',
          newTotalScore: '7.00',
          originalCriteriaScores: [{ criterionId: 'c_flow', value: '5.00' }],
          newCriteriaScores: [{ criterionId: 'c_flow', value: '7.00' }],
          reason: 'first correction',
          overriddenByClerkId: 'user_1',
        },
      },
      // Different scoreId — must be filtered out
      {
        sequence: 8,
        createdAt: new Date('2026-04-27T10:06:00Z'),
        payload: {
          scoreId: 'score_other',
          reason: 'unrelated',
        },
      },
      {
        sequence: 9,
        createdAt: new Date('2026-04-27T10:10:00Z'),
        payload: {
          scoreId: 'score_xyz',
          originalTotalScore: '7.00',
          newTotalScore: '8.50',
          originalCriteriaScores: [{ criterionId: 'c_flow', value: '7.00' }],
          newCriteriaScores: [{ criterionId: 'c_flow', value: '8.50' }],
          reason: 'second correction',
          overriddenByClerkId: 'user_1',
        },
      },
    ];
    const { db } = makeOverrideScoreDb({
      whereResults: [[ownershipRow], submittedEvents, overriddenEvents],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getScoreAuditTrail({
      scoreId: 'score_xyz',
    });
    expect(result.scoreId).toBe('score_xyz');
    expect(result.competitorName).toBe('Alice');
    expect(result.chain).toHaveLength(3);
    expect(result.chain[0]?.kind).toBe('submitted');
    expect(result.chain[1]?.kind).toBe('overridden');
    expect(result.chain[2]?.kind).toBe('overridden');
    // Sequence-ordered.
    expect(result.chain.map((e) => e.sequence)).toEqual([5, 7, 9]);
    // Filter correctness — score_other event excluded, jsess_OTHER excluded.
    if (result.chain[1]?.kind === 'overridden') {
      expect(result.chain[1].reason).toBe('first correction');
    }
  });
});

describe('tournament.listScoresForOverride', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.listScoresForOverride({ competitionId: 'x' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns NOT_FOUND for unknown competitions', async () => {
    const { db } = makeOverrideScoreDb({ whereResults: [[]] });
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.listScoresForOverride({
        competitionId: 'comp_other',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns rows with hasOverrides true for overridden scores and false otherwise', async () => {
    const compRow = [{ id: 'comp_abc' }];
    const scoreRows = [
      {
        scoreId: 'score_1',
        judgeSessionId: 'jsess_1',
        judgeLabel: 'Judge A',
        groupIndex: 0,
        competitorId: 'comp_1',
        competitorName: 'Alice',
        participantId: 'P-001',
        criteriaScores: [{ criterionId: 'c_flow', value: '7.00' }],
        submittedAt: new Date('2026-04-27T10:00:00Z'),
      },
      {
        scoreId: 'score_2',
        judgeSessionId: 'jsess_1',
        judgeLabel: 'Judge A',
        groupIndex: 0,
        competitorId: 'comp_2',
        competitorName: 'Bob',
        participantId: 'P-002',
        criteriaScores: [{ criterionId: 'c_flow', value: '5.00' }],
        submittedAt: new Date('2026-04-27T10:01:00Z'),
      },
    ];
    const overrideEvents = [{ payload: { scoreId: 'score_1' } }];
    const { db } = makeOverrideScoreDb({
      whereResults: [compRow, scoreRows, overrideEvents],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.listScoresForOverride({
      competitionId: 'comp_abc',
    });
    expect(result).toHaveLength(2);
    const byId = new Map(result.map((r) => [r.scoreId, r]));
    expect(byId.get('score_1')?.hasOverrides).toBe(true);
    expect(byId.get('score_2')?.hasOverrides).toBe(false);
    // totalScore computed.
    expect(byId.get('score_1')?.totalScore).toBe('7.00');
  });
});

// ─── withdrawCompetitor / rescueCompetitor / listCompetitorsWithStatus ────────

interface CompetitorTxOptions {
  whereResults: unknown[][];
  insertEventThrows?: unknown;
}

function makeCompetitorDb(opts: CompetitorTxOptions) {
  const { whereResults, insertEventThrows } = opts;
  let callIdx = 0;
  const updateSpies: Array<{
    set: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  }> = [];
  const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];

  const txMock = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() => makeChainable(whereResults[callIdx++] ?? [])),
    orderBy: vi.fn().mockResolvedValue([]),
    update: vi.fn(() => {
      const whereSpy = vi.fn().mockResolvedValue([]);
      const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
      updateSpies.push({ set: setSpy, where: whereSpy });
      return { set: setSpy };
    }),
    insert: vi.fn(() => {
      const valuesSpy = insertEventThrows
        ? vi.fn().mockRejectedValue(insertEventThrows)
        : vi.fn().mockResolvedValue([]);
      insertSpies.push({ values: valuesSpy });
      return { values: valuesSpy };
    }),
  };

  return {
    db: {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      },
    } as any,
    txMock,
    updateSpies,
    insertSpies,
  };
}

const COMP_ROW_ACTIVE = {
  competitorId: 'competitor_1',
  competitorName: 'Alice',
  competitorStatus: 'active' as const,
  competitionId: 'comp_abc',
  competitionStatus: 'active' as const,
  cypherCompletedAt: null,
};

const COMP_ROW_WITHDRAWN = {
  ...COMP_ROW_ACTIVE,
  competitorStatus: 'withdrawn' as const,
  cypherCompletedAt: new Date('2026-04-28T10:00:00Z'),
};

describe('tournament.withdrawCompetitor', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.withdrawCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'left the venue',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty reason (Zod)', async () => {
    await expect(
      caller('user_1').tournament.withdrawCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects whitespace-only reason (Zod trim guard)', async () => {
    await expect(
      caller('user_1').tournament.withdrawCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: '   ',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects reason >500 chars (Zod)', async () => {
    await expect(
      caller('user_1').tournament.withdrawCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'x'.repeat(501),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns NOT_FOUND with COMPETITOR_NOT_FOUND when competitor not found', async () => {
    const { db } = makeCompetitorDb({ whereResults: [[]] });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.withdrawCompetitor({
        competitorId: 'unknown_id',
        competitionId: 'comp_abc',
        reason: 'test',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'COMPETITOR_NOT_FOUND',
    });
  });

  it('rejects with ACTION_NOT_ALLOWED_IN_PHASE when competition is not active', async () => {
    const { db } = makeCompetitorDb({
      whereResults: [[{ ...COMP_ROW_ACTIVE, competitionStatus: 'draft' }]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.withdrawCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'test',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'ACTION_NOT_ALLOWED_IN_PHASE',
    });
  });

  it('rejects with COMPETITOR_ALREADY_WITHDRAWN when competitor is already withdrawn (AC #6)', async () => {
    const { db } = makeCompetitorDb({
      whereResults: [[COMP_ROW_WITHDRAWN]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.withdrawCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'test',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'COMPETITOR_ALREADY_WITHDRAWN',
    });
  });

  it('happy path: withdraws competitor, inserts event, broadcasts', async () => {
    const gateway = makeFullGateway();
    const { db, updateSpies, insertSpies } = makeCompetitorDb({
      whereResults: [[COMP_ROW_ACTIVE], [{ maxSeq: 5 }]],
    });
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.withdrawCompetitor({
      competitorId: 'competitor_1',
      competitionId: 'comp_abc',
      reason: 'left the event',
    });

    expect(result).toMatchObject({
      success: true,
      competitorId: 'competitor_1',
    });

    expect(updateSpies).toHaveLength(1);
    const setArg = (updateSpies[0]!.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setArg).toMatchObject({ status: 'withdrawn' });

    expect(insertSpies).toHaveLength(1);
    const eventValues = (insertSpies[0]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues).toMatchObject({
      type: 'competitor.withdrawn',
      aggregateId: 'comp_abc',
      aggregateType: 'competition',
      createdBy: 'user_1',
      sequence: 6,
    });
    expect((eventValues?.payload as { reason?: string })?.reason).toBe(
      'left the event',
    );

    expect(gateway.broadcastCompetitorWithdrawn).toHaveBeenCalledOnce();
    expect(gateway.broadcastStandingsUpdated).toHaveBeenCalledOnce();
  });

  it('NFR11: competitor.withdrawn event is only an INSERT — no UPDATE to prior events', async () => {
    const { db, updateSpies, insertSpies } = makeCompetitorDb({
      whereResults: [[COMP_ROW_ACTIVE], [{ maxSeq: 2 }]],
    });
    await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.withdrawCompetitor({
      competitorId: 'competitor_1',
      competitionId: 'comp_abc',
      reason: 'test',
    });
    expect(updateSpies).toHaveLength(1);
    expect(insertSpies).toHaveLength(1);
    const eventValues = (insertSpies[0]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues?.type).toBe('competitor.withdrawn');
  });
});

describe('tournament.rescueCompetitor', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'organizer override',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty reason (Zod)', async () => {
    await expect(
      caller('user_1').tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects whitespace-only reason (Zod trim guard)', async () => {
    await expect(
      caller('user_1').tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: '   ',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects reason >500 chars (Zod)', async () => {
    await expect(
      caller('user_1').tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'x'.repeat(501),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns NOT_FOUND with COMPETITOR_NOT_FOUND when competitor not found', async () => {
    const { db } = makeCompetitorDb({ whereResults: [[]] });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.rescueCompetitor({
        competitorId: 'unknown_id',
        competitionId: 'comp_abc',
        reason: 'rescue',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'COMPETITOR_NOT_FOUND',
    });
  });

  it('rejects with ACTION_NOT_ALLOWED_IN_PHASE when competition is not active', async () => {
    const { db } = makeCompetitorDb({
      whereResults: [[{ ...COMP_ROW_WITHDRAWN, competitionStatus: 'draft' }]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'rescue',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'ACTION_NOT_ALLOWED_IN_PHASE',
    });
  });

  it('rejects with ACTION_NOT_ALLOWED_IN_PHASE when cypher phase not completed', async () => {
    const { db } = makeCompetitorDb({
      whereResults: [[{ ...COMP_ROW_WITHDRAWN, cypherCompletedAt: null }]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'rescue',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'ACTION_NOT_ALLOWED_IN_PHASE',
    });
  });

  it('rejects with COMPETITOR_NOT_WITHDRAWN when competitor is not withdrawn (AC #7)', async () => {
    const activeWithCypher = {
      ...COMP_ROW_ACTIVE,
      cypherCompletedAt: new Date('2026-04-28T10:00:00Z'),
    };
    const { db } = makeCompetitorDb({
      whereResults: [[activeWithCypher]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.rescueCompetitor({
        competitorId: 'competitor_1',
        competitionId: 'comp_abc',
        reason: 'rescue',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'COMPETITOR_NOT_WITHDRAWN',
    });
  });

  it('happy path: rescues competitor, inserts event, broadcasts to admin only', async () => {
    const gateway = makeFullGateway();
    const { db, updateSpies, insertSpies } = makeCompetitorDb({
      whereResults: [[COMP_ROW_WITHDRAWN], [{ maxSeq: 7 }]],
    });
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.rescueCompetitor({
      competitorId: 'competitor_1',
      competitionId: 'comp_abc',
      reason: 'crowd favorite',
    });

    expect(result).toMatchObject({
      success: true,
      competitorId: 'competitor_1',
    });

    expect(updateSpies).toHaveLength(1);
    const setArg = (updateSpies[0]!.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setArg).toMatchObject({ status: 'active' });

    expect(insertSpies).toHaveLength(1);
    const eventValues = (insertSpies[0]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues).toMatchObject({
      type: 'competitor.rescued',
      aggregateId: 'comp_abc',
      aggregateType: 'competition',
      createdBy: 'user_1',
      sequence: 8,
    });
    expect((eventValues?.payload as { reason?: string })?.reason).toBe(
      'crowd favorite',
    );

    expect(gateway.broadcastCompetitorRescued).toHaveBeenCalledOnce();
    expect(gateway.broadcastCompetitorWithdrawn).not.toHaveBeenCalled();
    expect(gateway.broadcastStandingsUpdated).toHaveBeenCalledOnce();
  });

  it('NFR11: competitor.rescued event is only an INSERT — no UPDATE to prior events', async () => {
    const { db, updateSpies, insertSpies } = makeCompetitorDb({
      whereResults: [[COMP_ROW_WITHDRAWN], [{ maxSeq: 3 }]],
    });
    await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.rescueCompetitor({
      competitorId: 'competitor_1',
      competitionId: 'comp_abc',
      reason: 'test',
    });
    expect(updateSpies).toHaveLength(1);
    expect(insertSpies).toHaveLength(1);
    const eventValues = (insertSpies[0]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventValues?.type).toBe('competitor.rescued');
  });
});

describe('tournament.listCompetitorsWithStatus', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.listCompetitorsWithStatus({
        competitionId: 'comp_abc',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns NOT_FOUND for unknown competition', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.listCompetitorsWithStatus({
        competitionId: 'unknown_comp',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns competitors with their status values', async () => {
    const competitorsData = [
      {
        id: 'c1',
        participantId: 'P-001',
        name: 'Alice',
        status: 'active' as const,
        createdAt: new Date(),
      },
      {
        id: 'c2',
        participantId: 'P-002',
        name: 'Bob',
        status: 'withdrawn' as const,
        createdAt: new Date(),
      },
    ];
    let callCount = 0;
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([{ id: 'comp_abc' }]);
        }
        return { orderBy: vi.fn().mockResolvedValue(competitorsData) };
      }),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.listCompetitorsWithStatus({
      competitionId: 'comp_abc',
    });
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.name === 'Alice')?.status).toBe('active');
    expect(result.find((r) => r.name === 'Bob')?.status).toBe('withdrawn');
  });
});

// ─── setSoloMode / submitOrganizerScore (Story 4.4) ─────────────────────────

describe('tournament.setSoloMode', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.setSoloMode({
        competitionId: 'comp_abc',
        soloMode: true,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects when soloMode is missing (Zod)', async () => {
    await expect(
      caller('user_1').tournament.setSoloMode({
        competitionId: 'comp_abc',
        // @ts-expect-error testing Zod missing-field
        soloMode: undefined,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns NOT_FOUND for unknown competition', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_1').tournament.setSoloMode({
        competitionId: 'unknown',
        soloMode: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects with SOLO_MODE_LOCKED when competition is not in draft', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: 'comp_abc', status: 'active' }]),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.setSoloMode({
        competitionId: 'comp_abc',
        soloMode: true,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'SOLO_MODE_LOCKED',
    });
  });

  it('happy path: persists soloMode update on draft competition', async () => {
    let updateSetArg: unknown = null;
    const updateMock = vi.fn(() => {
      const setSpy = vi.fn((arg) => {
        updateSetArg = arg;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: 'comp_abc', soloMode: true }]),
          }),
        };
      });
      return { set: setSpy };
    });
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: 'comp_abc', status: 'draft' }]),
      update: updateMock,
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.setSoloMode({
      competitionId: 'comp_abc',
      soloMode: true,
    });
    expect(result).toMatchObject({ id: 'comp_abc', soloMode: true });
    expect(updateSetArg).toMatchObject({ soloMode: true });
    // updatedAt is bumped (project rule)
    expect((updateSetArg as { updatedAt?: unknown }).updatedAt).toBeInstanceOf(
      Date,
    );
  });
});

// Mock helper for submitOrganizerScore — sequenced where() responses cover:
// 1. competition ownership SELECT
// 2. competitor active-check SELECT
// 3. existing organizer judge_session SELECT
// 4. (if no session) judge_session INSERT (returning{})
// 5. idempotency SELECT on scores
// 6. evaluation_criteria SELECT
// 7. max(events.sequence) SELECT
function makeOrganizerScoreDb(opts: {
  whereResults: unknown[][];
  insertReturning?: unknown[];
  insertScoreThrows?: unknown;
  insertEventThrows?: unknown;
}) {
  const {
    whereResults,
    insertReturning,
    insertScoreThrows,
    insertEventThrows,
  } = opts;
  let callIdx = 0;
  const updateSpies: Array<{
    set: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  }> = [];
  const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];
  let insertCount = 0;

  const txMock = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() => makeChainable(whereResults[callIdx++] ?? [])),
    update: vi.fn(() => {
      const whereSpy = vi.fn().mockResolvedValue([]);
      const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
      updateSpies.push({ set: setSpy, where: whereSpy });
      return { set: setSpy };
    }),
    insert: vi.fn(() => {
      const idx = insertCount++;
      // First insert: judge_session create (returns ID); subsequent inserts:
      // scores then events. Selectively throw based on `insertScoreThrows` /
      // `insertEventThrows` flags. The boundary between "scores" and "events"
      // inserts depends on whether the organizer session pre-exists; the
      // test sets `insertReturning` to drive the first insert's returning().
      const valuesSpy = vi.fn(() => {
        if (idx === 0 && insertReturning) {
          return {
            returning: vi.fn().mockResolvedValue(insertReturning),
          };
        }
        // Score insert (idx 1 if session was created, else idx 0)
        const isScoreInsert =
          (insertReturning && idx === 1) || (!insertReturning && idx === 0);
        if (isScoreInsert && insertScoreThrows) {
          return Promise.reject(insertScoreThrows);
        }
        // Event insert (last)
        const isEventInsert =
          (insertReturning && idx === 2) || (!insertReturning && idx === 1);
        if (isEventInsert && insertEventThrows) {
          return Promise.reject(insertEventThrows);
        }
        return Promise.resolve([]);
      });
      insertSpies.push({ values: valuesSpy });
      return { values: valuesSpy };
    }),
  };

  return {
    db: {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
        // post-commit standings recompute
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      },
    } as any,
    txMock,
    updateSpies,
    insertSpies,
  };
}

describe('tournament.submitOrganizerScore', () => {
  const SCORE_INPUT = {
    competitionId: 'comp_abc',
    competitorId: 'competitor_1',
    scores: [{ criterionId: 'c_flow', value: '7.50' }],
    idempotencyKey: 'idem-1',
  };

  it('rejects unauthenticated callers', async () => {
    await expect(
      caller(null).tournament.submitOrganizerScore(SCORE_INPUT),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty scores array (Zod)', async () => {
    await expect(
      caller('user_1').tournament.submitOrganizerScore({
        ...SCORE_INPUT,
        scores: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns NOT_FOUND when competition does not exist or belongs to another organizer', async () => {
    const { db } = makeOrganizerScoreDb({ whereResults: [[]] });
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.submitOrganizerScore(SCORE_INPUT),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects with PHASE_NOT_ACTIVE when competition is in draft', async () => {
    const { db } = makeOrganizerScoreDb({
      whereResults: [[{ id: 'comp_abc', status: 'draft', soloMode: true }]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.submitOrganizerScore(SCORE_INPUT);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'PHASE_NOT_ACTIVE',
    });
  });

  it('rejects with SOLO_MODE_NOT_ENABLED when soloMode is false (AC #6)', async () => {
    const { db } = makeOrganizerScoreDb({
      whereResults: [[{ id: 'comp_abc', status: 'active', soloMode: false }]],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.submitOrganizerScore(SCORE_INPUT);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'SOLO_MODE_NOT_ENABLED',
    });
  });

  it('rejects withdrawn competitor with COMPETITOR_NOT_FOUND', async () => {
    const { db } = makeOrganizerScoreDb({
      whereResults: [
        [{ id: 'comp_abc', status: 'active', soloMode: true }],
        [], // competitor SELECT returns empty (withdrawn filter)
      ],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.submitOrganizerScore(SCORE_INPUT);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'COMPETITOR_NOT_FOUND',
    });
  });

  it('happy path FIRST submission: auto-creates organizer judge session, inserts score and event, broadcasts', async () => {
    const gateway = makeFullGateway();
    const { db, insertSpies } = makeOrganizerScoreDb({
      whereResults: [
        [{ id: 'comp_abc', status: 'active', soloMode: true }],
        [{ id: 'competitor_1' }],
        [], // existing organizer session SELECT — empty (none yet)
        [], // idempotency check on scores — empty
        [{ id: 'c_flow', name: 'Flow', minScore: '0.00', maxScore: '10.00' }],
        [{ maxSeq: 5 }],
      ],
      insertReturning: [{ id: 'orgsession_1' }],
    });
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.submitOrganizerScore(SCORE_INPUT);

    expect(result).toMatchObject({ success: true, idempotent: false });

    // 3 inserts expected: judgeSessions, scores, events
    expect(insertSpies).toHaveLength(3);

    // First insert: judge session with label "Organizer", createdBy user_1, groupIndex 0
    const sessionInsertArgs = (
      insertSpies[0]!.values as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0];
    expect(sessionInsertArgs).toMatchObject({
      competitionId: 'comp_abc',
      label: 'Organizer',
      createdBy: 'user_1',
      groupIndex: 0,
    });
    expect(
      typeof (sessionInsertArgs as { tokenHash?: unknown }).tokenHash,
    ).toBe('string');

    // Second insert: score row with the auto-created session ID
    const scoreInsertArgs = (insertSpies[1]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(scoreInsertArgs).toMatchObject({
      competitionId: 'comp_abc',
      judgeSessionId: 'orgsession_1',
      competitorId: 'competitor_1',
      idempotencyKey: 'idem-1',
    });

    // Third insert: score.submitted event
    const eventInsertArgs = (insertSpies[2]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(eventInsertArgs).toMatchObject({
      type: 'score.submitted',
      aggregateId: 'comp_abc',
      aggregateType: 'competition',
      sequence: 6,
      createdBy: 'orgsession_1',
    });

    // Broadcasts fired
    expect(gateway.broadcastScoreSubmitted).toHaveBeenCalledOnce();
    expect(gateway.broadcastStandingsUpdated).toHaveBeenCalledOnce();
  });

  it('happy path SECOND submission: reuses existing organizer judge session', async () => {
    const gateway = makeFullGateway();
    const { db, insertSpies } = makeOrganizerScoreDb({
      whereResults: [
        [{ id: 'comp_abc', status: 'active', soloMode: true }],
        [{ id: 'competitor_2' }],
        [{ id: 'orgsession_existing' }], // existing organizer session FOUND
        [], // idempotency check on scores — empty
        [{ id: 'c_flow', name: 'Flow', minScore: '0.00', maxScore: '10.00' }],
        [{ maxSeq: 10 }],
      ],
    });
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.submitOrganizerScore({
      ...SCORE_INPUT,
      competitorId: 'competitor_2',
      idempotencyKey: 'idem-2',
    });

    expect(result).toMatchObject({ success: true, idempotent: false });

    // Only 2 inserts now: scores + events (no new judge session)
    expect(insertSpies).toHaveLength(2);

    const scoreInsertArgs = (insertSpies[0]!.values as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(scoreInsertArgs).toMatchObject({
      judgeSessionId: 'orgsession_existing',
      competitorId: 'competitor_2',
    });
  });

  it('idempotent retry: same idempotency key returns success without new inserts', async () => {
    const { db, insertSpies } = makeOrganizerScoreDb({
      whereResults: [
        [{ id: 'comp_abc', status: 'active', soloMode: true }],
        [{ id: 'competitor_1' }],
        [{ id: 'orgsession_existing' }],
        [{ id: 'score_already_exists' }], // idempotency hit
      ],
    });
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.submitOrganizerScore(SCORE_INPUT);

    expect(result).toMatchObject({ success: true, idempotent: true });
    expect(insertSpies).toHaveLength(0);
  });

  it('rejects out-of-range score with SCORE_OUTSIDE_RANGE', async () => {
    const { db } = makeOrganizerScoreDb({
      whereResults: [
        [{ id: 'comp_abc', status: 'active', soloMode: true }],
        [{ id: 'competitor_1' }],
        [{ id: 'orgsession_existing' }],
        [], // idempotency
        [{ id: 'c_flow', name: 'Flow', minScore: '0.00', maxScore: '10.00' }],
      ],
    });
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.submitOrganizerScore({
        ...SCORE_INPUT,
        scores: [{ criterionId: 'c_flow', value: '99.00' }], // out of range
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'SCORE_OUTSIDE_RANGE',
    });
  });
});

describe('tournament.startCypherPhase solo mode', () => {
  // Solo-mode start path: the INSUFFICIENT_JUDGE_LINKS check is bypassed.
  // The mock follows startCypherPhase's where-call sequence:
  // 1. competition SELECT (with soloMode flag)
  // 2. evaluation_criteria SELECT
  // 3. competitors SELECT
  // 4. judgeSessions SELECT
  // 5. The procedure also does additional reads for the broadcast — we mock those with empty arrays.
  function makeStartCypherDb(soloMode: boolean, judgeSessionCount: number) {
    let callIdx = 0;
    const responses: unknown[][] = [
      [
        {
          id: 'comp_abc',
          status: 'draft',
          cypherGroupCount: soloMode ? null : 1,
          soloMode,
        },
      ],
      [{ id: 'crit_1' }], // criteria
      [{ id: 'competitor_1' }, { id: 'competitor_2' }], // competitors
      Array.from({ length: judgeSessionCount }, (_, i) => ({
        id: `session_${i}`,
      })),
    ];
    const txMock: any = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const idx = callIdx++;
        const arr: unknown[] = responses[idx] ?? [];
        return {
          orderBy: vi.fn().mockResolvedValue(arr),
          then: (onfulfilled: (v: unknown) => unknown) => onfulfilled(arr),
          catch: () => undefined,
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    };
    return {
      db: {
        db: {
          transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
        },
      } as any,
    };
  }

  it('AC #7: solo mode bypasses INSUFFICIENT_JUDGE_LINKS guard', async () => {
    const { db } = makeStartCypherDb(true, 0);
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.startCypherPhase({
      competitionId: 'comp_abc',
    });
    expect(result).toMatchObject({
      success: true,
      groupCount: 1,
      judgeCount: 0,
    });
  });

  it('regression: non-solo mode still throws INSUFFICIENT_JUDGE_LINKS when no judges', async () => {
    const { db } = makeStartCypherDb(false, 0);
    let err: unknown;
    try {
      await makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.startCypherPhase({
        competitionId: 'comp_abc',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as { cause?: unknown }).cause).toMatchObject({
      errorCode: 'INSUFFICIENT_JUDGE_LINKS',
    });
  });

  it('AC #7: groupCount forced to 1 regardless of cypherGroupCount', async () => {
    let callIdx = 0;
    const responses: unknown[][] = [
      [
        {
          id: 'comp_abc',
          status: 'draft',
          cypherGroupCount: 5,
          soloMode: true,
        },
      ],
      [{ id: 'crit_1' }],
      [{ id: 'comp_a' }, { id: 'comp_b' }, { id: 'comp_c' }],
      [],
    ];
    const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];
    const txMock: any = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const idx = callIdx++;
        const arr: unknown[] = responses[idx] ?? [];
        return {
          orderBy: vi.fn().mockResolvedValue(arr),
          then: (onfulfilled: (v: unknown) => unknown) => onfulfilled(arr),
          catch: () => undefined,
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
      insert: vi.fn(() => {
        const valuesSpy = vi.fn().mockResolvedValue([]);
        insertSpies.push({ values: valuesSpy });
        return { values: valuesSpy };
      }),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.startCypherPhase({ competitionId: 'comp_abc' });

    expect(result).toMatchObject({ success: true, groupCount: 1 });

    expect(insertSpies.length).toBeGreaterThan(0);
    const assignmentValues = (
      insertSpies[0]!.values as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0];
    expect(assignmentValues).toHaveLength(3);
    for (const assignment of assignmentValues as Array<{
      groupIndex: number;
    }>) {
      expect(assignment.groupIndex).toBe(0);
    }
  });
});

describe('tournament.completeCypherPhase solo mode (Story 4.4 Task 13)', () => {
  it('solo-mode scores from organizer session aggregate correctly into advancement', async () => {
    const orgSessionId = 'org_session_1';
    const rows = [
      scoreRow('comp_1', orgSessionId, [
        { criterionId: 'c_flow', value: '6.00' },
      ]),
      scoreRow('comp_2', orgSessionId, [
        { criterionId: 'c_flow', value: '9.00' },
      ]),
      scoreRow('comp_3', orgSessionId, [
        { criterionId: 'c_flow', value: '8.00' },
      ]),
    ];
    const { db, insertSpies, updateSpies } = makeCompleteCypherPhaseDb({
      whereResults: [
        [compRow({ advancementThreshold: 2 })],
        rows,
        [{ maxSeq: 10 }],
      ],
    });
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_123',
    ).tournament.completeCypherPhase({ competitionId: COMPETITION_ID });

    expect(result.idempotent).toBe(false);
    expect(result.advancedCount).toBe(2);
    expect(result.totalParticipants).toBe(3);
    expect(result.advancedCompetitorIds).toEqual(['comp_2', 'comp_3']);
    expect(result.finalStandings).toHaveLength(3);
    expect(result.finalStandings[0]?.totalScore).toBe('9.00');

    expect(updateSpies.length).toBeGreaterThan(0);
    const setArgs = (updateSpies[0]?.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setArgs).toMatchObject({
      cypherCompletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });

    expect(insertSpies.length).toBe(3);
    const eventArgs = (insertSpies[0]?.values as any).mock.calls[0][0];
    expect(eventArgs.type).toBe('phase.transitioned');
    expect(eventArgs.payload.advancedCompetitorIds).toEqual([
      'comp_2',
      'comp_3',
    ]);
    expect(eventArgs.payload.triggerType).toBe('admin_confirmed');

    expect(gateway.broadcastPhaseTransitioned).toHaveBeenCalledOnce();
  });
});

// ─── Story 5.2: tournament.submitVote ─────────────────────────────────────────

function makeSubmitVoteDb(
  selectResults: unknown[][],
  options: { insertThrowsPerCall?: unknown[] } = {},
) {
  const { insertThrowsPerCall } = options;
  let callIdx = 0;
  let insertCallIdx = 0;
  const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];
  const updateSpies: Array<{ set: ReturnType<typeof vi.fn> }> = [];
  const deleteSpies: Array<{ where: ReturnType<typeof vi.fn> }> = [];
  const txMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    where: vi
      .fn()
      .mockImplementation(() =>
        createLazyResult(selectResults[callIdx++] ?? []),
      ),
    insert: vi.fn(() => {
      const idx = insertCallIdx++;
      const err = insertThrowsPerCall?.[idx];
      const valuesSpy = err
        ? vi.fn().mockRejectedValue(err)
        : vi.fn().mockResolvedValue([]);
      insertSpies.push({ values: valuesSpy });
      return { values: valuesSpy };
    }),
    update: vi.fn(() => {
      const setSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      updateSpies.push({ set: setSpy });
      return { set: setSpy };
    }),
    delete: vi.fn(() => {
      const whereSpy = vi.fn().mockResolvedValue([]);
      deleteSpies.push({ where: whereSpy });
      return { where: whereSpy };
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db: {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any,
    insertSpies,
    updateSpies,
    deleteSpies,
    txMock,
  };
}

const VOTING_SESSION = { id: 'js_1', competitionId: 'comp_1' };
const ACTIVE_BATTLES = {
  status: 'active' as const,
  cypherCompletedAt: new Date('2026-04-25T00:00:00.000Z'),
};
const OPEN_MATCHUP = {
  id: 'm_1',
  competitionId: 'comp_1',
  isBye: false,
  winnerCompetitorId: null,
};

describe('tournament.submitVote', () => {
  it('rejects empty token (Zod)', async () => {
    await expect(
      caller(null).tournament.submitVote({
        token: '',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects invalid vote enum value (Zod)', async () => {
    await expect(
      caller(null).tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        // @ts-expect-error: deliberately invalid for the enum check
        vote: 'banana',
        idempotencyKey: 'k_1',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when token is invalid', async () => {
    const { db } = makeSubmitVoteDb([[]]);
    await expect(
      makeCallerFor(db, makeFullGateway()).tournament.submitVote({
        token: 'bad',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns idempotent: true when same idempotency key has been used', async () => {
    const { db, insertSpies } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [{ id: 'existing-vote-row' }], // idempotency hit
    ]);
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player1',
      idempotencyKey: 'k_1',
    });
    expect(result).toEqual({ success: true, idempotent: true });
    expect(insertSpies).toHaveLength(0);
  });

  it('throws BATTLES_NOT_ACTIVE when cypherCompletedAt is null', async () => {
    const { db } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [], // no idempotency hit
      [{ status: 'active', cypherCompletedAt: null }],
    ]);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'BATTLES_NOT_ACTIVE',
    });
  });

  it('throws MATCHUP_NOT_FOUND when matchup is missing', async () => {
    const { db } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [],
      [ACTIVE_BATTLES],
      [], // matchup lookup empty
    ]);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect((err as any).cause).toMatchObject({
      errorCode: 'MATCHUP_NOT_FOUND',
    });
  });

  it('throws MATCHUP_NOT_IN_COMPETITION on cross-competition vote', async () => {
    const { db } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [],
      [ACTIVE_BATTLES],
      [{ ...OPEN_MATCHUP, competitionId: 'other-comp' }],
    ]);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'FORBIDDEN' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'MATCHUP_NOT_IN_COMPETITION',
    });
  });

  it('throws MATCHUP_IS_BYE for bye matchups', async () => {
    const { db } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [],
      [ACTIVE_BATTLES],
      [{ ...OPEN_MATCHUP, isBye: true }],
    ]);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect((err as any).cause).toMatchObject({ errorCode: 'MATCHUP_IS_BYE' });
  });

  it('throws MATCHUP_ALREADY_RESOLVED when winnerCompetitorId is set', async () => {
    const { db } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [],
      [ACTIVE_BATTLES],
      [{ ...OPEN_MATCHUP, winnerCompetitorId: 'someone' }],
    ]);
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'MATCHUP_ALREADY_RESOLVED',
    });
  });

  it('happy path: inserts vote + event and broadcasts', async () => {
    const { db, insertSpies } = makeSubmitVoteDb([
      [VOTING_SESSION],
      [], // idempotency miss
      [ACTIVE_BATTLES],
      [OPEN_MATCHUP],
      [{ maxSeq: 42 }], // sequence MAX
    ]);
    const gateway = makeFullGateway();
    const result = await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player1',
      idempotencyKey: 'k_happy',
    });
    expect(result).toEqual({ success: true, idempotent: false });
    expect(insertSpies).toHaveLength(2);
    const voteArgs = (insertSpies[0]?.values as any).mock.calls[0][0];
    expect(voteArgs).toMatchObject({
      competitionId: 'comp_1',
      matchupId: 'm_1',
      judgeSessionId: 'js_1',
      vote: 'player1',
      idempotencyKey: 'k_happy',
    });
    const eventArgs = (insertSpies[1]?.values as any).mock.calls[0][0];
    expect(eventArgs.type).toBe('vote.submitted');
    expect(eventArgs.sequence).toBe(43);
    expect(eventArgs.createdBy).toBe('js_1');
    expect(gateway.broadcastVoteSubmitted).toHaveBeenCalledTimes(1);
  });

  it('treats 23505 on votes insert as MATCHUP_ALREADY_RESOLVED conflict', async () => {
    const conflict = Object.assign(new Error('duplicate'), { code: '23505' });
    const { db } = makeSubmitVoteDb(
      [[VOTING_SESSION], [], [ACTIVE_BATTLES], [OPEN_MATCHUP], [{ maxSeq: 0 }]],
      { insertThrowsPerCall: [conflict] },
    );
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_x',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'MATCHUP_ALREADY_RESOLVED',
    });
  });

  it('returns INTERNAL_SERVER_ERROR on event sequence collision', async () => {
    const conflict = Object.assign(new Error('duplicate'), { code: '23505' });
    const { db } = makeSubmitVoteDb(
      [[VOTING_SESSION], [], [ACTIVE_BATTLES], [OPEN_MATCHUP], [{ maxSeq: 0 }]],
      { insertThrowsPerCall: [undefined, conflict] },
    );
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_x',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

// ─── Story 5.2: tournament.getBattlesAssignment ───────────────────────────────

describe('tournament.getBattlesAssignment', () => {
  it('rejects empty token (Zod)', async () => {
    await expect(
      caller(null).tournament.getBattlesAssignment({ token: '' }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when token is invalid', async () => {
    const txMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => createLazyResult([])),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    await expect(
      makeCallerFor(db, makeFullGateway()).tournament.getBattlesAssignment({
        token: 'bad',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns battlesActive: false when cypherCompletedAt is null', async () => {
    const session = { id: 'js_1', competitionId: 'comp_1', label: 'J1' };
    let idx = 0;
    const txMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const results: unknown[][] = [
          [session],
          [{ id: 'comp_1', status: 'active', cypherCompletedAt: null }],
        ];
        return createLazyResult(results[idx++] ?? []);
      }),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getBattlesAssignment({ token: 'tok' });
    expect(result.battlesActive).toBe(false);
    expect(result.currentMatchup).toBeNull();
  });

  it('returns currentMatchup: null when judge has voted on every available matchup', async () => {
    const session = { id: 'js_1', competitionId: 'comp_1', label: 'J1' };
    const comp = {
      id: 'comp_1',
      status: 'active',
      cypherCompletedAt: new Date(),
    };
    let idx = 0;
    const results: unknown[][] = [
      [session],
      [comp],
      [{ matchupId: 'm_1' }, { matchupId: 'm_2' }], // already voted
      [
        {
          id: 'm_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'a',
          competitorBId: 'b',
          seedA: 1,
          seedB: 2,
          winnerCompetitorId: null,
          isBye: false,
        },
        {
          id: 'm_2',
          roundNumber: 1,
          bracketPosition: 1,
          competitorAId: 'c',
          competitorBId: 'd',
          seedA: 3,
          seedB: 4,
          winnerCompetitorId: null,
          isBye: false,
        },
      ],
    ];
    const txMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() => createLazyResult(results[idx++] ?? [])),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getBattlesAssignment({ token: 'tok' });
    expect(result.battlesActive).toBe(true);
    expect(result.currentMatchup).toBeNull();
  });

  it('skips byes and resolved matchups, returns first remaining unjudged matchup', async () => {
    const session = { id: 'js_1', competitionId: 'comp_1', label: 'J1' };
    const comp = {
      id: 'comp_1',
      status: 'active',
      cypherCompletedAt: new Date(),
    };
    const matchups = [
      // bye — should be skipped
      {
        id: 'm_bye',
        roundNumber: 1,
        bracketPosition: 0,
        competitorAId: 'a',
        competitorBId: null,
        seedA: 1,
        seedB: null,
        winnerCompetitorId: 'a',
        isBye: true,
      },
      // already resolved — should be skipped
      {
        id: 'm_done',
        roundNumber: 1,
        bracketPosition: 1,
        competitorAId: 'b',
        competitorBId: 'c',
        seedA: 2,
        seedB: 3,
        winnerCompetitorId: 'b',
        isBye: false,
      },
      // open — this should be returned
      {
        id: 'm_open',
        roundNumber: 1,
        bracketPosition: 2,
        competitorAId: 'd',
        competitorBId: 'e',
        seedA: 4,
        seedB: 5,
        winnerCompetitorId: null,
        isBye: false,
      },
    ];
    let idx = 0;
    const results: unknown[][] = [
      [session],
      [comp],
      [], // no votes by this judge yet
      matchups,
      [
        { id: 'd', name: 'Daria', participantId: 'P-D' },
        { id: 'e', name: 'Eve', participantId: 'P-E' },
      ],
    ];
    const txMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() => createLazyResult(results[idx++] ?? [])),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
    ).tournament.getBattlesAssignment({ token: 'tok' });
    expect(result.battlesActive).toBe(true);
    expect(result.currentMatchup).toMatchObject({
      matchupId: 'm_open',
      competitorA: { name: 'Daria', seed: 4 },
      competitorB: { name: 'Eve', seed: 5 },
    });
  });
});

// ─── Story 5.2: tournament.submitOrganizerVote ────────────────────────────────

describe('tournament.submitOrganizerVote', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.submitOrganizerVote({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty matchupId (Zod)', async () => {
    await expect(
      caller('user_1').tournament.submitOrganizerVote({
        competitionId: 'comp_1',
        matchupId: '',
        vote: 'player1',
        idempotencyKey: 'k_1',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when competition is not owned', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.submitOrganizerVote({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BATTLES_NOT_ACTIVE when cypherCompletedAt is null', async () => {
    let idx = 0;
    const results: unknown[][] = [
      [
        {
          id: 'comp_1',
          status: 'active',
          soloMode: true,
          cypherCompletedAt: null,
        },
      ],
    ];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() => Promise.resolve(results[idx++] ?? [])),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const err = await makeCallerFor(db, makeFullGateway(), 'user_1')
      .tournament.submitOrganizerVote({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect((err as any).cause).toMatchObject({
      errorCode: 'BATTLES_NOT_ACTIVE',
    });
  });

  it('throws SOLO_MODE_NOT_ENABLED when soloMode is false', async () => {
    let idx = 0;
    const results: unknown[][] = [
      [
        {
          id: 'comp_1',
          status: 'active',
          soloMode: false,
          cypherCompletedAt: new Date(),
        },
      ],
    ];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() => Promise.resolve(results[idx++] ?? [])),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const err = await makeCallerFor(db, makeFullGateway(), 'user_1')
      .tournament.submitOrganizerVote({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
      })
      .catch((e: TRPCError) => e);
    expect((err as any).cause).toMatchObject({
      errorCode: 'SOLO_MODE_NOT_ENABLED',
    });
  });

  it('happy path: reuses existing organizer session, inserts vote + event, broadcasts', async () => {
    const compRow = {
      id: 'comp_1',
      status: 'active',
      soloMode: true,
      cypherCompletedAt: new Date(),
    };
    let selectIdx = 0;
    const selectResults: unknown[][] = [
      [compRow], // ownership/load
      [{ id: 'js_org' }], // existing organizer session
      [], // idempotency miss
      [
        {
          id: 'm_1',
          competitionId: 'comp_1',
          isBye: false,
          winnerCompetitorId: null,
        },
      ], // matchup
      [{ maxSeq: 7 }], // sequence
    ];
    const insertSpies: Array<{ values: ReturnType<typeof vi.fn> }> = [];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(selectResults[selectIdx++] ?? []),
        ),
      insert: vi.fn(() => {
        const valuesSpy = vi.fn().mockResolvedValue([]);
        insertSpies.push({ values: valuesSpy });
        return { values: valuesSpy };
      }),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_1',
    ).tournament.submitOrganizerVote({
      competitionId: 'comp_1',
      matchupId: 'm_1',
      vote: 'tie',
      idempotencyKey: 'k_solo',
    });
    expect(result).toEqual({ success: true, idempotent: false });
    // No judge_sessions INSERT (existing session reused).
    expect(insertSpies).toHaveLength(2);
    const voteArgs = (insertSpies[0]?.values as any).mock.calls[0][0];
    expect(voteArgs).toMatchObject({
      judgeSessionId: 'js_org',
      vote: 'tie',
      idempotencyKey: 'k_solo',
    });
    const eventArgs = (insertSpies[1]?.values as any).mock.calls[0][0];
    expect(eventArgs.type).toBe('vote.submitted');
    expect(eventArgs.sequence).toBe(8);
    expect(gateway.broadcastVoteSubmitted).toHaveBeenCalledTimes(1);
  });
});

// ─── Story 5.3: processMatchupOutcome via submitVote ──────────────────────────

describe('tournament.submitVote → processMatchupOutcome (Story 5.3)', () => {
  // Helper: builds the selectResults sequence for the standard
  // [auth, idempotency-miss, ACTIVE_BATTLES, OPEN_MATCHUP, maxSeq] prefix
  // followed by the helper's own selects.
  const PREFIX = (maxSeq = 0) => [
    [VOTING_SESSION],
    [], // idempotency miss
    [ACTIVE_BATTLES],
    [OPEN_MATCHUP],
    [{ maxSeq }], // submitVote sequence
  ];

  const MATCHUP_LOADED = {
    id: 'm_1',
    competitionId: 'comp_1',
    roundNumber: 1,
    bracketPosition: 0,
    competitorAId: 'c_a',
    competitorBId: 'c_b',
    isBye: false,
    winnerCompetitorId: null,
    tieStatus: null,
    revoteCount: 0,
  };

  it('pending: helper returns null when fewer than expected votes', async () => {
    const { db, insertSpies } = makeSubmitVoteDb([
      ...PREFIX(0),
      [MATCHUP_LOADED], // helper: matchup row
      [{ vote: 'player1' }], // helper: votes (only 1 of 3 expected)
      [{ count: 3 }], // helper: expectedVotes
    ]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player1',
      idempotencyKey: 'k_pending',
    });
    expect(insertSpies).toHaveLength(2); // vote + vote.submitted only
    expect(gateway.broadcastMatchupCompleted).not.toHaveBeenCalled();
    expect(gateway.broadcastBracketAdvanced).not.toHaveBeenCalled();
  });

  it('clear winner: writes matchup.completed + advances or completes', async () => {
    // 4 of 4 expected, 3 player1 / 1 player2 → winner A.
    // Then maybeAdvanceRound: only this matchup in the round → final → completion.
    const { db, insertSpies } = makeSubmitVoteDb([
      ...PREFIX(10),
      [MATCHUP_LOADED],
      [
        { vote: 'player1' },
        { vote: 'player1' },
        { vote: 'player1' },
        { vote: 'player2' },
      ],
      [{ count: 4 }],
      // matchup.completed event sequence
      [{ maxSeq: 11 }],
      // maybeAdvanceRound → roundRows after winner update
      [
        {
          id: 'm_1',
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          seedA: 1,
          seedB: 2,
          isBye: false,
          winnerCompetitorId: 'c_a',
          tieStatus: null,
        },
      ],
      // competition.completed event sequence
      [{ maxSeq: 12 }],
    ]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player2',
      idempotencyKey: 'k_winner',
    });
    expect(gateway.broadcastMatchupCompleted).toHaveBeenCalledTimes(1);
    const completedPayload = (gateway.broadcastMatchupCompleted as any).mock
      .calls[0][1];
    expect(completedPayload.winnerCompetitorId).toBe('c_a');
    expect(completedPayload.advancedFromTie).toBe(false);
    expect(gateway.broadcastCompetitionCompleted).toHaveBeenCalledTimes(1);
    const compCompletedPayload = (gateway.broadcastCompetitionCompleted as any)
      .mock.calls[0][1];
    expect(compCompletedPayload.championCompetitorId).toBe('c_a');
    expect(insertSpies.length).toBeGreaterThanOrEqual(4);
  });

  it('tie + re_vote: deletes votes, increments revoteCount, broadcasts revote-required', async () => {
    const { db, insertSpies, deleteSpies, updateSpies } = makeSubmitVoteDb([
      ...PREFIX(20),
      [MATCHUP_LOADED],
      [{ vote: 'player1' }, { vote: 'player2' }, { vote: 'tie' }],
      [{ count: 3 }],
      [{ tieBreakingRule: 're_vote' }],
      [{ maxSeq: 21 }],
    ]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'tie',
      idempotencyKey: 'k_revote',
    });
    expect(deleteSpies.length).toBeGreaterThanOrEqual(1);
    expect(gateway.broadcastMatchupRevoteRequired).toHaveBeenCalledTimes(1);
    const revotePayload = (gateway.broadcastMatchupRevoteRequired as any).mock
      .calls[0][1];
    expect(revotePayload.revoteCount).toBe(1);
    expect(gateway.broadcastMatchupCompleted).not.toHaveBeenCalled();
    expect(updateSpies.length).toBeGreaterThanOrEqual(1);
    expect(insertSpies.length).toBeGreaterThanOrEqual(3); // vote, vote.submitted, matchup.revote-required
  });

  it('tie + organizer_decision: sets tieStatus, admin-only broadcast, no public broadcast', async () => {
    const { db, updateSpies } = makeSubmitVoteDb([
      ...PREFIX(30),
      [MATCHUP_LOADED],
      [{ vote: 'player1' }, { vote: 'player2' }, { vote: 'tie' }],
      [{ count: 3 }],
      [{ tieBreakingRule: 'organizer_decision' }],
      [{ maxSeq: 31 }],
    ]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'tie',
      idempotencyKey: 'k_org',
    });
    expect(gateway.broadcastMatchupTieResolutionRequired).toHaveBeenCalledTimes(
      1,
    );
    expect(gateway.broadcastMatchupCompleted).not.toHaveBeenCalled();
    expect(gateway.broadcastMatchupRevoteRequired).not.toHaveBeenCalled();
    expect(updateSpies.length).toBeGreaterThanOrEqual(1);
  });

  it('skips tally when matchup is in tie-resolution limbo', async () => {
    // submitVote's matchup-load uses OPEN_MATCHUP (winner null), but then the
    // helper re-loads with tieStatus=organizer_decision_pending → returns null.
    const LIMBO = {
      ...MATCHUP_LOADED,
      tieStatus: 'organizer_decision_pending',
    };
    const { db } = makeSubmitVoteDb([
      ...PREFIX(50),
      [LIMBO], // helper: limbo state
    ]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player1',
      idempotencyKey: 'k_limbo',
    });
    expect(gateway.broadcastMatchupCompleted).not.toHaveBeenCalled();
    expect(gateway.broadcastMatchupRevoteRequired).not.toHaveBeenCalled();
    expect(
      gateway.broadcastMatchupTieResolutionRequired,
    ).not.toHaveBeenCalled();
  });

  it('round advancement: 4-bracket round 1, last winner triggers bracket.advanced with 1 round-2 matchup', async () => {
    // 4-matchup round 1 already had 3 winners; this vote produces the 4th.
    // After update, round contains 4 winners → buildNextRound emits 2 round-2
    // matchups; but wait — to get to "final" branch we'd need single-matchup round.
    // Here we test round advancement (multi-matchup → next round).
    const M2 = { ...MATCHUP_LOADED, bracketPosition: 3 };
    const { db } = makeSubmitVoteDb([
      ...PREFIX(60),
      [M2],
      [{ vote: 'player1' }, { vote: 'player1' }, { vote: 'player1' }],
      [{ count: 3 }],
      [{ maxSeq: 61 }], // matchup.completed seq
      // maybeAdvanceRound → roundRows for round 1 (4 matchups, all resolved)
      [
        {
          id: 'p_0',
          bracketPosition: 0,
          competitorAId: 'c1',
          competitorBId: 'c2',
          seedA: 1,
          seedB: 8,
          isBye: false,
          winnerCompetitorId: 'c1',
          tieStatus: null,
        },
        {
          id: 'p_1',
          bracketPosition: 1,
          competitorAId: 'c3',
          competitorBId: 'c4',
          seedA: 4,
          seedB: 5,
          isBye: false,
          winnerCompetitorId: 'c4',
          tieStatus: null,
        },
        {
          id: 'p_2',
          bracketPosition: 2,
          competitorAId: 'c5',
          competitorBId: 'c6',
          seedA: 2,
          seedB: 7,
          isBye: false,
          winnerCompetitorId: 'c5',
          tieStatus: null,
        },
        {
          id: 'p_3',
          bracketPosition: 3,
          competitorAId: 'c7',
          competitorBId: 'c8',
          seedA: 3,
          seedB: 6,
          isBye: false,
          winnerCompetitorId: 'c7',
          tieStatus: null,
        },
      ],
      [{ maxSeq: 62 }], // bracket.advanced seq
    ]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player1',
      idempotencyKey: 'k_adv',
    });
    expect(gateway.broadcastMatchupCompleted).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastBracketAdvanced).toHaveBeenCalledTimes(1);
    const advPayload = (gateway.broadcastBracketAdvanced as any).mock
      .calls[0][1];
    expect(advPayload.roundNumber).toBe(2);
    expect(advPayload.matchups).toHaveLength(2);
    expect(gateway.broadcastCompetitionCompleted).not.toHaveBeenCalled();
  });

  it('Review fix H1: maps 23505 on matchup.completed event insert to INTERNAL_SERVER_ERROR', async () => {
    // Insert order in the clear-winner path:
    //   0: votes, 1: vote.submitted event, 2: matchup.completed event ← collide
    const conflict = Object.assign(new Error('duplicate'), { code: '23505' });
    const { db } = makeSubmitVoteDb(
      [
        ...PREFIX(0),
        [MATCHUP_LOADED],
        [{ vote: 'player1' }, { vote: 'player1' }, { vote: 'player1' }],
        [{ count: 3 }],
        [{ maxSeq: 1 }],
      ],
      { insertThrowsPerCall: [undefined, undefined, conflict] },
    );
    const err = await makeCallerFor(db, makeFullGateway())
      .tournament.submitVote({
        token: 'tok',
        matchupId: 'm_1',
        vote: 'player1',
        idempotencyKey: 'k_h1',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('Review fix M2: returns no broadcasts when matchup belongs to a different competition', async () => {
    // The submitVote ownership check passes (OPEN_MATCHUP.competitionId =
    // 'comp_1'), but inside the helper the re-loaded matchup row reports
    // competitionId='other_comp'. Defense-in-depth guard short-circuits.
    const FOREIGN = { ...MATCHUP_LOADED, competitionId: 'other_comp' };
    const { db } = makeSubmitVoteDb([...PREFIX(0), [FOREIGN]]);
    const gateway = makeFullGateway();
    await makeCallerFor(db, gateway).tournament.submitVote({
      token: 'tok',
      matchupId: 'm_1',
      vote: 'player1',
      idempotencyKey: 'k_m2',
    });
    expect(gateway.broadcastMatchupCompleted).not.toHaveBeenCalled();
    expect(gateway.broadcastMatchupRevoteRequired).not.toHaveBeenCalled();
    expect(
      gateway.broadcastMatchupTieResolutionRequired,
    ).not.toHaveBeenCalled();
    expect(gateway.broadcastBracketAdvanced).not.toHaveBeenCalled();
    expect(gateway.broadcastCompetitionCompleted).not.toHaveBeenCalled();
  });
});

// ─── Story 5.3: tournament.resolveTie ────────────────────────────────────────

describe('tournament.resolveTie (Story 5.3)', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_a',
        reason: 'A had cleaner footwork',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty reason via Zod (TIE_RESOLUTION_REASON_REQUIRED)', async () => {
    await expect(
      caller('user_x').tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_a',
        reason: '   ',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects reason shorter than 4 chars via Zod', async () => {
    await expect(
      caller('user_x').tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_a',
        reason: 'abc',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects reason longer than 280 chars via Zod', async () => {
    await expect(
      caller('user_x').tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_a',
        reason: 'a'.repeat(281),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('throws NOT_FOUND when matchup is missing or not owned', async () => {
    const { db } = makeSubmitVoteDb([[]]);
    await expect(
      makeCallerFor(db, makeFullGateway(), 'user_x').tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_a',
        reason: 'Cleaner footwork',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws MATCHUP_NOT_TIED when tieStatus is not pending', async () => {
    const { db } = makeSubmitVoteDb([
      [
        {
          matchupId: 'm_1',
          competitionId: 'comp_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          tieStatus: null,
          winnerCompetitorId: null,
        },
      ],
    ]);
    const err = await makeCallerFor(db, makeFullGateway(), 'user_x')
      .tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_a',
        reason: 'Cleaner footwork',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'MATCHUP_NOT_TIED',
    });
  });

  it('throws WINNER_NOT_IN_MATCHUP when winnerCompetitorId is unrelated', async () => {
    const { db } = makeSubmitVoteDb([
      [
        {
          matchupId: 'm_1',
          competitionId: 'comp_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          tieStatus: 'organizer_decision_pending',
          winnerCompetitorId: null,
        },
      ],
    ]);
    const err = await makeCallerFor(db, makeFullGateway(), 'user_x')
      .tournament.resolveTie({
        competitionId: 'comp_1',
        matchupId: 'm_1',
        winnerCompetitorId: 'c_zzz',
        reason: 'Cleaner footwork',
      })
      .catch((e: TRPCError) => e);
    expect(err).toMatchObject({ code: 'BAD_REQUEST' });
    expect((err as any).cause).toMatchObject({
      errorCode: 'WINNER_NOT_IN_MATCHUP',
    });
  });

  it('happy path: writes matchup.completed (advancedFromTie=true) + completes competition', async () => {
    const { db, insertSpies, updateSpies } = makeSubmitVoteDb([
      // 1. ownership check → returns matchup row
      [
        {
          matchupId: 'm_1',
          competitionId: 'comp_1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          tieStatus: 'organizer_decision_pending',
          winnerCompetitorId: null,
        },
      ],
      // 3. votes for tally re-aggregation
      [{ vote: 'player1' }, { vote: 'player2' }, { vote: 'tie' }],
      // 5. matchup.completed event seq
      [{ maxSeq: 100 }],
      // maybeAdvanceRound: round 1 has 1 matchup (this one) all resolved → final
      [
        {
          id: 'm_1',
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_b',
          seedA: 1,
          seedB: 2,
          isBye: false,
          winnerCompetitorId: 'c_a',
          tieStatus: null,
        },
      ],
      // competition.completed seq
      [{ maxSeq: 101 }],
    ]);
    const gateway = makeFullGateway();
    const result = await makeCallerFor(
      db,
      gateway,
      'user_x',
    ).tournament.resolveTie({
      competitionId: 'comp_1',
      matchupId: 'm_1',
      winnerCompetitorId: 'c_a',
      reason: 'Cleaner footwork won the round',
    });
    expect(result).toEqual({ success: true, matchupId: 'm_1' });
    expect(updateSpies.length).toBeGreaterThanOrEqual(1);
    expect(gateway.broadcastMatchupCompleted).toHaveBeenCalledTimes(1);
    const payload = (gateway.broadcastMatchupCompleted as any).mock.calls[0][1];
    expect(payload.advancedFromTie).toBe(true);
    expect(payload.organizerDecisionReason).toBe(
      'Cleaner footwork won the round',
    );
    expect(payload.winnerCompetitorId).toBe('c_a');
    expect(gateway.broadcastCompetitionCompleted).toHaveBeenCalledTimes(1);
    expect(insertSpies.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// createSimulation tests (Story 7.1)
// ---------------------------------------------------------------------------

describe('tournament.createSimulation', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.createSimulation({
        name: 'Test Simulation',
        date: null,
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects empty name with Zod validation error', async () => {
    await expect(
      caller('user_123').tournament.createSimulation({
        name: '',
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects mockParticipantCount below 2', async () => {
    await expect(
      caller('user_123').tournament.createSimulation({
        name: 'Test Sim',
        date: null,
        description: null,
        mockParticipantCount: 1,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects mockParticipantCount above 200', async () => {
    await expect(
      caller('user_123').tournament.createSimulation({
        name: 'Test Sim',
        date: null,
        description: null,
        mockParticipantCount: 201,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects mockParticipantCount that is not an integer', async () => {
    await expect(
      caller('user_123').tournament.createSimulation({
        name: 'Test Sim',
        date: null,
        description: null,
        mockParticipantCount: 5.5,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('creates simulation with isSimulation: true', async () => {
    const createdRow = {
      id: 'sim_1',
      name: 'Test Sim',
      description: null,
      date: null,
      status: 'draft',
      isSimulation: true,
      createdAt: new Date(),
    };
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdRow]),
      }),
    });
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: insertMock,
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.createSimulation({
      name: 'Test Sim',
      date: null,
      description: null,
    });
    expect(result.isSimulation).toBe(true);
    expect(result.id).toBe('sim_1');
    expect(result.participantCount).toBe(0);
    expect(result.criteriaCount).toBe(0);
  });

  it('generates mock participants with correct names and IDs', async () => {
    const createdRow = {
      id: 'sim_2',
      name: 'Sim With Participants',
      description: null,
      date: null,
      status: 'draft',
      isSimulation: true,
      createdAt: new Date(),
    };
    const competitorValues: unknown[] = [];
    const insertMock = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: unknown) => {
        if (Array.isArray(vals)) {
          competitorValues.push(...vals);
          return Promise.resolve([]);
        }
        return { returning: vi.fn().mockResolvedValue([createdRow]) };
      }),
    }));
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: insertMock,
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.createSimulation({
      name: 'Sim With Participants',
      date: null,
      description: null,
      mockParticipantCount: 5,
    });
    expect(result.participantCount).toBe(5);
    expect(competitorValues).toHaveLength(5);
    expect(competitorValues[0]).toMatchObject({
      participantId: 'SIM-01',
      name: 'Competitor 01',
    });
    expect(competitorValues[4]).toMatchObject({
      participantId: 'SIM-05',
      name: 'Competitor 05',
    });
  });

  it('clones config and criteria from source competition', async () => {
    const sourceComp = {
      id: 'src_comp',
      participantFormat: 'individual',
      cypherJudgeCount: 3,
      cypherGroupCount: 2,
      advancementThreshold: 8,
      battlesJudgeCount: 5,
      tieBreakingRule: 'organizer_decision',
    };
    const sourceCriteria = [
      {
        id: 'c1',
        name: 'Flow',
        minScore: '0.00',
        maxScore: '10.00',
        precision: 2,
        displayOrder: 0,
      },
      {
        id: 'c2',
        name: 'Rhythm',
        minScore: '0.00',
        maxScore: '10.00',
        precision: 2,
        displayOrder: 1,
      },
    ];
    const createdRow = {
      id: 'sim_3',
      name: 'Cloned Sim',
      description: null,
      date: null,
      status: 'draft',
      isSimulation: true,
      createdAt: new Date(),
    };

    let selectCallIdx = 0;
    const selectResults: unknown[][] = [[sourceComp], sourceCriteria];
    const criteriaInserted: unknown[] = [];
    const insertMock = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: unknown) => {
        if (Array.isArray(vals)) {
          criteriaInserted.push(...vals);
          return Promise.resolve([]);
        }
        return { returning: vi.fn().mockResolvedValue([createdRow]) };
      }),
    }));
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() =>
          createLazyResult(selectResults[selectCallIdx++] ?? []),
        ),
      insert: insertMock,
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.createSimulation({
      name: 'Cloned Sim',
      date: null,
      description: null,
      sourceCompetitionId: 'src_comp',
    });
    expect(result.criteriaCount).toBe(2);
    expect(criteriaInserted).toHaveLength(2);
    expect(criteriaInserted[0]).toMatchObject({
      competitionId: 'sim_3',
      name: 'Flow',
    });
    expect(criteriaInserted[1]).toMatchObject({
      competitionId: 'sim_3',
      name: 'Rhythm',
    });
  });

  it('throws NOT_FOUND when sourceCompetitionId is invalid', async () => {
    let selectCallIdx = 0;
    const selectResults: unknown[][] = [[]];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(() =>
          createLazyResult(selectResults[selectCallIdx++] ?? []),
        ),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    await expect(
      makeCallerFor(
        db,
        makeFullGateway(),
        'user_1',
      ).tournament.createSimulation({
        name: 'Bad Clone',
        date: null,
        description: null,
        sourceCompetitionId: 'nonexistent',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// list and getCompetition include isSimulation (Story 7.1)
// ---------------------------------------------------------------------------

describe('tournament.list isSimulation field', () => {
  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(caller(null).tournament.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns competitions with isSimulation field', async () => {
    const compRows = [
      {
        id: 'c1',
        name: 'Live Comp',
        description: null,
        date: null,
        status: 'draft',
        participantFormat: 'individual',
        isSimulation: false,
        createdAt: new Date(),
      },
      {
        id: 'c2',
        name: 'Sim Comp',
        description: null,
        date: null,
        status: 'draft',
        participantFormat: 'individual',
        isSimulation: true,
        createdAt: new Date(),
      },
    ];
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(compRows),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.list();
    expect(result).toHaveLength(2);
    expect(result[0].isSimulation).toBe(false);
    expect(result[1].isSimulation).toBe(true);
  });
});

describe('tournament.getCompetition isSimulation field', () => {
  it('returns competition with isSimulation field', async () => {
    const compRow = {
      id: 'c1',
      name: 'Live Comp',
      status: 'draft',
      participantFormat: 'individual',
      cypherJudgeCount: null,
      cypherGroupCount: null,
      advancementThreshold: null,
      battlesJudgeCount: null,
      tieBreakingRule: null,
      cypherCompletedAt: null,
      soloMode: false,
      isSimulation: true,
    };
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([compRow]),
    };
    const db = {
      db: {
        transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
      },
    } as any;
    const result = await makeCallerFor(
      db,
      makeFullGateway(),
      'user_1',
    ).tournament.getCompetition({ competitionId: 'c1' });
    expect(result.isSimulation).toBe(true);
  });
});
