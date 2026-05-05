import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getCompetitionMock, getBracketMock, submitOrganizerVoteUseMutationMock, useUtilsMock } =
  vi.hoisted(() => ({
    getCompetitionMock: vi.fn(),
    getBracketMock: vi.fn(),
    submitOrganizerVoteUseMutationMock: vi.fn(),
    useUtilsMock: vi.fn(),
  }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: useUtilsMock,
    tournament: {
      getCompetition: { useQuery: getCompetitionMock },
      getBracket: { useQuery: getBracketMock },
      submitOrganizerVote: { useMutation: submitOrganizerVoteUseMutationMock },
    },
  },
}));

import { BattlesVotingPanel } from './battles-voting-panel';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(BattlesVotingPanel, { competitionId: 'comp_1' }));
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

describe('BattlesVotingPanel', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
    getBracketMock.mockReset();
    submitOrganizerVoteUseMutationMock.mockReset();
    useUtilsMock.mockReset();
    useUtilsMock.mockReturnValue({
      tournament: {
        getBracket: { invalidate: vi.fn() },
      },
    });
    submitOrganizerVoteUseMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true, idempotent: false }),
      isPending: false,
    });
  });

  it('renders nothing when soloMode is false', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_1',
        soloMode: false,
        cypherCompletedAt: '2026-05-04T15:00:00.000Z',
      },
    });
    getBracketMock.mockReturnValue({ data: undefined });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders nothing when cypherCompletedAt is null', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_1', soloMode: true, cypherCompletedAt: null },
    });
    getBracketMock.mockReturnValue({ data: undefined });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders one matchup card per open non-bye matchup', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_1',
        soloMode: true,
        cypherCompletedAt: '2026-05-04T15:00:00.000Z',
      },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm-1',
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
            id: 'm-bye',
            roundNumber: 1,
            bracketPosition: 1,
            competitorAId: 'c',
            competitorBId: null,
            seedA: 2,
            seedB: null,
            isBye: true,
            winnerCompetitorId: 'c',
            competitorA: { name: 'Carol', participantId: 'P-C' },
            competitorB: null,
          },
          {
            id: 'm-done',
            roundNumber: 1,
            bracketPosition: 2,
            competitorAId: 'd',
            competitorBId: 'e',
            seedA: 3,
            seedB: 6,
            isBye: false,
            winnerCompetitorId: 'd',
            competitorA: { name: 'Dan', participantId: 'P-D' },
            competitorB: { name: 'Eve', participantId: 'P-E' },
          },
        ],
      },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    // Bye and resolved matchups are filtered out.
    expect(container.textContent).not.toContain('Carol');
    expect(container.textContent).not.toContain('Eve');
    unmount();
  });

  it('shows empty-state message when there are no open matchups', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_1',
        soloMode: true,
        cypherCompletedAt: '2026-05-04T15:00:00.000Z',
      },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm-bye',
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
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('All matchups in this round');
    unmount();
  });

  it('calls submitOrganizerVote when a vote button is clicked', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ success: true, idempotent: false });
    submitOrganizerVoteUseMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'comp_1',
        soloMode: true,
        cypherCompletedAt: '2026-05-04T15:00:00.000Z',
      },
    });
    getBracketMock.mockReturnValue({
      data: {
        matchups: [
          {
            id: 'm-1',
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
        ],
      },
    });
    const { container, unmount } = await render();
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      /Vote Alice/.test(b.textContent ?? ''),
    );
    await act(async () => {
      button!.click();
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: 'comp_1',
        matchupId: 'm-1',
        vote: 'player1',
      }),
    );
    unmount();
  });
});
