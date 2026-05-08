import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const {
  getCompetitionUseQueryMock,
  getDashboardSnapshotUseQueryMock,
  getBracketUseQueryMock,
  getCompetitionInvalidateMock,
  getDashboardSnapshotInvalidateMock,
  getDashboardSnapshotSetDataMock,
  getBracketInvalidateMock,
  useAdminSocketMock,
  adminSocketCallbacks,
  mockAuth,
  mockParams,
} = vi.hoisted(() => {
  const callbacks: Record<string, ((...args: unknown[]) => void) | undefined> = {};
  return {
    getCompetitionUseQueryMock: vi.fn(),
    getDashboardSnapshotUseQueryMock: vi.fn(),
    getBracketUseQueryMock: vi.fn(),
    getCompetitionInvalidateMock: vi.fn(),
    getDashboardSnapshotInvalidateMock: vi.fn(),
    getDashboardSnapshotSetDataMock: vi.fn(),
    getBracketInvalidateMock: vi.fn(),
    useAdminSocketMock: vi.fn(),
    adminSocketCallbacks: callbacks,
    mockAuth: {
      isLoaded: true,
      isSignedIn: true,
      getToken: vi.fn(() => Promise.resolve('test-token')),
    },
    mockParams: { competitionId: 'test-comp-id' },
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      getCompetition: { useQuery: getCompetitionUseQueryMock },
      getDashboardSnapshot: { useQuery: getDashboardSnapshotUseQueryMock },
      getBracket: { useQuery: getBracketUseQueryMock },
    },
    useUtils: () => ({
      tournament: {
        getCompetition: { invalidate: getCompetitionInvalidateMock },
        getDashboardSnapshot: {
          invalidate: getDashboardSnapshotInvalidateMock,
          setData: getDashboardSnapshotSetDataMock,
        },
        getBracket: { invalidate: getBracketInvalidateMock },
      },
    }),
  },
}));

vi.mock('@/hooks/use-admin-socket', () => ({
  useAdminSocket: (opts: Record<string, unknown>) => {
    useAdminSocketMock(opts);
    for (const key of Object.keys(opts)) {
      if (key.startsWith('on') && typeof opts[key] === 'function') {
        adminSocketCallbacks[key] = opts[key] as (...args: unknown[]) => void;
      }
    }
  },
}));

vi.mock('@/components/presenter/presenter-view', () => ({
  PresenterView: (props: { competitionName: string }) =>
    createElement('div', { 'data-testid': 'presenter-view-mock' }, props.competitionName),
}));

import PresenterPage from './page';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

const MOCK_COMPETITION = {
  id: 'test-comp-id',
  name: 'Battle Royale',
  status: 'active',
  cypherCompletedAt: null,
  soloMode: false,
  participantFormat: 'individual',
  cypherJudgeCount: 3,
  cypherGroupCount: 1,
  advancementThreshold: 8,
  battlesJudgeCount: 3,
  tieBreakingRule: 're-vote',
};

const MOCK_SNAPSHOT = {
  competitionId: 'test-comp-id',
  competitionName: 'Battle Royale',
  status: 'active',
  soloMode: false,
  currentPhase: 'cypher' as const,
  judges: [],
  totalScoresSubmitted: 5,
  totalScoresExpected: 24,
  scoresByGroup: [],
  topStandings: [],
};

async function render(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(PresenterPage));
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

describe('PresenterPage', () => {
  beforeEach(() => {
    getCompetitionUseQueryMock.mockReset();
    getDashboardSnapshotUseQueryMock.mockReset();
    getBracketUseQueryMock.mockReset();
    getCompetitionInvalidateMock.mockReset();
    getDashboardSnapshotInvalidateMock.mockReset();
    getDashboardSnapshotSetDataMock.mockReset();
    getBracketInvalidateMock.mockReset();
    useAdminSocketMock.mockReset();
    Object.keys(adminSocketCallbacks).forEach((k) => delete adminSocketCallbacks[k]);
    mockAuth.isLoaded = true;
    mockAuth.isSignedIn = true;

    getCompetitionUseQueryMock.mockReturnValue({ data: MOCK_COMPETITION });
    getDashboardSnapshotUseQueryMock.mockReturnValue({ data: MOCK_SNAPSHOT });
    getBracketUseQueryMock.mockReturnValue({ data: undefined });
  });

  it('renders loading state when Clerk auth is not loaded', async () => {
    mockAuth.isLoaded = false;
    const { container, unmount } = await render();
    expect(container.querySelector('[data-testid="presenter-loading"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="presenter-view-mock"]')).toBeNull();
    unmount();
  });

  it('renders competition name when all queries resolve', async () => {
    const { container, unmount } = await render();
    const view = container.querySelector('[data-testid="presenter-view-mock"]');
    expect(view).not.toBeNull();
    expect(view?.textContent).toBe('Battle Royale');
    unmount();
  });

  it('renders connection badge with initial disconnected status', async () => {
    const { container, unmount } = await render();
    const badge = container.querySelector('[data-testid="presenter-connection-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Offline');
    const dot = badge?.querySelector('span.rounded-full');
    expect(dot?.className).toContain('bg-red-500');
    unmount();
  });

  it('applies opacity-60 wrapper when disconnected', async () => {
    const { container, unmount } = await render();
    const wrapper = container.querySelector('.opacity-60');
    expect(wrapper).not.toBeNull();
    unmount();
  });

  it('removes opacity-60 when connected', async () => {
    const { container, unmount } = await render();
    await act(async () => {
      adminSocketCallbacks['onStatusChange']?.('connected');
    });
    expect(container.querySelector('.opacity-60')).toBeNull();
    unmount();
  });

  it('phase.transitioned invalidates all three queries', async () => {
    const { unmount } = await render();
    await act(async () => {
      adminSocketCallbacks['onPhaseTransitioned']?.();
    });
    expect(getCompetitionInvalidateMock).toHaveBeenCalledWith({ competitionId: 'test-comp-id' });
    expect(getDashboardSnapshotInvalidateMock).toHaveBeenCalledWith({
      competitionId: 'test-comp-id',
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'test-comp-id' });
    unmount();
  });

  it('matchup.completed invalidates getBracket', async () => {
    const { unmount } = await render();
    await act(async () => {
      adminSocketCallbacks['onMatchupCompleted']?.();
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'test-comp-id' });
    unmount();
  });

  it('competition.completed invalidates all three queries', async () => {
    const { unmount } = await render();
    await act(async () => {
      adminSocketCallbacks['onCompetitionCompleted']?.();
    });
    expect(getBracketInvalidateMock).toHaveBeenCalledWith({ competitionId: 'test-comp-id' });
    expect(getCompetitionInvalidateMock).toHaveBeenCalledWith({ competitionId: 'test-comp-id' });
    expect(getDashboardSnapshotInvalidateMock).toHaveBeenCalledWith({
      competitionId: 'test-comp-id',
    });
    unmount();
  });

  it('score.submitted invalidates getDashboardSnapshot', async () => {
    const { unmount } = await render();
    await act(async () => {
      adminSocketCallbacks['onScoreSubmitted']?.();
    });
    expect(getDashboardSnapshotInvalidateMock).toHaveBeenCalledWith({
      competitionId: 'test-comp-id',
    });
    unmount();
  });

  it('standings.updated calls setData on getDashboardSnapshot', async () => {
    const { unmount } = await render();
    const mockStandings = [
      {
        competitorId: 'c1',
        competitorName: 'Alice',
        participantId: 'P-001',
        totalScore: '10.00',
        judgeCount: 1,
        rank: 1,
        scoresByJudge: {},
      },
    ];
    await act(async () => {
      adminSocketCallbacks['onStandingsUpdated']?.(mockStandings);
    });
    expect(getDashboardSnapshotSetDataMock).toHaveBeenCalled();
    unmount();
  });
});
