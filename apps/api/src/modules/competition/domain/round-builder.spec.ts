import { describe, it, expect, vi } from 'vitest';
import { buildNextRound, type PriorRoundMatchup } from './round-builder';

function winners(...positions: Array<[number, string]>): PriorRoundMatchup[] {
  return positions.map(([bracketPosition, winnerCompetitorId]) => ({
    bracketPosition,
    winnerCompetitorId,
  }));
}

describe('buildNextRound', () => {
  it('returns empty array when no winners', () => {
    expect(
      buildNextRound({
        priorRoundNumber: 1,
        winners: [],
        seedByCompetitorId: new Map(),
      }),
    ).toEqual([]);
  });

  it('returns empty array when single winner (final-round outcome)', () => {
    expect(
      buildNextRound({
        priorRoundNumber: 2,
        winners: winners([0, 'champ']),
        seedByCompetitorId: new Map([['champ', 1]]),
      }),
    ).toEqual([]);
  });

  it('pairs 2 winners into 1 next-round matchup (final)', () => {
    const result = buildNextRound({
      priorRoundNumber: 1,
      winners: winners([0, 'a'], [1, 'b']),
      seedByCompetitorId: new Map([
        ['a', 1],
        ['b', 4],
      ]),
    });
    expect(result).toEqual([
      {
        roundNumber: 2,
        bracketPosition: 0,
        competitorAId: 'a',
        competitorBId: 'b',
        seedA: 1,
        seedB: 4,
        isBye: false,
      },
    ]);
  });

  it('pairs 4 winners into 2 next-round matchups, S-shape', () => {
    const result = buildNextRound({
      priorRoundNumber: 1,
      winners: winners([0, 'a'], [1, 'b'], [2, 'c'], [3, 'd']),
      seedByCompetitorId: new Map([
        ['a', 1],
        ['b', 8],
        ['c', 4],
        ['d', 5],
      ]),
    });
    expect(result.map((m) => [m.competitorAId, m.competitorBId])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(result.map((m) => m.bracketPosition)).toEqual([0, 1]);
    expect(result.every((m) => m.roundNumber === 2)).toBe(true);
  });

  it('pairs 8 winners into 4 next-round matchups, seeds carry forward', () => {
    const result = buildNextRound({
      priorRoundNumber: 1,
      winners: winners(
        [0, 'a'],
        [1, 'b'],
        [2, 'c'],
        [3, 'd'],
        [4, 'e'],
        [5, 'f'],
        [6, 'g'],
        [7, 'h'],
      ),
      seedByCompetitorId: new Map([
        ['a', 1],
        ['b', 16],
        ['c', 8],
        ['d', 9],
        ['e', 4],
        ['f', 13],
        ['g', 5],
        ['h', 12],
      ]),
    });
    expect(result).toHaveLength(4);
    expect(result.map((m) => m.bracketPosition)).toEqual([0, 1, 2, 3]);
    expect(result[0]).toMatchObject({
      competitorAId: 'a',
      competitorBId: 'b',
      seedA: 1,
      seedB: 16,
    });
    expect(result[3]).toMatchObject({
      competitorAId: 'g',
      competitorBId: 'h',
      seedA: 5,
      seedB: 12,
    });
  });

  it('sorts winners by bracketPosition before pairing', () => {
    const result = buildNextRound({
      priorRoundNumber: 1,
      winners: winners([3, 'd'], [0, 'a'], [2, 'c'], [1, 'b']),
      seedByCompetitorId: new Map(),
    });
    expect(result[0]).toMatchObject({ competitorAId: 'a', competitorBId: 'b' });
    expect(result[1]).toMatchObject({ competitorAId: 'c', competitorBId: 'd' });
  });

  it('handles bye carry-over (round-2 reuses bye-resolved competitors as winners)', () => {
    const result = buildNextRound({
      priorRoundNumber: 1,
      winners: winners(
        [0, 'top-seed'],
        [1, 'bye-resolved-1'],
        [2, 'bye-resolved-2'],
        [3, 'underdog'],
      ),
      seedByCompetitorId: new Map([
        ['top-seed', 1],
        ['bye-resolved-1', 4],
        ['bye-resolved-2', 2],
        ['underdog', 5],
      ]),
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      competitorAId: 'top-seed',
      competitorBId: 'bye-resolved-1',
    });
  });

  it('warns and drops the unpaired winner when the count is odd (defensive)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = buildNextRound({
        priorRoundNumber: 2,
        winners: winners([0, 'a'], [1, 'b'], [2, 'orphan']),
        seedByCompetitorId: new Map(),
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        competitorAId: 'a',
        competitorBId: 'b',
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('Odd winner count');
      expect(warnSpy.mock.calls[0][0]).toContain('orphan');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('emits null seeds when seedByCompetitorId map omits a competitor', () => {
    const result = buildNextRound({
      priorRoundNumber: 1,
      winners: winners([0, 'a'], [1, 'b']),
      seedByCompetitorId: new Map([['a', 1]]),
    });
    expect(result[0].seedA).toBe(1);
    expect(result[0].seedB).toBeNull();
  });
});
