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

import { SimulationBattlesPanel } from './simulation-battles-panel';

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
    root.render(createElement(SimulationBattlesPanel, { competitionId: 'comp_sim' }));
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

const COMP_BATTLES_READY = {
  id: 'comp_sim',
  isSimulation: true,
  cypherCompletedAt: '2026-05-08T12:00:00.000Z',
  battlesJudgeCount: 3,
};

describe('SimulationBattlesPanel', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
    getBracketMock.mockReset();
    submitOrganizerVoteUseMutationMock.mockReset();
    useUtilsMock.mockReset();
    useUtilsMock.mockReturnValue({
      tournament: { getBracket: { invalidate: vi.fn() } },
    });
    submitOrganizerVoteUseMutationMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('renders nothing when not a simulation', async () => {
    getCompetitionMock.mockReturnValue({
      data: { ...COMP_BATTLES_READY, isSimulation: false },
    });
    getBracketMock.mockReturnValue({ data: undefined });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('judge dropdown shows battlesJudgeCount options', async () => {
    getCompetitionMock.mockReturnValue({ data: COMP_BATTLES_READY });
    getBracketMock.mockReturnValue({ data: { matchups: [] } });
    const { container, unmount } = await render();
    const select = container.querySelector('select[aria-label="Judge slot"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(3);
    expect(select.options[0]?.textContent).toBe('Judge 1');
    expect(select.options[2]?.textContent).toBe('Judge 3');
    unmount();
  });

  it('shows empty-state message when no open matchups', async () => {
    getCompetitionMock.mockReturnValue({ data: COMP_BATTLES_READY });
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

  it('passes simulatedJudgeIndex from selected dropdown when voting', async () => {
    const mutate = vi.fn();
    submitOrganizerVoteUseMutationMock.mockReturnValue({ mutate, isPending: false });
    getCompetitionMock.mockReturnValue({ data: COMP_BATTLES_READY });
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
    // Change judge dropdown to Judge 3 (index 2).
    const select = container.querySelector('select[aria-label="Judge slot"]') as HTMLSelectElement;
    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      /Vote Alice/.test(b.textContent ?? ''),
    );
    await act(async () => {
      button!.click();
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: 'comp_sim',
        matchupId: 'm-1',
        vote: 'player1',
        simulatedJudgeIndex: 2,
      }),
    );
    unmount();
  });

  it('shows error message when vote mutation fails', async () => {
    let onErrorCb: ((err: { message: string }) => void) | undefined;
    const mutate = vi.fn();
    submitOrganizerVoteUseMutationMock.mockImplementation(({ onError }) => {
      onErrorCb = onError;
      return { mutate, isPending: false };
    });
    getCompetitionMock.mockReturnValue({ data: COMP_BATTLES_READY });
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
    await act(async () => {
      onErrorCb?.({ message: 'Vote failed — try again' });
    });
    expect(container.textContent).toContain('Vote failed — try again');
    unmount();
  });

  it('persists voted indicator after switching judges and back', async () => {
    let onSuccessCb: (() => void) | undefined;
    const mutate = vi.fn();
    submitOrganizerVoteUseMutationMock.mockImplementation(({ onSuccess }) => {
      onSuccessCb = onSuccess;
      return { mutate, isPending: false };
    });
    getCompetitionMock.mockReturnValue({ data: COMP_BATTLES_READY });
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
    // Simulate successful vote as Judge 1 (index 0).
    await act(async () => {
      onSuccessCb?.();
    });
    expect(container.textContent).toContain('Vote recorded as Judge 1');
    // Switch to Judge 2, then back to Judge 1.
    const select = container.querySelector('select[aria-label="Judge slot"]') as HTMLSelectElement;
    await act(async () => {
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      select.value = '0';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Indicator must still show — parent state persisted through remounts.
    expect(container.textContent).toContain('Vote recorded as Judge 1');
    unmount();
  });
});
