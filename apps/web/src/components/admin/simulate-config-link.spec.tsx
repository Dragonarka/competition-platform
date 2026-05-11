import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getCompetitionMock } = vi.hoisted(() => ({
  getCompetitionMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      getCompetition: { useQuery: getCompetitionMock },
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: (props: Record<string, unknown>) => createElement('a', props),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `Simulation.${key}`,
}));

import { SimulateConfigLink } from './simulate-config-link';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(competitionId = 'comp_1'): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(SimulateConfigLink, { competitionId }));
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

const baseComp = {
  id: 'comp_1',
  name: 'Test Comp',
  status: 'draft',
  participantFormat: 'individual',
  cypherJudgeCount: 3,
  cypherGroupCount: 2,
  advancementThreshold: null,
  battlesJudgeCount: null,
  tieBreakingRule: null,
  cypherCompletedAt: null,
  soloMode: false,
  isSimulation: false,
};

describe('SimulateConfigLink', () => {
  beforeEach(() => {
    getCompetitionMock.mockReset();
  });

  it('renders nothing while data is loading', async () => {
    getCompetitionMock.mockReturnValue({ data: undefined });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders nothing when competition is already a simulation', async () => {
    getCompetitionMock.mockReturnValue({
      data: { ...baseComp, isSimulation: true },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders nothing when competition has no config (all null)', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        ...baseComp,
        cypherJudgeCount: null,
        battlesJudgeCount: null,
        advancementThreshold: null,
      },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders link when competition has judge config', async () => {
    getCompetitionMock.mockReturnValue({ data: baseComp });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Simulation.configLink');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toContain('simulation=true&source=comp_1');
    unmount();
  });

  it('renders link when competition has battlesJudgeCount set', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        ...baseComp,
        cypherJudgeCount: null,
        battlesJudgeCount: 5,
        advancementThreshold: null,
      },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Simulation.configLink');
    unmount();
  });

  it('renders link when only advancementThreshold is set', async () => {
    getCompetitionMock.mockReturnValue({
      data: {
        ...baseComp,
        cypherJudgeCount: null,
        battlesJudgeCount: null,
        advancementThreshold: 8,
      },
    });
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Simulation.configLink');
    unmount();
  });
});
