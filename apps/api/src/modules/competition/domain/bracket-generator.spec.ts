import { describe, it, expect } from 'vitest';
import { generateBracket, type SeededCompetitor } from './bracket-generator';

function makeSeeds(n: number): SeededCompetitor[] {
  return Array.from({ length: n }, (_, i) => ({
    competitorId: `c${i + 1}`,
    seed: i + 1,
  }));
}

describe('generateBracket', () => {
  it('returns empty structure for 0 qualifiers (AC #7)', () => {
    const result = generateBracket([]);
    expect(result.bracketSize).toBe(0);
    expect(result.qualifierCount).toBe(0);
    expect(result.matchups).toEqual([]);
  });

  it('returns empty matchups for 1 qualifier — sole auto-winner (AC #7)', () => {
    const result = generateBracket(makeSeeds(1));
    expect(result.bracketSize).toBe(1);
    expect(result.qualifierCount).toBe(1);
    expect(result.matchups).toEqual([]);
  });

  it('produces 1 matchup (1v2) for 2 qualifiers, no byes', () => {
    const result = generateBracket(makeSeeds(2));
    expect(result.bracketSize).toBe(2);
    expect(result.matchups).toHaveLength(1);
    expect(result.matchups[0]).toMatchObject({
      roundNumber: 1,
      bracketPosition: 0,
      seedA: 1,
      seedB: 2,
      competitorAId: 'c1',
      competitorBId: 'c2',
      isBye: false,
    });
  });

  it('produces canonical 4-bracket for 4 qualifiers: (1v4), (2v3), no byes (AC #1)', () => {
    const result = generateBracket(makeSeeds(4));
    expect(result.bracketSize).toBe(4);
    expect(result.matchups).toHaveLength(2);
    expect(result.matchups.map((m) => [m.seedA, m.seedB])).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(result.matchups.every((m) => m.isBye === false)).toBe(true);
  });

  it('produces canonical 8-bracket for 8 qualifiers: 1v8, 4v5, 2v7, 3v6 (AC #1)', () => {
    const result = generateBracket(makeSeeds(8));
    expect(result.bracketSize).toBe(8);
    expect(result.matchups).toHaveLength(4);
    expect(result.matchups.map((m) => [m.seedA, m.seedB])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    expect(result.matchups.every((m) => m.isBye === false)).toBe(true);
  });

  it('assigns 3 byes to top seeds 1,2,3 for 5 qualifiers (AC #2)', () => {
    const result = generateBracket(makeSeeds(5));
    expect(result.bracketSize).toBe(8);
    expect(result.matchups).toHaveLength(4);

    const byeMatchups = result.matchups.filter((m) => m.isBye);
    const realMatchups = result.matchups.filter((m) => !m.isBye);

    expect(byeMatchups).toHaveLength(3);
    expect(realMatchups).toHaveLength(1);

    expect(
      byeMatchups.map((m) => m.seedA).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([1, 2, 3]);
    expect([realMatchups[0].seedA, realMatchups[0].seedB]).toEqual([4, 5]);

    for (const bye of byeMatchups) {
      expect(bye.competitorBId).toBeNull();
      expect(bye.seedB).toBeNull();
    }
  });

  it('assigns 6 byes to top seeds 1-6 for 10 qualifiers and 2 real matches (AC #2)', () => {
    const result = generateBracket(makeSeeds(10));
    expect(result.bracketSize).toBe(16);
    expect(result.matchups).toHaveLength(8);

    const byeMatchups = result.matchups.filter((m) => m.isBye);
    const realMatchups = result.matchups.filter((m) => !m.isBye);

    expect(byeMatchups).toHaveLength(6);
    expect(realMatchups).toHaveLength(2);

    expect(
      byeMatchups.map((m) => m.seedA).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    const realPairs = realMatchups.map((m) => [m.seedA, m.seedB]).sort();
    expect(realPairs).toEqual([
      [7, 10],
      [8, 9],
    ]);
  });

  it('assigns 4 byes to top seeds 1-4 for 12 qualifiers and 4 real matches (AC #2)', () => {
    const result = generateBracket(makeSeeds(12));
    expect(result.bracketSize).toBe(16);
    expect(result.matchups).toHaveLength(8);

    const byeMatchups = result.matchups.filter((m) => m.isBye);
    const realMatchups = result.matchups.filter((m) => !m.isBye);

    expect(byeMatchups).toHaveLength(4);
    expect(realMatchups).toHaveLength(4);
    expect(
      byeMatchups.map((m) => m.seedA).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([1, 2, 3, 4]);
  });

  it('uses unique bracket positions per matchup (AC #3 ordering)', () => {
    const result = generateBracket(makeSeeds(8));
    const positions = result.matchups.map((m) => m.bracketPosition);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('property test: for any N in 2..32 the bracket invariants hold (AC #1, #2)', () => {
    for (let n = 2; n <= 32; n++) {
      const result = generateBracket(makeSeeds(n));
      const expectedSize = 2 ** Math.ceil(Math.log2(n));

      expect(result.bracketSize, `N=${n}`).toBe(expectedSize);
      expect(result.qualifierCount, `N=${n}`).toBe(n);
      expect(result.matchups.length, `N=${n}`).toBe(expectedSize / 2);

      const byeCount = result.matchups.filter((m) => m.isBye).length;
      const expectedByes = expectedSize - n;
      expect(byeCount, `N=${n} byeCount`).toBe(expectedByes);

      const byeSeeds = result.matchups
        .filter((m) => m.isBye)
        .map((m) => m.seedA!)
        .sort((a, b) => a - b);
      const expectedByeSeeds = Array.from(
        { length: expectedByes },
        (_, i) => i + 1,
      );
      expect(byeSeeds, `N=${n} top seeds get byes`).toEqual(expectedByeSeeds);

      const allCompetitors: string[] = [];
      for (const m of result.matchups) {
        if (m.competitorAId) allCompetitors.push(m.competitorAId);
        if (m.competitorBId) allCompetitors.push(m.competitorBId);
      }
      expect(
        new Set(allCompetitors).size,
        `N=${n} every competitor appears once`,
      ).toBe(n);
      expect(allCompetitors.length, `N=${n} no competitor appears twice`).toBe(
        n,
      );
    }
  });

  it('property test: bracket positions are 0..size/2-1 in canonical order', () => {
    for (let n = 2; n <= 16; n++) {
      const result = generateBracket(makeSeeds(n));
      const expected = Array.from(
        { length: result.bracketSize / 2 },
        (_, i) => i,
      );
      expect(result.matchups.map((m) => m.bracketPosition)).toEqual(expected);
    }
  });
});
