// Round-N+1 pairing — pure function, no DB. Pair winners of round N (sorted by
// bracketPosition asc) S-shape: position 0 vs 1 → next position 0; 2 vs 3 → 1.
// Deliberately separate from generateBracket: round-1 takes seeded competitors
// over a power-of-two bracket; round-N+1 takes prior-round winners. Different
// inputs, different invariants.

export interface PriorRoundMatchup {
  bracketPosition: number;
  winnerCompetitorId: string;
}

export interface NextRoundMatchupInput {
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string;
  competitorBId: string;
  seedA: number | null;
  seedB: number | null;
  isBye: false;
}

export interface BuildNextRoundArgs {
  priorRoundNumber: number;
  winners: PriorRoundMatchup[];
  seedByCompetitorId: Map<string, number>;
}

export function buildNextRound(
  args: BuildNextRoundArgs,
): NextRoundMatchupInput[] {
  const { priorRoundNumber, winners, seedByCompetitorId } = args;
  if (winners.length < 2) return [];

  const sorted = [...winners].sort(
    (a, b) => a.bracketPosition - b.bracketPosition,
  );
  const nextRound = priorRoundNumber + 1;
  const matchups: NextRoundMatchupInput[] = [];

  // Round-2+ pairings should always have an even number of winners. Story 5.1
  // pre-resolves byes in round 1, so every later round receives full pairs.
  // A half-empty pairing here means an upstream invariant broke; warn loudly
  // rather than silently produce a shorter round.
  if (sorted.length % 2 !== 0) {
    console.warn(
      `[round-builder] Odd winner count (${sorted.length}) for round ${priorRoundNumber + 1}; last winner ${JSON.stringify(sorted[sorted.length - 1])} has no opponent and will be dropped`,
    );
  }

  for (let i = 0; i < sorted.length; i += 2) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!b) break;
    matchups.push({
      roundNumber: nextRound,
      bracketPosition: i / 2,
      competitorAId: a.winnerCompetitorId,
      competitorBId: b.winnerCompetitorId,
      seedA: seedByCompetitorId.get(a.winnerCompetitorId) ?? null,
      seedB: seedByCompetitorId.get(b.winnerCompetitorId) ?? null,
      isBye: false,
    });
  }

  return matchups;
}
