import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PresenterView, type PresenterViewProps } from './presenter-view';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(props: PresenterViewProps): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(PresenterView, props));
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

function makeProps(overrides: Partial<PresenterViewProps> = {}): PresenterViewProps {
  return {
    competitionName: 'Test Battle',
    currentPhase: 'configuration',
    totalScoresSubmitted: 0,
    totalScoresExpected: 0,
    topStandings: [],
    currentMatchup: null,
    nextMatchup: null,
    champion: null,
    ...overrides,
  };
}

function makeStandingsEntry(name: string, id: string, rank: number) {
  return {
    competitorId: id,
    competitorName: name,
    participantId: `P-${id}`,
    totalScore: '10.00',
    judgeCount: 1,
    rank,
    scoresByJudge: {},
  };
}

describe('PresenterView', () => {
  it('renders competition name and phase badge', async () => {
    const { container, unmount } = await render(makeProps());
    expect(container.querySelector('h1')?.textContent).toBe('Test Battle');
    expect(container.querySelector('[data-testid="presenter-view"]')).not.toBeNull();
    unmount();
  });

  it('renders configuration phase with setup message', async () => {
    const { container, unmount } = await render(makeProps({ currentPhase: 'configuration' }));
    const setup = container.querySelector('[data-testid="presenter-setup"]');
    expect(setup).not.toBeNull();
    expect(setup?.textContent).toContain('Competition is being set up');
    unmount();
  });

  it('renders cypher phase with scoring progress and standings', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'cypher',
        totalScoresSubmitted: 12,
        totalScoresExpected: 24,
        topStandings: [
          makeStandingsEntry('Alice', 'c1', 1),
          makeStandingsEntry('Bob', 'c2', 2),
          makeStandingsEntry('Carol', 'c3', 3),
        ],
      }),
    );
    const cypher = container.querySelector('[data-testid="presenter-cypher"]');
    expect(cypher).not.toBeNull();
    expect(cypher?.textContent).toContain('12 / 24 scores submitted');
    const standings = container.querySelector('[data-testid="presenter-standings"]');
    expect(standings).not.toBeNull();
    expect(standings?.textContent).toContain('Alice');
    expect(standings?.textContent).toContain('Bob');
    expect(standings?.textContent).toContain('Carol');
    unmount();
  });

  it('renders cypher phase with no scores placeholder', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'cypher',
        totalScoresSubmitted: 0,
        totalScoresExpected: 24,
        topStandings: [],
      }),
    );
    const noScores = container.querySelector('[data-testid="presenter-no-scores"]');
    expect(noScores).not.toBeNull();
    expect(noScores?.textContent).toContain('Waiting for scores');
    unmount();
  });

  it('renders cypher-review phase with standings and confirmation message', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'cypher-review',
        topStandings: [makeStandingsEntry('Alice', 'c1', 1)],
      }),
    );
    const review = container.querySelector('[data-testid="presenter-review"]');
    expect(review).not.toBeNull();
    expect(review?.textContent).toContain('Awaiting advancement confirmation');
    expect(review?.textContent).toContain('Alice');
    unmount();
  });

  it('renders battles phase with current matchup names in large text', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'battles',
        currentMatchup: {
          competitorA: 'Maria',
          competitorB: 'Carlos',
          roundLabel: 'Quarterfinals',
        },
      }),
    );
    const battles = container.querySelector('[data-testid="presenter-battles"]');
    expect(battles).not.toBeNull();
    expect(battles?.textContent).toContain('Now Battling');
    expect(battles?.textContent).toContain('Maria');
    expect(battles?.textContent).toContain('Carlos');
    expect(battles?.textContent).toContain('Quarterfinals');
    unmount();
  });

  it('renders battles phase with next matchup', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'battles',
        currentMatchup: {
          competitorA: 'Maria',
          competitorB: 'Carlos',
          roundLabel: 'Quarterfinals',
        },
        nextMatchup: {
          competitorA: 'Andre',
          competitorB: 'Sofia',
          roundLabel: 'Quarterfinals',
        },
      }),
    );
    const next = container.querySelector('[data-testid="presenter-next"]');
    expect(next).not.toBeNull();
    expect(next?.textContent).toContain('Up Next');
    expect(next?.textContent).toContain('Andre');
    expect(next?.textContent).toContain('Sofia');
    unmount();
  });

  it('renders battles phase between rounds with awaiting message', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'battles',
        currentMatchup: null,
      }),
    );
    const awaiting = container.querySelector('[data-testid="presenter-awaiting"]');
    expect(awaiting).not.toBeNull();
    expect(awaiting?.textContent).toContain('Awaiting next round');
    unmount();
  });

  it('renders completed phase with champion name and seed', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'completed',
        champion: { name: 'Elena', seed: 3 },
      }),
    );
    const champ = container.querySelector('[data-testid="presenter-champion"]');
    expect(champ).not.toBeNull();
    expect(champ?.textContent).toContain('Champion');
    expect(champ?.textContent).toContain('Elena');
    expect(champ?.textContent).toContain('Seed #3');
    unmount();
  });

  it('handles null battles data gracefully in cypher phase', async () => {
    const { container, unmount } = await render(
      makeProps({
        currentPhase: 'cypher',
        currentMatchup: null,
        nextMatchup: null,
        champion: null,
      }),
    );
    expect(container.querySelector('[data-testid="presenter-battles"]')).toBeNull();
    expect(container.querySelector('[data-testid="presenter-champion"]')).toBeNull();
    unmount();
  });
});
