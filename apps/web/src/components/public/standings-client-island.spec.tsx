import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { StandingsEntry } from '@competition-platform/shared';
import type { NextMatchupHint } from './standings-table';

// Hoisted mocks must be declared before the imports that depend on them.
const {
  getStandingsUseQueryMock,
  getNextUseQueryMock,
  getStandingsSetDataMock,
  getStandingsInvalidateMock,
  getNextInvalidateMock,
  usePublicSocketMock,
  socketCallbacks,
  mockConnectionStatus,
} = vi.hoisted(() => {
  const callbacks: {
    onStandingsUpdated?: (s: StandingsEntry[]) => void;
    onPhaseTransitioned?: () => void;
    onMatchupCompleted?: () => void;
    onBracketAdvanced?: () => void;
    onCompetitionCompleted?: () => void;
  } = {};
  const status = { current: 'connected' as string };
  return {
    getStandingsUseQueryMock: vi.fn(),
    getNextUseQueryMock: vi.fn(),
    getStandingsSetDataMock: vi.fn(),
    getStandingsInvalidateMock: vi.fn(),
    getNextInvalidateMock: vi.fn(),
    usePublicSocketMock: vi.fn(),
    socketCallbacks: callbacks,
    mockConnectionStatus: status,
  };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      getStandings: { useQuery: getStandingsUseQueryMock },
      getPublicNextMatchups: { useQuery: getNextUseQueryMock },
    },
    useUtils: () => ({
      tournament: {
        getStandings: {
          setData: getStandingsSetDataMock,
          invalidate: getStandingsInvalidateMock,
        },
        getPublicNextMatchups: {
          invalidate: getNextInvalidateMock,
        },
      },
    }),
  },
}));

vi.mock('@/hooks/use-public-socket', () => ({
  usePublicSocket: (opts: typeof socketCallbacks & { competitionId: string }) => {
    usePublicSocketMock(opts);
    socketCallbacks.onStandingsUpdated = opts.onStandingsUpdated;
    socketCallbacks.onPhaseTransitioned = opts.onPhaseTransitioned;
    socketCallbacks.onMatchupCompleted = opts.onMatchupCompleted;
    socketCallbacks.onBracketAdvanced = opts.onBracketAdvanced;
    socketCallbacks.onCompetitionCompleted = opts.onCompetitionCompleted;
    return { connectionStatus: mockConnectionStatus.current };
  },
}));

import { StandingsClientIsland } from './standings-client-island';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(
  initialStandings: StandingsEntry[],
  initialNext: NextMatchupHint[],
): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(StandingsClientIsland, {
        competitionId: 'comp_1',
        initialStandings,
        initialNext,
      }),
    );
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const INITIAL_STANDINGS: StandingsEntry[] = [
  {
    rank: 1,
    competitorId: 'c_a',
    competitorName: 'Alpha',
    participantId: 'P-001',
    totalScore: '20.00',
    scoresByJudge: { js_1: '20.00' },
    judgeCount: 1,
  },
];

const INITIAL_NEXT: NextMatchupHint[] = [];

describe('StandingsClientIsland', () => {
  beforeEach(() => {
    getStandingsUseQueryMock.mockReset();
    getNextUseQueryMock.mockReset();
    getStandingsSetDataMock.mockReset();
    getStandingsInvalidateMock.mockReset();
    getNextInvalidateMock.mockReset();
    usePublicSocketMock.mockReset();
    mockConnectionStatus.current = 'connected';
    Object.keys(socketCallbacks).forEach(
      (k) => delete (socketCallbacks as Record<string, unknown>)[k],
    );
    // Default: mocks reflect initialData prop being honored.
    getStandingsUseQueryMock.mockImplementation((_input, opts) => ({
      data: opts?.initialData ?? [],
    }));
    getNextUseQueryMock.mockImplementation((_input, opts) => ({
      data: opts?.initialData ?? [],
    }));
  });

  it('renders the SSR-provided standings on first render with no fetch needed', async () => {
    const { container, unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('20.00');
    // Verify useQuery was called with initialData (no separate setData seed needed).
    expect(getStandingsUseQueryMock).toHaveBeenCalled();
    const call = getStandingsUseQueryMock.mock.calls[0];
    expect(call[1]?.initialData).toEqual(INITIAL_STANDINGS);
    unmount();
  });

  it('writes through standings.updated socket event into TanStack cache (no refetch)', async () => {
    const { unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    const newStandings: StandingsEntry[] = [{ ...INITIAL_STANDINGS[0], totalScore: '25.00' }];
    await act(async () => {
      socketCallbacks.onStandingsUpdated?.(newStandings);
    });
    expect(getStandingsSetDataMock).toHaveBeenCalledWith({ competitionId: 'comp_1' }, newStandings);
    // Standings invalidate must NOT fire on standings.updated — that would
    // defeat the writethrough optimization.
    expect(getStandingsInvalidateMock).not.toHaveBeenCalled();
    unmount();
  });

  it('matchup.completed invalidates getPublicNextMatchups only, not getStandings', async () => {
    const { unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    await act(async () => {
      socketCallbacks.onMatchupCompleted?.();
    });
    expect(getNextInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    expect(getStandingsInvalidateMock).not.toHaveBeenCalled();
    expect(getStandingsSetDataMock).not.toHaveBeenCalled();
    unmount();
  });

  it('bracket.advanced and competition.completed both invalidate next-matchups only', async () => {
    const { unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    await act(async () => {
      socketCallbacks.onBracketAdvanced?.();
      socketCallbacks.onCompetitionCompleted?.();
    });
    expect(getNextInvalidateMock).toHaveBeenCalledTimes(2);
    expect(getStandingsInvalidateMock).not.toHaveBeenCalled();
    unmount();
  });

  it('phase.transitioned invalidates BOTH standings and next-matchups', async () => {
    const { unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    await act(async () => {
      socketCallbacks.onPhaseTransitioned?.();
    });
    expect(getStandingsInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    expect(getNextInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    unmount();
  });

  it('renders connection-status label from usePublicSocket', async () => {
    const { container, unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    const label = container.querySelector('[data-testid="connection-status-label"]');
    expect(label?.textContent).toBe('Live');
    // Connected → wrapper opacity full.
    const wrapper = container.querySelector('[data-testid="standings-stale-wrapper"]');
    expect(wrapper?.getAttribute('data-stale')).toBe('false');
    unmount();
  });

  it('shows stale wrapper with opacity-60 when disconnected (AC #7)', async () => {
    mockConnectionStatus.current = 'disconnected';
    const { container, unmount } = await render(INITIAL_STANDINGS, INITIAL_NEXT);
    const wrapper = container.querySelector('[data-testid="standings-stale-wrapper"]');
    expect(wrapper?.getAttribute('data-stale')).toBe('true');
    expect(wrapper?.className).toContain('opacity-60');
    const label = container.querySelector('[data-testid="connection-status-label"]');
    expect(label?.textContent).toBe('Offline');
    unmount();
  });
});
