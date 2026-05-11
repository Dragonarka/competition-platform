import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Competition } from '@competition-platform/shared';

vi.mock('@/i18n/navigation', () => ({
  Link: (props: Record<string, unknown>) => createElement('a', props),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
  }),
}));

import { CompetitionCard } from './competition-card';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

function makeCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'comp_1',
    name: 'Test Competition',
    description: null,
    date: null,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    isSimulation: false,
    ...overrides,
  };
}

async function render(competition: Competition): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CompetitionCard, { competition }));
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

describe('CompetitionCard', () => {
  it('renders simulation badge key when isSimulation is true', async () => {
    const { container, unmount } = await render(makeCompetition({ isSimulation: true }));
    expect(container.textContent).toContain('Competitions.simulationBadge');
    unmount();
  });

  it('does NOT render simulation badge when isSimulation is false', async () => {
    const { container, unmount } = await render(makeCompetition({ isSimulation: false }));
    expect(container.textContent).not.toContain('Competitions.simulationBadge');
    unmount();
  });

  it('renders both simulation and status keys', async () => {
    const { container, unmount } = await render(
      makeCompetition({ isSimulation: true, status: 'active' }),
    );
    expect(container.textContent).toContain('Competitions.simulationBadge');
    expect(container.textContent).toContain('active');
    unmount();
  });
});
