import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StandingsTable, type NextMatchupHint } from './standings-table';
import type { StandingsEntry } from '@competition-platform/shared';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(props: Parameters<typeof StandingsTable>[0]): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StandingsTable, props));
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

const STANDINGS: StandingsEntry[] = [
  {
    rank: 1,
    competitorId: 'c_a',
    competitorName: 'Alpha',
    participantId: 'P-001',
    totalScore: '24.50',
    scoresByJudge: { js_1: '24.50' },
    judgeCount: 1,
    criteriaBreakdown: [
      { criterionId: 'c1', criterionName: 'Foundations', total: '24.50', judgeCount: 1 },
    ],
    groupBreakdown: [{ groupIndex: 0, groupLabel: 'Group A', total: '24.50', judgeCount: 1 }],
  },
  {
    rank: 2,
    competitorId: 'c_b',
    competitorName: 'Bravo',
    participantId: 'P-002',
    totalScore: '20.00',
    scoresByJudge: { js_1: '20.00' },
    judgeCount: 1,
  },
];

describe('StandingsTable', () => {
  it('renders empty state with pulse indicator when standings is empty', async () => {
    const { container, unmount } = await render({
      standings: [],
      nextByCompetitorId: new Map(),
    });
    const empty = container.querySelector('[data-testid="standings-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('Standings will appear as judges score.');
    expect(empty?.querySelector('.animate-pulse')).not.toBeNull();
    expect(container.querySelector('table')).toBeNull();
    unmount();
  });

  it('renders one row per competitor with rank and totalScore', async () => {
    const { container, unmount } = await render({
      standings: STANDINGS,
      nextByCompetitorId: new Map(),
    });
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Bravo');
    expect(container.textContent).toContain('24.50');
    expect(container.textContent).toContain('20.00');
    // No expand initially.
    expect(container.querySelector('[data-testid="standings-breakdown-c_a"]')).toBeNull();
    unmount();
  });

  it('expands a row to render BreakdownPanel on click and toggles closed', async () => {
    const { container, unmount } = await render({
      standings: STANDINGS,
      nextByCompetitorId: new Map(),
    });
    const row = container.querySelector('[data-testid="standings-row-c_a"]') as HTMLElement;
    await act(async () => {
      row.click();
    });
    expect(container.querySelector('[data-testid="standings-breakdown-c_a"]')).not.toBeNull();
    expect(container.textContent).toContain('Foundations');
    expect(container.textContent).toContain('Group A');

    // Click again → collapse.
    await act(async () => {
      row.click();
    });
    expect(container.querySelector('[data-testid="standings-breakdown-c_a"]')).toBeNull();
    unmount();
  });

  it('renders next-matchup pill when hint is present for that competitor', async () => {
    const hint: NextMatchupHint = {
      competitorId: 'c_a',
      matchupId: 'm_r2_0',
      roundNumber: 2,
      bracketPosition: 0,
      opponentCompetitorId: 'c_b',
      opponentName: 'Bravo',
    };
    const { container, unmount } = await render({
      standings: STANDINGS,
      nextByCompetitorId: new Map([['c_a', hint]]),
    });
    expect(container.querySelector('[data-testid="next-hint-c_a"]')).not.toBeNull();
    expect(container.textContent).toContain('Next: vs. Bravo');
    expect(container.textContent).toContain('R2');
    // Bravo has no hint → no pill on row 2.
    expect(container.querySelector('[data-testid="next-hint-c_b"]')).toBeNull();
    unmount();
  });
});
