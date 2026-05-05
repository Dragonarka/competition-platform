export interface SeededCompetitor {
  competitorId: string;
  seed: number;
}

export interface BracketMatchup {
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string | null;
  competitorBId: string | null;
  seedA: number | null;
  seedB: number | null;
  isBye: boolean;
}

export interface BracketStructure {
  bracketSize: number;
  qualifierCount: number;
  matchups: BracketMatchup[];
}

// S-shape recursive pairing: at every doubling, each seed K from the prior round
// is paired with (size + 1 - K). Produces canonical NCAA placement so the top
// half (seeds 1..size/2) sits on the A-side and the bottom half on the B-side.
function bracketWalk(size: number): number[] {
  if (size === 1) return [1];
  const prev = bracketWalk(size / 2);
  const pairs: number[] = [];
  for (const s of prev) {
    pairs.push(s);
    pairs.push(size + 1 - s);
  }
  return pairs;
}

export function generateBracket(seeds: SeededCompetitor[]): BracketStructure {
  const qualifierCount = seeds.length;
  if (qualifierCount === 0) {
    return { bracketSize: 0, qualifierCount: 0, matchups: [] };
  }
  if (qualifierCount === 1) {
    return { bracketSize: 1, qualifierCount: 1, matchups: [] };
  }

  const bracketSize = 2 ** Math.ceil(Math.log2(qualifierCount));

  const seedToCompetitor = new Map<number, string>();
  for (const s of seeds) seedToCompetitor.set(s.seed, s.competitorId);

  const order = bracketWalk(bracketSize);
  const matchups: BracketMatchup[] = [];

  for (let i = 0; i < order.length; i += 2) {
    const seedA = order[i];
    const seedB = order[i + 1];
    const bracketPosition = i / 2;

    const aExists = seedA <= qualifierCount;
    const bExists = seedB <= qualifierCount;

    if (aExists && bExists) {
      matchups.push({
        roundNumber: 1,
        bracketPosition,
        competitorAId: seedToCompetitor.get(seedA) ?? null,
        competitorBId: seedToCompetitor.get(seedB) ?? null,
        seedA,
        seedB,
        isBye: false,
      });
      continue;
    }

    // Canonical S-shape guarantees A-side is the smaller seed (top half), so when
    // exactly one side is absent it is always the B-side. The bye auto-advances A.
    matchups.push({
      roundNumber: 1,
      bracketPosition,
      competitorAId: seedToCompetitor.get(seedA) ?? null,
      competitorBId: null,
      seedA,
      seedB: null,
      isBye: true,
    });
  }

  return { bracketSize, qualifierCount, matchups };
}
