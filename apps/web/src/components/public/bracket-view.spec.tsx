import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PublicBracketData, PublicBracketMatchup } from '@competition-platform/shared';
import { BracketView } from './bracket-view';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(bracket: PublicBracketData): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(BracketView, { bracket }));
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

function makeMatchup(overrides: Partial<PublicBracketMatchup> = {}): PublicBracketMatchup {
  return {
    id: 'm_1',
    roundNumber: 1,
    bracketPosition: 0,
    competitorAId: 'c_a',
    competitorBId: 'c_b',
    seedA: 1,
    seedB: 2,
    isBye: false,
    winnerCompetitorId: null,
    competitorA: { name: 'Alpha', participantId: 'P-001' },
    competitorB: { name: 'Bravo', participantId: 'P-002' },
    ...overrides,
  };
}

describe('BracketView', () => {
  it('renders empty state with pulse indicator when matchups is empty', async () => {
    const { container, unmount } = await render({
      matchups: [],
      championCompetitorId: null,
      currentRoundNumber: null,
    });
    const empty = container.querySelector('[data-testid="bracket-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('Bracket will appear when the Battles phase begins.');
    expect(empty?.querySelector('.animate-pulse')).not.toBeNull();
    unmount();
  });

  it('renders matchup cards with competitor names and seeds', async () => {
    const { container, unmount } = await render({
      matchups: [makeMatchup()],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    const card = container.querySelector('[data-testid="bracket-matchup-m_1"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Alpha');
    expect(card?.textContent).toContain('Bravo');
    expect(card?.textContent).toContain('1');
    expect(card?.textContent).toContain('2');
    unmount();
  });

  it('renders bye matchup with winner and BYE opponent slot', async () => {
    const { container, unmount } = await render({
      matchups: [
        makeMatchup({
          id: 'm_bye',
          isBye: true,
          competitorBId: null,
          competitorB: null,
          winnerCompetitorId: 'c_a',
        }),
      ],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Winner');
    expect(container.textContent).toContain('BYE');
    unmount();
  });

  it('renders BYE label when competitor slot is null and isBye is true', async () => {
    const { container, unmount } = await render({
      matchups: [
        makeMatchup({
          id: 'm_bye2',
          isBye: true,
          competitorAId: null,
          competitorA: null,
          competitorBId: 'c_b',
          competitorB: { name: 'Bravo', participantId: 'P-002' },
          winnerCompetitorId: 'c_b',
        }),
      ],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    expect(container.textContent).toContain('BYE');
    expect(container.textContent).toContain('Bravo');
    unmount();
  });

  it('renders TBD slot when competitor is null and not a bye', async () => {
    const { container, unmount } = await render({
      matchups: [
        makeMatchup({
          id: 'm_tbd',
          competitorBId: null,
          competitorB: null,
          isBye: false,
        }),
      ],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    expect(container.textContent).toContain('TBD');
    unmount();
  });

  it('highlights winner with green styling', async () => {
    const { container, unmount } = await render({
      matchups: [makeMatchup({ winnerCompetitorId: 'c_a' })],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    const card = container.querySelector('[data-testid="bracket-matchup-m_1"]');
    expect(card?.textContent).toContain('Winner');
    unmount();
  });

  it('renders champion banner when championCompetitorId is set', async () => {
    const { container, unmount } = await render({
      matchups: [
        makeMatchup({ roundNumber: 1, winnerCompetitorId: 'c_a' }),
        makeMatchup({
          id: 'm_final',
          roundNumber: 2,
          bracketPosition: 0,
          competitorAId: 'c_a',
          competitorBId: 'c_x',
          competitorA: { name: 'Alpha', participantId: 'P-001' },
          competitorB: { name: 'Xray', participantId: 'P-003' },
          winnerCompetitorId: 'c_a',
          seedA: 1,
          seedB: null,
        }),
      ],
      championCompetitorId: 'c_a',
      currentRoundNumber: null,
    });
    const banner = container.querySelector('[data-testid="bracket-champion"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Champion');
    expect(banner?.textContent).toContain('Alpha');
    expect(banner?.textContent).toContain('Seed 1');
    unmount();
  });

  it('renders both vertical and horizontal layouts simultaneously for responsive switching', async () => {
    const { container, unmount } = await render({
      matchups: [makeMatchup()],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    expect(container.querySelector('[data-testid="bracket-vertical"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bracket-horizontal"]')).not.toBeNull();
    unmount();
  });

  it('displays correct round labels (Final, Semifinals, Quarterfinals)', async () => {
    const matchups: PublicBracketMatchup[] = [
      makeMatchup({ id: 'm_qf1', roundNumber: 1, bracketPosition: 0 }),
      makeMatchup({ id: 'm_qf2', roundNumber: 1, bracketPosition: 1 }),
      makeMatchup({ id: 'm_qf3', roundNumber: 1, bracketPosition: 2 }),
      makeMatchup({ id: 'm_qf4', roundNumber: 1, bracketPosition: 3 }),
      makeMatchup({ id: 'm_sf1', roundNumber: 2, bracketPosition: 0 }),
      makeMatchup({ id: 'm_sf2', roundNumber: 2, bracketPosition: 1 }),
      makeMatchup({ id: 'm_f', roundNumber: 3, bracketPosition: 0 }),
    ];
    const { container, unmount } = await render({
      matchups,
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    expect(container.textContent).toContain('Quarterfinals');
    expect(container.textContent).toContain('Semifinals');
    expect(container.textContent).toContain('Final');
    unmount();
  });

  it('displays current round label when currentRoundNumber is set', async () => {
    const { container, unmount } = await render({
      matchups: [makeMatchup()],
      championCompetitorId: null,
      currentRoundNumber: 1,
    });
    expect(container.textContent).toContain('Current round:');
    unmount();
  });
});
