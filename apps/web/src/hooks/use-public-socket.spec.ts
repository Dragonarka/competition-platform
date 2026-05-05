import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

type Listener = (...args: unknown[]) => void;

function makeFakeSocket() {
  const listeners = new Map<string, Listener[]>();
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  return {
    connected: true,
    on: vi.fn((event: string, cb: Listener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emitted.push({ event, args });
    }),
    disconnect: vi.fn(),
    _trigger: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
    _emitted: emitted,
  };
}

let fakeSocket: ReturnType<typeof makeFakeSocket>;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

import { usePublicSocket } from './use-public-socket';

interface HookOptions {
  competitionId?: string;
  onStandingsUpdated?: ReturnType<typeof vi.fn>;
  onPhaseTransitioned?: ReturnType<typeof vi.fn>;
  onMatchupCompleted?: ReturnType<typeof vi.fn>;
  onBracketAdvanced?: ReturnType<typeof vi.fn>;
  onCompetitionCompleted?: ReturnType<typeof vi.fn>;
}

function buildHook(options: HookOptions = {}) {
  const {
    competitionId = 'comp_1',
    onStandingsUpdated = vi.fn(),
    onPhaseTransitioned = vi.fn(),
    onMatchupCompleted = vi.fn(),
    onBracketAdvanced = vi.fn(),
    onCompetitionCompleted = vi.fn(),
  } = options;

  const container = document.createElement('div');
  document.body.appendChild(container);

  const opts = {
    competitionId,
    onStandingsUpdated,
    onPhaseTransitioned,
    onMatchupCompleted,
    onBracketAdvanced,
    onCompetitionCompleted,
  };

  const HookWrapper: FC = () => {
    usePublicSocket(opts);
    return null;
  };
  const root = createRoot(container);
  return {
    opts,
    async mount() {
      await act(async () => {
        root.render(createElement(HookWrapper, null));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('usePublicSocket', () => {
  beforeEach(() => {
    fakeSocket = makeFakeSocket();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
