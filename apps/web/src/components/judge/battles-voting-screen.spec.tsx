import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getBattlesAssignmentMock, submitVoteUseMutationMock, useUtilsMock } = vi.hoisted(() => ({
  getBattlesAssignmentMock: vi.fn(),
  submitVoteUseMutationMock: vi.fn(),
  useUtilsMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: useUtilsMock,
    tournament: {
      getBattlesAssignment: { useQuery: getBattlesAssignmentMock },
      submitVote: { useMutation: submitVoteUseMutationMock },
    },
  },
}));

import { BattlesVotingScreen } from './battles-voting-screen';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(enqueueVote = vi.fn()): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(BattlesVotingScreen, {
        token: 'tok-1',
        enqueueVote,
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

describe('BattlesVotingScreen', () => {
  beforeEach(() => {
    getBattlesAssignmentMock.mockReset();
    submitVoteUseMutationMock.mockReset();
    useUtilsMock.mockReset();
    useUtilsMock.mockReturnValue({
      tournament: {
        getBattlesAssignment: { invalidate: vi.fn() },
      },
    });
    submitVoteUseMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true, idempotent: false }),
      isPending: false,
    });
  });

  it('renders "Battles haven\'t started yet" when battles inactive', async () => {
    getBattlesAssignmentMock.mockReturnValue({
      data: {
        battlesActive: false,
        currentMatchup: null,
        judgeSessionId: 'js',
        label: 'J1',
        competitionId: 'c1',
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain("haven't started");
    unmount();
  });

  it('renders "Waiting for next matchup..." when battles active but no matchup remaining', async () => {
    getBattlesAssignmentMock.mockReturnValue({
      data: {
        battlesActive: true,
        currentMatchup: null,
        judgeSessionId: 'js',
        label: 'J1',
        competitionId: 'c1',
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Waiting for next matchup');
    unmount();
  });

  it('renders the JudgeVoteInput when a matchup is present', async () => {
    getBattlesAssignmentMock.mockReturnValue({
      data: {
        battlesActive: true,
        currentMatchup: {
          matchupId: 'm-1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorA: {
            id: 'a',
            name: 'Alice',
            participantId: 'P-A',
            seed: 1,
          },
          competitorB: {
            id: 'b',
            name: 'Bob',
            participantId: 'P-B',
            seed: 4,
          },
        },
        judgeSessionId: 'js',
        label: 'J1',
        competitionId: 'c1',
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Vote Alice');
    expect(container.textContent).toContain('Vote Bob');
    expect(container.textContent).toContain('Tie');
    unmount();
  });

  it('calls submitVote with the right payload when a vote button is clicked', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ success: true, idempotent: false });
    submitVoteUseMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    getBattlesAssignmentMock.mockReturnValue({
      data: {
        battlesActive: true,
        currentMatchup: {
          matchupId: 'm-1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorA: {
            id: 'a',
            name: 'Alice',
            participantId: 'P-A',
            seed: 1,
          },
          competitorB: {
            id: 'b',
            name: 'Bob',
            participantId: 'P-B',
            seed: 4,
          },
        },
        judgeSessionId: 'js',
        label: 'J1',
        competitionId: 'c1',
      },
      isLoading: false,
    });
    const { container, unmount } = await render();
    const tieButton = Array.from(container.querySelectorAll('button')).find((b) =>
      /^Tie$/.test(b.textContent ?? ''),
    );
    expect(tieButton).toBeDefined();
    await act(async () => {
      tieButton!.click();
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'tok-1',
        matchupId: 'm-1',
        vote: 'tie',
      }),
    );
    unmount();
  });

  it('falls back to the offline queue on a network error', async () => {
    const networkErr = Object.assign(new Error('offline'), {
      cause: { name: 'TypeError' },
    });
    const mutateAsync = vi.fn().mockRejectedValue(networkErr);
    submitVoteUseMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    getBattlesAssignmentMock.mockReturnValue({
      data: {
        battlesActive: true,
        currentMatchup: {
          matchupId: 'm-1',
          roundNumber: 1,
          bracketPosition: 0,
          competitorA: {
            id: 'a',
            name: 'Alice',
            participantId: 'P-A',
            seed: 1,
          },
          competitorB: {
            id: 'b',
            name: 'Bob',
            participantId: 'P-B',
            seed: 4,
          },
        },
        judgeSessionId: 'js',
        label: 'J1',
        competitionId: 'c1',
      },
      isLoading: false,
    });
    const enqueueVote = vi.fn();
    const { container, unmount } = await render(enqueueVote);
    const player1Button = Array.from(container.querySelectorAll('button')).find((b) =>
      /Vote Alice/.test(b.textContent ?? ''),
    );
    await act(async () => {
      player1Button!.click();
    });
    expect(enqueueVote).toHaveBeenCalledTimes(1);
    expect(enqueueVote.mock.calls[0]?.[0]).toMatchObject({
      kind: 'vote',
      matchupId: 'm-1',
      vote: 'player1',
    });
    unmount();
  });
});
