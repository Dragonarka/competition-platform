import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getCompetitionMock, getBracketMock } = vi.hoisted(() => ({
  getCompetitionMock: vi.fn(),
  getBracketMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      getCompetition: { useQuery: getCompetitionMock },
      getBracket: { useQuery: getBracketMock },
    },
  },
}));

import { BracketViewPanel } from './bracket-view-panel';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function renderPanel(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(BracketViewPanel, { competitionId: 'comp_1' }));
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('BracketViewPanel', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
    getBracketMock.mockReset();
  });

  it('renders nothing when cypherCompletedAt is null', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', cypherCompletedAt: null },
    });
    getBracketMock.mockReturnValue({ data: undefined, isLoading: false });

    const { container, unmount } = await renderPanel();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders matchups grouped by round when cypherCompletedAt is set and matchups exist', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_1',
        cypherCompletedAt: '2026-05-04T15:00:00.000Z',
      },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm1',
            roundNumber: 1,
            bracketPosition: 0,
            competitorAId: 'a',
            competitorBId: 'b',
            seedA: 1,
            seedB: 4,
            isBye: false,
            winnerCompetitorId: null,
            competitorA: { name: 'Alice', participantId: 'P-A' },
            competitorB: { name: 'Bob', participantId: 'P-B' },
          },
          {
            id: 'm2',
            roundNumber: 1,
            bracketPosition: 1,
            competitorAId: 'c',
            competitorBId: 'd',
            seedA: 2,
            seedB: 3,
            isBye: false,
            winnerCompetitorId: null,
            competitorA: { name: 'Carol', participantId: 'P-C' },
            competitorB: { name: 'Dan', participantId: 'P-D' },
          },
        ],
      },
      isLoading: false,
    });

    const { container, unmount } = await renderPanel();

    expect(container.textContent).toContain('Battles Bracket');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Carol');
    expect(container.textContent).toContain('Dan');
    // Round label for 4-bracket → 2 rounds total → round 1 is "Semifinals"
    expect(container.textContent).toContain('Semifinals');

    unmount();
  });

  it('renders BYE placeholder for null competitor slots', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', cypherCompletedAt: '2026-05-04T15:00:00.000Z' },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm1',
            roundNumber: 1,
            bracketPosition: 0,
            competitorAId: 'a',
            competitorBId: null,
            seedA: 1,
            seedB: null,
            isBye: true,
            winnerCompetitorId: 'a',
            competitorA: { name: 'Alice', participantId: 'P-A' },
            competitorB: null,
          },
        ],
      },
      isLoading: false,
    });

    const { container, unmount } = await renderPanel();
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('BYE');
    expect(container.textContent).toContain('Winner');

    unmount();
  });

  it('highlights winnerCompetitorId when populated', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', cypherCompletedAt: '2026-05-04T15:00:00.000Z' },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm1',
            roundNumber: 1,
            bracketPosition: 0,
            competitorAId: 'a',
            competitorBId: 'b',
            seedA: 1,
            seedB: 4,
            isBye: false,
            winnerCompetitorId: 'a',
            competitorA: { name: 'Alice', participantId: 'P-A' },
            competitorB: { name: 'Bob', participantId: 'P-B' },
          },
        ],
      },
      isLoading: false,
    });

    const { container, unmount } = await renderPanel();
    expect(container.textContent).toContain('✓ Winner');
    // Winner card should be styled with green border class (best-effort assertion).
    expect(container.innerHTML).toContain('border-green-500');

    unmount();
  });

  it('renders 🏆 champion banner when championCompetitorId is set (Story 5.3)', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', cypherCompletedAt: '2026-05-04T15:00:00.000Z' },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm1',
            roundNumber: 1,
            bracketPosition: 0,
            competitorAId: 'a',
            competitorBId: 'b',
            seedA: 1,
            seedB: 2,
            isBye: false,
            winnerCompetitorId: 'a',
            competitorA: { name: 'Alice', participantId: 'P-A' },
            competitorB: { name: 'Bob', participantId: 'P-B' },
          },
        ],
        championCompetitorId: 'a',
        currentRoundNumber: null,
      },
      isLoading: false,
    });

    const { container, unmount } = await renderPanel();
    expect(container.textContent).toContain('🏆 Champion');
    expect(container.textContent).toContain('Alice');
    unmount();
  });

  it('renders current round indicator when currentRoundNumber is set (Story 5.3)', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', cypherCompletedAt: '2026-05-04T15:00:00.000Z' },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm1',
            roundNumber: 2,
            bracketPosition: 0,
            competitorAId: 'a',
            competitorBId: 'b',
            seedA: 1,
            seedB: 2,
            isBye: false,
            winnerCompetitorId: null,
            competitorA: { name: 'Alice', participantId: 'P-A' },
            competitorB: { name: 'Bob', participantId: 'P-B' },
          },
        ],
        championCompetitorId: null,
        currentRoundNumber: 2,
      },
      isLoading: false,
    });

    const { container, unmount } = await renderPanel();
    expect(container.textContent).toContain('Current round');
    unmount();
  });

  it('shows the empty-bracket message when matchups list is empty after cypher completion', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', cypherCompletedAt: '2026-05-04T15:00:00.000Z' },
    });
    getBracketMock.mockReturnValue({
      data: { matchups: [] },
      isLoading: false,
    });

    const { container, unmount } = await renderPanel();
    expect(container.textContent).toContain('No bracket has been generated');
    unmount();
  });
});
