import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// ─── Fake socket ─────────────────────────────────────────────────────────────

type Listener = (...args: unknown[]) => void;

function makeFakeSocket() {
  const listeners = new Map<string, Listener[]>();
  const emitted: Array<{ event: string; args: unknown[] }> = [];

  const socket = {
    connected: true,
    on: vi.fn((event: string, cb: Listener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    }),
    off: vi.fn((event: string, cb: Listener) => {
      const existing = listeners.get(event) ?? [];
      listeners.set(
        event,
        existing.filter((l) => l !== cb),
      );
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emitted.push({ event, args });
    }),
    disconnect: vi.fn(),
    // Helper for tests to simulate incoming events
    _trigger: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
    _emitted: emitted,
  };

  return socket;
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

let fakeSocket: ReturnType<typeof makeFakeSocket>;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useAdminSocket } from './use-admin-socket';
import type {
  BracketGeneratedPayload,
  JudgeLiveStatus,
  VoteSubmittedPayload,
} from '@competition-platform/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface HookOptions {
  competitionId?: string;
  clerkToken?: string | null;
  onScoreSubmitted?: ReturnType<typeof vi.fn>;
  onStandingsUpdated?: ReturnType<typeof vi.fn>;
  onJudgeStatusChanged?: ReturnType<typeof vi.fn>;
  onPhaseTransitioned?: ReturnType<typeof vi.fn>;
  onBracketGenerated?: ReturnType<typeof vi.fn>;
  onVoteSubmitted?: ReturnType<typeof vi.fn>;
  onMatchupCompleted?: ReturnType<typeof vi.fn>;
  onMatchupRevoteRequired?: ReturnType<typeof vi.fn>;
  onMatchupTieResolutionRequired?: ReturnType<typeof vi.fn>;
  onBracketAdvanced?: ReturnType<typeof vi.fn>;
  onCompetitionCompleted?: ReturnType<typeof vi.fn>;
  onStatusChange?: ReturnType<typeof vi.fn>;
  onError?: ReturnType<typeof vi.fn>;
}

function buildHook(options: HookOptions = {}) {
  const {
    competitionId = 'comp_1',
    clerkToken = 'test-token',
    onScoreSubmitted = vi.fn(),
    onStandingsUpdated = vi.fn(),
    onJudgeStatusChanged = vi.fn(),
    onPhaseTransitioned = vi.fn(),
    onBracketGenerated = vi.fn(),
    onVoteSubmitted = vi.fn(),
    onMatchupCompleted = vi.fn(),
    onMatchupRevoteRequired = vi.fn(),
    onMatchupTieResolutionRequired = vi.fn(),
    onBracketAdvanced = vi.fn(),
    onCompetitionCompleted = vi.fn(),
    onStatusChange = vi.fn(),
    onError = vi.fn(),
  } = options;

  const container = document.createElement('div');
  document.body.appendChild(container);

  const optsRef = {
    current: {
      competitionId,
      clerkToken,
      onScoreSubmitted,
      onStandingsUpdated,
      onJudgeStatusChanged,
      onPhaseTransitioned,
      onBracketGenerated,
      onVoteSubmitted,
      onMatchupCompleted,
      onMatchupRevoteRequired,
      onMatchupTieResolutionRequired,
      onBracketAdvanced,
      onCompetitionCompleted,
      onStatusChange,
      onError,
    },
  };

  const HookWrapper: FC = () => {
    useAdminSocket(optsRef.current);
    return null;
  };

  const root = createRoot(container);

  return {
    opts: optsRef.current,
    async mount() {
      await act(async () => {
        root.render(createElement(HookWrapper, null));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAdminSocket', () => {
  beforeEach(() => {
    fakeSocket = makeFakeSocket();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits join.admin on connect with the supplied competitionId', async () => {
    const hook = buildHook({ competitionId: 'comp_1', clerkToken: 'tok-abc' });
    await hook.mount();

    // Simulate the socket connect event
    await act(async () => {
      fakeSocket._trigger('connect');
    });

    const joinCall = fakeSocket._emitted.find((e) => e.event === 'join.admin');
    expect(joinCall).toBeDefined();
    expect(joinCall?.args[0]).toEqual({ competitionId: 'comp_1' });

    hook.unmount();
  });

  it('does not connect when clerkToken is null', async () => {
    const { io } = await import('socket.io-client');
    const hook = buildHook({ clerkToken: null });
    await hook.mount();

    expect(io).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('calls onJudgeStatusChanged when judge.status-changed fires', async () => {
    const onJudgeStatusChanged = vi.fn();
    const hook = buildHook({ onJudgeStatusChanged });
    await hook.mount();

    const status: JudgeLiveStatus = {
      judgeSessionId: 's_1',
      label: 'Judge A',
      groupIndex: 0,
      connected: false,
      queueSize: 2,
      lastSeenAt: '2026-04-27T10:00:00.000Z',
    };

    await act(async () => {
      fakeSocket._trigger('judge.status-changed', status);
    });

    expect(onJudgeStatusChanged).toHaveBeenCalledWith(status);

    hook.unmount();
  });

  it('calls onStatusChange(disconnected) when the socket disconnects', async () => {
    const onStatusChange = vi.fn();
    const hook = buildHook({ onStatusChange });
    await hook.mount();

    await act(async () => {
      fakeSocket._trigger('disconnect');
    });

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');

    hook.unmount();
  });

  it('disconnects the socket on unmount', async () => {
    const hook = buildHook();
    await hook.mount();
    hook.unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalledOnce();
  });

  // H1 fix: server emits `error` event when admin join is rejected
  it('calls onError when the server emits an error event', async () => {
    const onError = vi.fn();
    const hook = buildHook({ onError });
    await hook.mount();

    await act(async () => {
      fakeSocket._trigger('error', { code: 'NOT_FOUND', message: 'Competition not found' });
    });

    expect(onError).toHaveBeenCalledWith({
      code: 'NOT_FOUND',
      message: 'Competition not found',
    });

    hook.unmount();
  });

  // Story 5.2: vote.submitted forwards to onVoteSubmitted callback
  it('calls onVoteSubmitted when vote.submitted fires', async () => {
    const onVoteSubmitted = vi.fn();
    const hook = buildHook({ onVoteSubmitted });
    await hook.mount();

    const payload: VoteSubmittedPayload = {
      competitionId: 'comp_1',
      matchupId: 'm-1',
      judgeSessionId: 'js-1',
      vote: 'tie',
      idempotencyKey: 'k-1',
      submittedAt: '2026-05-04T15:00:00.000Z',
    };

    await act(async () => {
      fakeSocket._trigger('vote.submitted', payload);
    });

    expect(onVoteSubmitted).toHaveBeenCalledWith(payload);

    hook.unmount();
  });

  // Story 5.1: bracket.generated forwards to onBracketGenerated callback
  it('calls onBracketGenerated when bracket.generated fires', async () => {
    const onBracketGenerated = vi.fn();
    const hook = buildHook({ onBracketGenerated });
    await hook.mount();

    const payload: BracketGeneratedPayload = {
      competitionId: 'comp_1',
      bracketSize: 8,
      qualifierCount: 5,
      seeds: [
        { competitorId: 'c1', seed: 1 },
        { competitorId: 'c2', seed: 2 },
        { competitorId: 'c3', seed: 3 },
        { competitorId: 'c4', seed: 4 },
        { competitorId: 'c5', seed: 5 },
      ],
      matchups: [],
      generatedAt: '2026-05-04T15:00:00.000Z',
    };

    await act(async () => {
      fakeSocket._trigger('bracket.generated', payload);
    });

    expect(onBracketGenerated).toHaveBeenCalledWith(payload);

    hook.unmount();
  });

  it('forwards matchup.completed to onMatchupCompleted (Story 5.3)', async () => {
    const onMatchupCompleted = vi.fn();
    const hook = buildHook({ onMatchupCompleted });
    await hook.mount();
    const payload = {
      competitionId: 'comp_1',
      matchupId: 'm_1',
      roundNumber: 1,
      bracketPosition: 0,
      winnerCompetitorId: 'c_a',
      tally: { player1: 2, player2: 1, tie: 0, total: 3 },
      advancedFromTie: false,
      organizerDecisionReason: null,
      completedAt: '2026-05-05T15:00:00.000Z',
    };
    await act(async () => {
      fakeSocket._trigger('matchup.completed', payload);
    });
    expect(onMatchupCompleted).toHaveBeenCalledWith(payload);
    hook.unmount();
  });

  it('forwards matchup.revote-required to onMatchupRevoteRequired (Story 5.3)', async () => {
    const onMatchupRevoteRequired = vi.fn();
    const hook = buildHook({ onMatchupRevoteRequired });
    await hook.mount();
    const payload = {
      competitionId: 'comp_1',
      matchupId: 'm_1',
      revoteCount: 1,
      tally: { player1: 1, player2: 1, tie: 1, total: 3 },
      detectedAt: '2026-05-05T15:00:00.000Z',
    };
    await act(async () => {
      fakeSocket._trigger('matchup.revote-required', payload);
    });
    expect(onMatchupRevoteRequired).toHaveBeenCalledWith(payload);
    hook.unmount();
  });

  it('forwards matchup.tie-resolution-required to onMatchupTieResolutionRequired (Story 5.3)', async () => {
    const onMatchupTieResolutionRequired = vi.fn();
    const hook = buildHook({ onMatchupTieResolutionRequired });
    await hook.mount();
    const payload = {
      competitionId: 'comp_1',
      matchupId: 'm_1',
      tally: { player1: 1, player2: 1, tie: 1, total: 3 },
      detectedAt: '2026-05-05T15:00:00.000Z',
    };
    await act(async () => {
      fakeSocket._trigger('matchup.tie-resolution-required', payload);
    });
    expect(onMatchupTieResolutionRequired).toHaveBeenCalledWith(payload);
    hook.unmount();
  });

  it('forwards bracket.advanced to onBracketAdvanced (Story 5.3)', async () => {
    const onBracketAdvanced = vi.fn();
    const hook = buildHook({ onBracketAdvanced });
    await hook.mount();
    const payload = {
      competitionId: 'comp_1',
      roundNumber: 2,
      matchups: [],
      advancedAt: '2026-05-05T15:00:00.000Z',
    };
    await act(async () => {
      fakeSocket._trigger('bracket.advanced', payload);
    });
    expect(onBracketAdvanced).toHaveBeenCalledWith(payload);
    hook.unmount();
  });

  it('forwards competition.completed to onCompetitionCompleted (Story 5.3)', async () => {
    const onCompetitionCompleted = vi.fn();
    const hook = buildHook({ onCompetitionCompleted });
    await hook.mount();
    const payload = {
      competitionId: 'comp_1',
      championCompetitorId: 'champ',
      completedAt: '2026-05-05T15:00:00.000Z',
    };
    await act(async () => {
      fakeSocket._trigger('competition.completed', payload);
    });
    expect(onCompetitionCompleted).toHaveBeenCalledWith(payload);
    hook.unmount();
  });
});
