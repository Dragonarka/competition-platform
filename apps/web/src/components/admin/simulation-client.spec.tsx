import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getCompetitionMock, replaceMock, useAdminSocketMock } = vi.hoisted(() => ({
  getCompetitionMock: vi.fn(),
  replaceMock: vi.fn(),
  useAdminSocketMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tournament: {
        getCompetition: { invalidate: vi.fn() },
        getStandings: { invalidate: vi.fn() },
        getBracket: { invalidate: vi.fn() },
      },
    }),
    tournament: {
      getCompetition: { useQuery: getCompetitionMock },
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn(() => Promise.resolve('test-token')),
  }),
}));

vi.mock('@/hooks/use-admin-socket', () => ({
  useAdminSocket: useAdminSocketMock,
}));

// Stub all child panels to keep the test focused on the gating logic.
vi.mock('@/components/admin/start-cypher-phase-panel', () => ({
  StartCypherPhasePanel: () => createElement('div', { 'data-testid': 'start-cypher' }),
}));
vi.mock('@/components/admin/cypher-results-panel', () => ({
  CypherResultsPanel: () => createElement('div', { 'data-testid': 'cypher-results' }),
}));
vi.mock('@/components/admin/bracket-view-panel', () => ({
  BracketViewPanel: () => createElement('div', { 'data-testid': 'bracket-view' }),
}));
vi.mock('@/components/admin/tie-resolution-banner', () => ({
  TieResolutionBanner: () => createElement('div', { 'data-testid': 'tie-banner' }),
}));
vi.mock('@/components/admin/simulation-cypher-panel', () => ({
  SimulationCypherPanel: () => createElement('div', { 'data-testid': 'sim-cypher' }),
}));
vi.mock('@/components/admin/simulation-battles-panel', () => ({
  SimulationBattlesPanel: () => createElement('div', { 'data-testid': 'sim-battles' }),
}));
vi.mock('@/components/admin/simulation-reset-panel', () => ({
  SimulationResetPanel: () => createElement('div', { 'data-testid': 'sim-reset' }),
}));
vi.mock('@/components/admin/simulation-history-panel', () => ({
  SimulationHistoryPanel: () => createElement('div', { 'data-testid': 'sim-history' }),
}));

import { SimulationClient } from './simulation-client';

interface RenderResult {
  container: HTMLElement;
  unmount: () => void;
  root: Root;
}

async function render(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(SimulationClient, { competitionId: 'comp_sim' }));
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

describe('SimulationClient', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
    replaceMock.mockReset();
    useAdminSocketMock.mockReset();
  });

  it('redirects to /competitions/[id] when competition is not a simulation', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_sim', isSimulation: false, status: 'draft', cypherCompletedAt: null },
      isLoading: false,
    });
    const { unmount } = await render();
    expect(replaceMock).toHaveBeenCalledWith('/competitions/comp_sim');
    unmount();
  });

  it('renders StartCypherPhasePanel for draft simulations', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_sim',
        isSimulation: true,
        name: 'Test Sim',
        status: 'draft',
        cypherCompletedAt: null,
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    expect(container.querySelector('[data-testid="start-cypher"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sim-cypher"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="sim-reset"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sim-history"]')).toBeTruthy();
    unmount();
  });

  it('renders SimulationCypherPanel + CypherResultsPanel for active pre-cypher-completion', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_sim',
        isSimulation: true,
        name: 'Test Sim',
        status: 'active',
        cypherCompletedAt: null,
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    expect(container.querySelector('[data-testid="sim-cypher"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cypher-results"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sim-battles"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="sim-reset"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sim-history"]')).toBeTruthy();
    unmount();
  });

  it('renders SimulationBattlesPanel + BracketViewPanel after cypher complete', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_sim',
        isSimulation: true,
        name: 'Test Sim',
        status: 'active',
        cypherCompletedAt: '2026-05-08T12:00:00.000Z',
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    expect(container.querySelector('[data-testid="sim-battles"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="bracket-view"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sim-cypher"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="sim-reset"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sim-history"]')).toBeTruthy();
    unmount();
  });
});
