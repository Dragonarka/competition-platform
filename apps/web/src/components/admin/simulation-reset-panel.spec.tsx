import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getCompetitionMock, resetSimulationUseMutationMock, useUtilsMock } = vi.hoisted(() => ({
  getCompetitionMock: vi.fn(),
  resetSimulationUseMutationMock: vi.fn(),
  useUtilsMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: useUtilsMock,
    tournament: {
      getCompetition: { useQuery: getCompetitionMock },
      resetSimulation: { useMutation: resetSimulationUseMutationMock },
    },
  },
}));

import { SimulationResetPanel } from './simulation-reset-panel';

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
    root.render(createElement(SimulationResetPanel, { competitionId: 'comp_sim' }));
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

describe('SimulationResetPanel', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
    resetSimulationUseMutationMock.mockReset();
    useUtilsMock.mockReset();
    useUtilsMock.mockReturnValue({
      tournament: {
        getCompetition: { invalidate: vi.fn() },
        getStandings: { invalidate: vi.fn() },
        getBracket: { invalidate: vi.fn() },
        listScoresForOverride: { invalidate: vi.fn() },
        getDashboardSnapshot: { invalidate: vi.fn() },
        listSimulationResetEvents: { invalidate: vi.fn() },
      },
    });
    resetSimulationUseMutationMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('renders nothing when not a simulation', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_sim', isSimulation: false },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders the reset button when simulation', async () => {
    getCompetitionMock.mockReturnValue({
      data: { id: 'comp_sim', isSimulation: true },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Reset Simulation');
    unmount();
  });

  it('clicking Reset shows the confirm/cancel UI', async () => {
    getCompetitionMock.mockReturnValue({ data: { id: 'comp_sim', isSimulation: true } });
    const { container, unmount } = await render();
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset Simulation',
    );
    await act(async () => {
      resetBtn!.click();
    });
    expect(container.textContent).toContain('Confirm Reset');
    expect(container.textContent).toContain('Cancel');
    expect(container.textContent).toContain('This cannot be undone');
    unmount();
  });

  it('clicking Confirm calls the mutation with competitionId', async () => {
    const mutate = vi.fn();
    resetSimulationUseMutationMock.mockReturnValue({ mutate, isPending: false });
    getCompetitionMock.mockReturnValue({ data: { id: 'comp_sim', isSimulation: true } });
    const { container, unmount } = await render();
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset Simulation',
    );
    await act(async () => {
      resetBtn!.click();
    });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Confirm Reset',
    );
    await act(async () => {
      confirmBtn!.click();
    });
    expect(mutate).toHaveBeenCalledWith({ competitionId: 'comp_sim' });
    unmount();
  });

  it('Cancel reverts to the initial state without calling mutation', async () => {
    const mutate = vi.fn();
    resetSimulationUseMutationMock.mockReturnValue({ mutate, isPending: false });
    getCompetitionMock.mockReturnValue({ data: { id: 'comp_sim', isSimulation: true } });
    const { container, unmount } = await render();
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset Simulation',
    );
    await act(async () => {
      resetBtn!.click();
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    );
    await act(async () => {
      cancelBtn!.click();
    });
    expect(container.textContent).not.toContain('Confirm Reset');
    expect(mutate).not.toHaveBeenCalled();
    unmount();
  });

  it('shows summary on success', async () => {
    let onSuccessCb: ((data: unknown) => void) | undefined;
    const mutate = vi.fn();
    resetSimulationUseMutationMock.mockImplementation(({ onSuccess }) => {
      onSuccessCb = onSuccess;
      return { mutate, isPending: false };
    });
    getCompetitionMock.mockReturnValue({ data: { id: 'comp_sim', isSimulation: true } });
    const { container, unmount } = await render();
    await act(async () => {
      onSuccessCb?.({
        competitionId: 'comp_sim',
        resetAt: '2026-05-09T18:00:00.000Z',
        scoresDeleted: 7,
        votesDeleted: 3,
        matchupsDeleted: 2,
        groupAssignmentsDeleted: 4,
      });
    });
    expect(container.textContent).toContain('7 scores');
    expect(container.textContent).toContain('3 votes');
    unmount();
  });

  it('shows error message on mutation failure', async () => {
    let onErrorCb: ((err: { message: string }) => void) | undefined;
    const mutate = vi.fn();
    resetSimulationUseMutationMock.mockImplementation(({ onError }) => {
      onErrorCb = onError;
      return { mutate, isPending: false };
    });
    getCompetitionMock.mockReturnValue({ data: { id: 'comp_sim', isSimulation: true } });
    const { container, unmount } = await render();
    await act(async () => {
      onErrorCb?.({ message: 'Reset failed — try again' });
    });
    expect(container.textContent).toContain('Reset failed — try again');
    unmount();
  });
});
