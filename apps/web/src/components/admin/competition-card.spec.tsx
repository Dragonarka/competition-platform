import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Competition } from '@competition-platform/shared';
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
  it('renders SIMULATION badge when isSimulation is true', async () => {
    const { container, unmount } = await render(makeCompetition({ isSimulation: true }));
    expect(container.textContent).toContain('SIMULATION');
    unmount();
  });

  it('does NOT render SIMULATION badge when isSimulation is false', async () => {
    const { container, unmount } = await render(makeCompetition({ isSimulation: false }));
    expect(container.textContent).not.toContain('SIMULATION');
    unmount();
  });

  it('renders both SIMULATION badge and status badge', async () => {
    const { container, unmount } = await render(
      makeCompetition({ isSimulation: true, status: 'active' }),
    );
    expect(container.textContent).toContain('SIMULATION');
    expect(container.textContent).toContain('active');
    unmount();
  });
});
