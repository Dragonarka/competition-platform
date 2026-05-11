import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { listSimulationResetEventsMock } = vi.hoisted(() => ({
  listSimulationResetEventsMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      listSimulationResetEvents: { useQuery: listSimulationResetEventsMock },
    },
  },
}));

import { SimulationHistoryPanel } from './simulation-history-panel';

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
    root.render(createElement(SimulationHistoryPanel, { competitionId: 'comp_sim' }));
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

describe('SimulationHistoryPanel', () => {
  beforeEach(() => {
    listSimulationResetEventsMock.mockReset();
  });

  it('renders nothing when no reset events', async () => {
    listSimulationResetEventsMock.mockReturnValue({ data: [] });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders rows for each reset event', async () => {
    listSimulationResetEventsMock.mockReturnValue({
      data: [
        {
          competitionId: 'comp_sim',
          resetAt: '2026-05-09T11:00:00.000Z',
          scoresDeleted: 10,
          votesDeleted: 5,
          matchupsDeleted: 2,
          groupAssignmentsDeleted: 4,
          createdAt: '2026-05-09T11:00:00.000Z',
        },
        {
          competitionId: 'comp_sim',
          resetAt: '2026-05-09T10:00:00.000Z',
          scoresDeleted: 5,
          votesDeleted: 0,
          matchupsDeleted: 0,
          groupAssignmentsDeleted: 4,
          createdAt: '2026-05-09T10:00:00.000Z',
        },
      ],
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Simulation History');
    expect(container.textContent).toContain('10 scores');
    expect(container.textContent).toContain('5 scores');
    unmount();
  });
});
