import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/clerk-jwt', () => ({
  verifyClerkJwt: vi.fn(),
}));

import { CompetitionGateway } from './competition.gateway';
import { verifyClerkJwt } from '../../auth/clerk-jwt';

const mockVerifyClerkJwt = verifyClerkJwt as ReturnType<typeof vi.fn>;

function makeDbService(overrides: Record<string, unknown> = {}) {
  return {
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
  } as any;
}

function makeSocket(
  overrides: {
    auth?: Record<string, unknown>;
    query?: Record<string, unknown>;
    data?: Record<string, unknown>;
  } = {},
) {
  return {
    id: 'socket-123',
    handshake: {
      auth: overrides.auth ?? {},
      query: overrides.query ?? {},
    },
    data: overrides.data ?? {},
    disconnect: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
  } as any;
}

function makeGateway(db?: any) {
  const gateway = new CompetitionGateway(db ?? makeDbService());
  // Stub the server to prevent real Socket.IO calls
  gateway.server = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as any;
  return gateway;
}

describe('CompetitionGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── handleConnection ────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('accepts a valid Clerk JWT and sets role=organizer', async () => {
      mockVerifyClerkJwt.mockResolvedValue({ sub: 'user_abc' });
      const gateway = makeGateway();
      const client = makeSocket({ auth: { clerkToken: 'valid-clerk-token' } });

      await gateway.handleConnection(client);

      expect(client.data.role).toBe('organizer');
      expect(client.data.organizerClerkId).toBe('user_abc');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects on an invalid Clerk JWT', async () => {
      mockVerifyClerkJwt.mockResolvedValue(null);
      const gateway = makeGateway();
      const client = makeSocket({ auth: { clerkToken: 'bad-token' } });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('sets role=anonymous when no token is provided', async () => {
      const gateway = makeGateway();
      const client = makeSocket();

      await gateway.handleConnection(client);

      expect(client.data.role).toBe('anonymous');
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  // ─── handleAdminJoin ─────────────────────────────────────────────────────────

  describe('handleAdminJoin', () => {
    it('allows an organizer who owns the competition to join', async () => {
      const db = makeDbService();
      db.db.where = vi.fn().mockResolvedValue([{ id: 'comp_1' }]);
      const gateway = makeGateway(db);
      const client = makeSocket({
        data: { role: 'organizer', organizerClerkId: 'user_abc' },
      });

      await gateway.handleAdminJoin({ competitionId: 'comp_1' }, client);

      expect(client.join).toHaveBeenCalledWith('competition:comp_1:admin');
    });

    it('rejects when the organizer does not own the competition', async () => {
      const gateway = makeGateway(); // db.where returns []
      const client = makeSocket({
        data: { role: 'organizer', organizerClerkId: 'user_abc' },
      });

      await gateway.handleAdminJoin({ competitionId: 'comp_other' }, client);

      expect(client.join).not.toHaveBeenCalled();
      // H1 fix: client must receive an error event on rejection
      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('rejects a judge client', async () => {
      const gateway = makeGateway();
      const client = makeSocket({
        data: { role: 'judge', judgeSessionId: 's_1' },
      });

      await gateway.handleAdminJoin({ competitionId: 'comp_1' }, client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
    });

    it('rejects an anonymous client', async () => {
      const gateway = makeGateway();
      const client = makeSocket({ data: { role: 'anonymous' } });

      await gateway.handleAdminJoin({ competitionId: 'comp_1' }, client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
    });

    it('emits error and disconnects when role=organizer but clerkId is missing (corrupt state)', async () => {
      const gateway = makeGateway();
      const client = makeSocket({
        data: { role: 'organizer' /* organizerClerkId missing */ },
      });

      await gateway.handleAdminJoin({ competitionId: 'comp_1' }, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ─── handleJudgeStatus ───────────────────────────────────────────────────────

  describe('handleJudgeStatus', () => {
    it('updates presence map and broadcasts to admin room', () => {
      const gateway = makeGateway();

      // Seed presence map via internal method
      gateway['judgePresence'].set(
        'comp_1',
        new Map([
          [
            'session_1',
            {
              judgeSessionId: 'session_1',
              label: 'Judge 1',
              groupIndex: 0,
              connected: true,
              queueSize: 0,
              lastSeenAt: null,
            },
          ],
        ]),
      );

      const emitSpy = vi.fn();
      gateway.server = {
        to: vi.fn().mockReturnValue({ emit: emitSpy }),
      } as any;

      const client = makeSocket({
        data: {
          role: 'judge',
          judgeSessionId: 'session_1',
          competitionId: 'comp_1',
        },
      });

      gateway.handleJudgeStatus(
        { competitionId: 'comp_1', sessionId: 'session_1', queueSize: 3 },
        client,
      );

      const updated = gateway['judgePresence'].get('comp_1')?.get('session_1');
      expect(updated?.queueSize).toBe(3);
      expect(emitSpy).toHaveBeenCalledWith(
        'judge.status-changed',
        expect.objectContaining({
          judgeSessionId: 'session_1',
          queueSize: 3,
        }),
      );
    });

    it('rejects when judgeSessionId mismatches client.data.judgeSessionId', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      gateway.server = {
        to: vi.fn().mockReturnValue({ emit: emitSpy }),
      } as any;

      const client = makeSocket({
        data: {
          role: 'judge',
          judgeSessionId: 'session_1',
          competitionId: 'comp_1',
        },
      });

      gateway.handleJudgeStatus(
        { competitionId: 'comp_1', sessionId: 'session_WRONG', queueSize: 1 },
        client,
      );

      expect(emitSpy).not.toHaveBeenCalled();
    });

    // M2 fix: runtime validation of payload at WS trust boundary
    it.each([
      ['negative queueSize', { queueSize: -1 }],
      ['non-integer queueSize', { queueSize: 1.5 }],
      ['NaN queueSize', { queueSize: NaN }],
      ['Infinity queueSize', { queueSize: Infinity }],
      ['queueSize over the cap', { queueSize: 10_001 }],
      ['string queueSize', { queueSize: '5' as unknown as number }],
    ])('rejects malformed payload — %s', (_label, override) => {
      const gateway = makeGateway();
      gateway['judgePresence'].set(
        'comp_1',
        new Map([
          [
            'session_1',
            {
              judgeSessionId: 'session_1',
              label: 'Judge 1',
              groupIndex: 0,
              connected: true,
              queueSize: 0,
              lastSeenAt: null,
            },
          ],
        ]),
      );
      const emitSpy = vi.fn();
      gateway.server = {
        to: vi.fn().mockReturnValue({ emit: emitSpy }),
      } as any;
      const client = makeSocket({
        data: {
          role: 'judge',
          judgeSessionId: 'session_1',
          competitionId: 'comp_1',
        },
      });

      gateway.handleJudgeStatus(
        { competitionId: 'comp_1', sessionId: 'session_1', ...override } as any,
        client,
      );

      // No broadcast and no map mutation
      expect(emitSpy).not.toHaveBeenCalled();
      expect(
        gateway['judgePresence'].get('comp_1')?.get('session_1')?.queueSize,
      ).toBe(0);
    });
  });

  // ─── broadcastJudgeStatusChanged emits to admin room only ───────────────────

  describe('broadcastJudgeStatusChanged', () => {
    it('emits judge.status-changed ONLY to the admin room', () => {
      const gateway = makeGateway();
      const toSpy = vi.fn().mockReturnValue({ emit: vi.fn() });
      gateway.server = { to: toSpy } as any;

      gateway.broadcastJudgeStatusChanged('comp_1', {
        judgeSessionId: 's_1',
        label: 'J1',
        groupIndex: null,
        connected: true,
        queueSize: 0,
        lastSeenAt: null,
      });

      expect(toSpy).toHaveBeenCalledWith('competition:comp_1:admin');
      expect(toSpy).not.toHaveBeenCalledWith('competition:comp_1:public');
    });
  });

  // ─── broadcastVoteSubmitted fans out to admin + every per-judge room ────────

  describe('broadcastVoteSubmitted', () => {
    it('emits vote.submitted to the admin room AND each known judge room (AC #10)', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi
        .fn()
        .mockImplementation(() => ({ to: toSpy, emit: emitSpy }));
      gateway.server = { to: toSpy } as any;

      // Seed presence for two judges; broadcastVoteSubmitted must hit both rooms.
      gateway['judgePresence'].set(
        'comp_1',
        new Map([
          [
            's_1',
            {
              judgeSessionId: 's_1',
              label: 'A',
              groupIndex: null,
              connected: true,
              queueSize: 0,
              lastSeenAt: null,
            },
          ],
          [
            's_2',
            {
              judgeSessionId: 's_2',
              label: 'B',
              groupIndex: null,
              connected: false,
              queueSize: 0,
              lastSeenAt: null,
            },
          ],
        ]) as any,
      );

      gateway.broadcastVoteSubmitted('comp_1', {
        competitionId: 'comp_1',
        matchupId: 'm_1',
        judgeSessionId: 's_1',
        vote: 'player1',
        idempotencyKey: 'k_1',
        submittedAt: '2026-05-04T15:00:00.000Z',
      });

      const targetedRooms = toSpy.mock.calls.map((c) => c[0]);
      expect(targetedRooms).toContain('competition:comp_1:admin');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_1');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_2');
      expect(emitSpy).toHaveBeenCalledWith(
        'vote.submitted',
        expect.objectContaining({ matchupId: 'm_1' }),
      );
    });

    it('emits to admin only when no judges are present', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi
        .fn()
        .mockImplementation(() => ({ to: toSpy, emit: emitSpy }));
      gateway.server = { to: toSpy } as any;

      gateway.broadcastVoteSubmitted('comp_2', {
        competitionId: 'comp_2',
        matchupId: 'm_x',
        judgeSessionId: 's_x',
        vote: 'tie',
        idempotencyKey: 'k_x',
        submittedAt: '2026-05-04T15:00:00.000Z',
      });

      expect(toSpy).toHaveBeenCalledWith('competition:comp_2:admin');
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Story 5.3 broadcasts: matchup.* + bracket.advanced + competition.completed ─

  function seedTwoJudges(gateway: any): void {
    gateway['judgePresence'].set(
      'comp_1',
      new Map([
        [
          's_1',
          {
            judgeSessionId: 's_1',
            label: 'A',
            groupIndex: null,
            connected: true,
            queueSize: 0,
            lastSeenAt: null,
          },
        ],
        [
          's_2',
          {
            judgeSessionId: 's_2',
            label: 'B',
            groupIndex: null,
            connected: false,
            queueSize: 0,
            lastSeenAt: null,
          },
        ],
      ]) as any,
    );
  }

  describe('broadcastMatchupCompleted', () => {
    it('emits to admin + public + every per-judge room', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi
        .fn()
        .mockImplementation(() => ({ to: toSpy, emit: emitSpy }));
      gateway.server = { to: toSpy } as any;
      seedTwoJudges(gateway);

      gateway.broadcastMatchupCompleted('comp_1', {
        competitionId: 'comp_1',
        matchupId: 'm_1',
        roundNumber: 1,
        bracketPosition: 0,
        winnerCompetitorId: 'c_a',
        tally: { player1: 2, player2: 1, tie: 0, total: 3 },
        advancedFromTie: false,
        organizerDecisionReason: null,
        completedAt: '2026-05-05T15:00:00.000Z',
      });

      const targetedRooms = toSpy.mock.calls.map((c) => c[0]);
      expect(targetedRooms).toContain('competition:comp_1:admin');
      expect(targetedRooms).toContain('competition:comp_1:public');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_1');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_2');
      expect(emitSpy).toHaveBeenCalledWith(
        'matchup.completed',
        expect.objectContaining({ winnerCompetitorId: 'c_a' }),
      );
    });
  });

  describe('broadcastMatchupRevoteRequired', () => {
    it('emits to admin + judges but NOT public', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi
        .fn()
        .mockImplementation(() => ({ to: toSpy, emit: emitSpy }));
      gateway.server = { to: toSpy } as any;
      seedTwoJudges(gateway);

      gateway.broadcastMatchupRevoteRequired('comp_1', {
        competitionId: 'comp_1',
        matchupId: 'm_1',
        revoteCount: 1,
        tally: { player1: 1, player2: 1, tie: 1, total: 3 },
        detectedAt: '2026-05-05T15:00:00.000Z',
      });

      const targetedRooms = toSpy.mock.calls.map((c) => c[0]);
      expect(targetedRooms).toContain('competition:comp_1:admin');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_1');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_2');
      expect(targetedRooms).not.toContain('competition:comp_1:public');
      expect(emitSpy).toHaveBeenCalledWith(
        'matchup.revote-required',
        expect.objectContaining({ revoteCount: 1 }),
      );
    });
  });

  describe('broadcastMatchupTieResolutionRequired', () => {
    it('emits to admin room ONLY (not public, not judges)', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi.fn().mockReturnValue({ emit: emitSpy });
      gateway.server = { to: toSpy } as any;
      seedTwoJudges(gateway);

      gateway.broadcastMatchupTieResolutionRequired('comp_1', {
        competitionId: 'comp_1',
        matchupId: 'm_1',
        tally: { player1: 1, player2: 1, tie: 1, total: 3 },
        detectedAt: '2026-05-05T15:00:00.000Z',
      });

      const targetedRooms = toSpy.mock.calls.map((c) => c[0]);
      expect(targetedRooms).toEqual(['competition:comp_1:admin']);
      expect(targetedRooms).not.toContain('competition:comp_1:public');
      expect(targetedRooms).not.toContain('competition:comp_1:judge:s_1');
      expect(emitSpy).toHaveBeenCalledWith(
        'matchup.tie-resolution-required',
        expect.objectContaining({ matchupId: 'm_1' }),
      );
    });
  });

  describe('broadcastBracketAdvanced', () => {
    it('emits to admin + public + every per-judge room', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi
        .fn()
        .mockImplementation(() => ({ to: toSpy, emit: emitSpy }));
      gateway.server = { to: toSpy } as any;
      seedTwoJudges(gateway);

      gateway.broadcastBracketAdvanced('comp_1', {
        competitionId: 'comp_1',
        roundNumber: 2,
        matchups: [],
        advancedAt: '2026-05-05T15:00:00.000Z',
      });

      const targetedRooms = toSpy.mock.calls.map((c) => c[0]);
      expect(targetedRooms).toContain('competition:comp_1:admin');
      expect(targetedRooms).toContain('competition:comp_1:public');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_1');
      expect(emitSpy).toHaveBeenCalledWith(
        'bracket.advanced',
        expect.objectContaining({ roundNumber: 2 }),
      );
    });
  });

  describe('broadcastCompetitionCompleted', () => {
    it('emits to admin + public + every per-judge room', () => {
      const gateway = makeGateway();
      const emitSpy = vi.fn();
      const toSpy = vi
        .fn()
        .mockImplementation(() => ({ to: toSpy, emit: emitSpy }));
      gateway.server = { to: toSpy } as any;
      seedTwoJudges(gateway);

      gateway.broadcastCompetitionCompleted('comp_1', {
        competitionId: 'comp_1',
        championCompetitorId: 'champ',
        completedAt: '2026-05-05T15:00:00.000Z',
      });

      const targetedRooms = toSpy.mock.calls.map((c) => c[0]);
      expect(targetedRooms).toContain('competition:comp_1:admin');
      expect(targetedRooms).toContain('competition:comp_1:public');
      expect(targetedRooms).toContain('competition:comp_1:judge:s_1');
      expect(emitSpy).toHaveBeenCalledWith(
        'competition.completed',
        expect.objectContaining({ championCompetitorId: 'champ' }),
      );
    });
  });

  // ─── getJudgePresence + clearPresence ────────────────────────────────────────

  describe('getJudgePresence', () => {
    it('returns empty array when no presence data exists', () => {
      const gateway = makeGateway();
      expect(gateway.getJudgePresence('no-such-comp')).toEqual([]);
    });

    it('returns all presence entries for a competition', () => {
      const gateway = makeGateway();
      const entries = new Map([
        [
          's_1',
          {
            judgeSessionId: 's_1',
            label: 'A',
            groupIndex: 0,
            connected: true,
            queueSize: 0,
            lastSeenAt: null,
          },
        ],
        [
          's_2',
          {
            judgeSessionId: 's_2',
            label: 'B',
            groupIndex: 1,
            connected: false,
            queueSize: 1,
            lastSeenAt: null,
          },
        ],
      ]);
      gateway['judgePresence'].set('comp_1', entries);

      const result = gateway.getJudgePresence('comp_1');
      expect(result).toHaveLength(2);
    });
  });

  describe('clearPresence', () => {
    it('removes the competition from the presence map', () => {
      const gateway = makeGateway();
      gateway['judgePresence'].set('comp_1', new Map());
      gateway.clearPresence('comp_1');
      expect(gateway['judgePresence'].has('comp_1')).toBe(false);
    });
  });
});
