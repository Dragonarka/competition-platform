import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PublicBracketData } from '@competition-platform/shared';

const {
  getBracketUseQueryMock,
  getBracketInvalidateMock,
  usePublicSocketMock,
  socketCallbacks,
  mockConnectionStatus,
} = vi.hoisted(() => {
  const callbacks: {
    onPhaseTransitioned?: () => void;
    onMatchupCompleted?: () => void;
    onBracketAdvanced?: () => void;
    onCompetitionCompleted?: () => void;
  } = {};
  const status = { current: 'connected' as string };
  return {
    getBracketUseQueryMock: vi.fn(),
    getBracketInvalidateMock: vi.fn(),
    usePublicSocketMock: vi.fn(),
    socketCallbacks: callbacks,
    mockConnectionStatus: status,
  };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      getPublicBracket: { useQuery: getBracketUseQueryMock },
    },
    useUtils: () => ({
      tournament: {
        getPublicBracket: {
          invalidate: getBracketInvalidateMock,
        },
      },
    }),
  },
}));

vi.mock('@/hooks/use-public-socket', () => ({
  usePublicSocket: (opts: typeof socketCallbacks & { competitionId: string }) => {
    usePublicSocketMock(opts);
    socketCallbacks.onPhaseTransitioned = opts.onPhaseTransitioned;
    socketCallbacks.onMatchupCompleted = opts.onMatchupCompleted;
    socketCallbacks.onBracketAdvanced = opts.onBracketAdvanced;
    socketCallbacks.onCompetitionCompleted = opts.onCompetitionCompleted;
    return { connectionStatus: mockConnectionStatus.current };
  },
}));

import { BracketClientIsland } from './bracket-client-island';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

const INITIAL_BRACKET: PublicBracketData = {
  matchups: [
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
      competitorA: { name: 'Alpha', participantId: 'P-001' },
      competitorB: { name: 'Bravo', participantId: 'P-002' },
    },
  ],
  championCompetitorId: null,
  currentRoundNumber: 1,
};

async function render(initialBracket: PublicBracketData = INITIAL_BRACKET): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(BracketClientIsland, {
        competitionId: 'comp_1',
        initialBracket,
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

describe('BracketClientIsland', () => {
  beforeEach(() => {
    getBracketUseQueryMock.mockReset();
    getBracketInvalidateMock.mockReset();
    usePublicSocketMock.mockReset();
    mockConnectionStatus.current = 'connected';
    Object.keys(socketCallbacks).forEach(
      (k) => delete (socketCallbacks as Record<string, unknown>)[k],
    );
    getBracketUseQueryMock.mockImplementation((_input, opts) => ({
      data: opts?.initialData ?? {
        matchups: [],
        championCompetitorId: null,
        currentRoundNumber: null,
      },
    }));
  });

  it('renders the SSR-provided bracket on first render with no fetch needed', async () => {
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Bravo');
    expect(getBracketUseQueryMock).toHaveBeenCalled();
    const call = getBracketUseQueryMock.mock.calls[0];
    expect(call[1]?.initialData).toEqual(INITIAL_BRACKET);
    unmount();
  });

  it('phase.transitioned invalidates getPublicBracket', async () => {
    const { unmount } = await render();
    await act(async () => {
      socketCallbacks.onPhaseTransitioned?.();
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    unmount();
  });

  it('matchup.completed invalidates getPublicBracket', async () => {
    const { unmount } = await render();
    await act(async () => {
      socketCallbacks.onMatchupCompleted?.();
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    unmount();
  });

  it('bracket.advanced invalidates getPublicBracket', async () => {
    const { unmount } = await render();
    await act(async () => {
      socketCallbacks.onBracketAdvanced?.();
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    unmount();
  });

  it('competition.completed invalidates getPublicBracket', async () => {
    const { unmount } = await render();
    await act(async () => {
      socketCallbacks.onCompetitionCompleted?.();
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'comp_1' });
    unmount();
  });

  it('renders connection-status label from usePublicSocket', async () => {
    const { container, unmount } = await render();
    const label = container.querySelector('[data-testid="connection-status-label"]');
    expect(label?.textContent).toBe('Live');
    const wrapper = container.querySelector('[data-testid="bracket-stale-wrapper"]');
    expect(wrapper?.getAttribute('data-stale')).toBe('false');
    unmount();
  });

  it('shows stale wrapper with opacity-60 when disconnected', async () => {
    mockConnectionStatus.current = 'disconnected';
    const { container, unmount } = await render();
    const wrapper = container.querySelector('[data-testid="bracket-stale-wrapper"]');
    expect(wrapper?.getAttribute('data-stale')).toBe('true');
    expect(wrapper?.className).toContain('opacity-60');
    const label = container.querySelector('[data-testid="connection-status-label"]');
    expect(label?.textContent).toBe('Offline');
    unmount();
  });

  it('shows reconnecting status with stale wrapper', async () => {
    mockConnectionStatus.current = 'reconnecting';
    const { container, unmount } = await render();
    const wrapper = container.querySelector('[data-testid="bracket-stale-wrapper"]');
    expect(wrapper?.getAttribute('data-stale')).toBe('true');
    expect(wrapper?.className).toContain('opacity-60');
    const label = container.querySelector('[data-testid="connection-status-label"]');
    expect(label?.textContent).toBe('Reconnecting…');
    unmount();
  });
});
