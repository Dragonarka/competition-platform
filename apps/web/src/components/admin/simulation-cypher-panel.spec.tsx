import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const {
  getCompetitionMock,
  listCompetitorsMock,
  listCriteriaMock,
  listSimSessionsMock,
  listScoresMock,
  submitOrganizerScoreUseMutationMock,
  useUtilsMock,
} = vi.hoisted(() => ({
  getCompetitionMock: vi.fn(),
  listCompetitorsMock: vi.fn(),
  listCriteriaMock: vi.fn(),
  listSimSessionsMock: vi.fn(),
  listScoresMock: vi.fn(),
  submitOrganizerScoreUseMutationMock: vi.fn(),
  useUtilsMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: useUtilsMock,
    tournament: {
      getCompetition: { useQuery: getCompetitionMock },
      listCompetitorsWithStatus: { useQuery: listCompetitorsMock },
      listCriteria: { useQuery: listCriteriaMock },
      listSimulatedJudgeSessions: { useQuery: listSimSessionsMock },
      listScoresForOverride: { useQuery: listScoresMock },
      submitOrganizerScore: { useMutation: submitOrganizerScoreUseMutationMock },
    },
  },
}));

import { SimulationCypherPanel } from './simulation-cypher-panel';

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
    root.render(createElement(SimulationCypherPanel, { competitionId: 'comp_sim' }));
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

const COMP_CYPHER_ACTIVE = {
  id: 'comp_sim',
  isSimulation: true,
  status: 'active',
  cypherCompletedAt: null,
  cypherGroupCount: 2,
  cypherJudgeCount: 3,
};

const CRITERIA = [{ id: 'c1', name: 'Flow', minScore: '0.00', maxScore: '10.00' }];

describe('SimulationCypherPanel', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
    listCompetitorsMock.mockReset();
    listCriteriaMock.mockReset();
    listSimSessionsMock.mockReset();
    listScoresMock.mockReset();
    submitOrganizerScoreUseMutationMock.mockReset();
    useUtilsMock.mockReset();
    useUtilsMock.mockReturnValue({
      tournament: {
        getStandings: { invalidate: vi.fn() },
        listScoresForOverride: { invalidate: vi.fn() },
      },
    });
    submitOrganizerScoreUseMutationMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    listSimSessionsMock.mockReturnValue({ data: [] });
    listScoresMock.mockReturnValue({ data: [] });
    listCriteriaMock.mockReturnValue({ data: CRITERIA });
  });

  it('renders nothing when not a simulation', async () => {
    getCompetitionMock.mockReturnValue({
      data: { ...COMP_CYPHER_ACTIVE, isSimulation: false },
    });
    listCompetitorsMock.mockReturnValue({ data: [] });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('group dropdown shows cypherGroupCount options as A, B, ...', async () => {
    getCompetitionMock.mockReturnValue({ data: COMP_CYPHER_ACTIVE });
    listCompetitorsMock.mockReturnValue({ data: [] });
    const { container, unmount } = await render();
    const groupSelect = container.querySelector(
      'select[aria-label="Judge group"]',
    ) as HTMLSelectElement;
    expect(groupSelect.options.length).toBe(2);
    expect(groupSelect.options[0]?.textContent).toBe('Group A');
    expect(groupSelect.options[1]?.textContent).toBe('Group B');
    unmount();
  });

  it('judge dropdown shows cypherJudgeCount options', async () => {
    getCompetitionMock.mockReturnValue({ data: COMP_CYPHER_ACTIVE });
    listCompetitorsMock.mockReturnValue({ data: [] });
    const { container, unmount } = await render();
    const judgeSelect = container.querySelector(
      'select[aria-label="Judge slot"]',
    ) as HTMLSelectElement;
    expect(judgeSelect.options.length).toBe(3);
    expect(judgeSelect.options[0]?.textContent).toBe('Judge 1');
    unmount();
  });

  it('filters competitors by selected group', async () => {
    getCompetitionMock.mockReturnValue({ data: COMP_CYPHER_ACTIVE });
    listCompetitorsMock.mockReturnValue({
      data: [
        { id: 'c1', name: 'Alice', participantId: 'P-A', status: 'active', groupIndex: 0 },
        { id: 'c2', name: 'Bob', participantId: 'P-B', status: 'active', groupIndex: 1 },
      ],
    });
    const { container, unmount } = await render();
    // Default group is 0 → Alice visible, Bob hidden.
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).not.toContain('Bob');

    const groupSelect = container.querySelector(
      'select[aria-label="Judge group"]',
    ) as HTMLSelectElement;
    await act(async () => {
      groupSelect.value = '1';
      groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).not.toContain('Alice');
    unmount();
  });

  it('submits with selected simulatedGroupIndex/simulatedJudgeIndex', async () => {
    const mutate = vi.fn();
    submitOrganizerScoreUseMutationMock.mockReturnValue({ mutate, isPending: false });
    getCompetitionMock.mockReturnValue({ data: COMP_CYPHER_ACTIVE });
    listCompetitorsMock.mockReturnValue({
      data: [{ id: 'c1', name: 'Alice', participantId: 'P-A', status: 'active', groupIndex: 1 }],
    });
    const { container, unmount } = await render();
    // Switch to Group B (index 1) and Judge 2 (index 1).
    const groupSelect = container.querySelector(
      'select[aria-label="Judge group"]',
    ) as HTMLSelectElement;
    await act(async () => {
      groupSelect.value = '1';
      groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const judgeSelect = container.querySelector(
      'select[aria-label="Judge slot"]',
    ) as HTMLSelectElement;
    await act(async () => {
      judgeSelect.value = '1';
      judgeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Enter a valid score (use native setter so React's onChange fires).
    const numberInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(numberInput, '7.5');
      numberInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Submit',
    );
    await act(async () => {
      submitBtn!.click();
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: 'comp_sim',
        competitorId: 'c1',
        simulatedGroupIndex: 1,
        simulatedJudgeIndex: 1,
        scores: [{ criterionId: 'c1', value: '7.50' }],
      }),
    );
    unmount();
  });

  it('shows ✓ Scored when current sim session has a score for the competitor', async () => {
    getCompetitionMock.mockReturnValue({ data: COMP_CYPHER_ACTIVE });
    listCompetitorsMock.mockReturnValue({
      data: [{ id: 'c1', name: 'Alice', participantId: 'P-A', status: 'active', groupIndex: 0 }],
    });
    listSimSessionsMock.mockReturnValue({
      data: [{ id: 'sim_session_a1', label: 'Sim Judge GA-J1', groupIndex: 0 }],
    });
    listScoresMock.mockReturnValue({
      data: [{ judgeSessionId: 'sim_session_a1', competitorId: 'c1' }],
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('✓ Scored');
    unmount();
  });
});
