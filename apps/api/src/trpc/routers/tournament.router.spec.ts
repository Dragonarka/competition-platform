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

describe('tournament.getJudgeAssignments', () => {
  it('rejects empty token (Zod error)', async () => {
    await expect(
      caller(null).tournament.getJudgeAssignments({ token: '' }),
    ).rejects.toThrow(TRPCError);
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
    broadcastStandingsUpdated: vi.fn(),
  };
}

function makeCallerFor(db: any, gateway: ICompetitionGateway) {
  const r = createTournamentRouter(db, gateway);
  const appR = t.router({ tournament: r });
  return appR.createCaller({ userId: null, clientIp: '127.0.0.1' });
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
// (no transaction). This helper mocks the non-transactional Drizzle chain.
function makeStandingsDb(scoreRows: unknown[]) {
  const dbMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => createLazyResult(scoreRows)),
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
});
