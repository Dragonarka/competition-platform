// Pure tally domain — no DB, no I/O. Mirrors bracket-generator.ts so it can
// be unit-tested standalone. See _bmad-output/implementation-artifacts/5-3-…
// for the AC mapping.

export interface VoteTally {
  player1: number;
  player2: number;
  tie: number;
  total: number;
}

export type TallyOutcome =
  | { kind: 'pending'; tally: VoteTally }
  | { kind: 'winner'; winnerCompetitorId: string; tally: VoteTally }
  | { kind: 'tie'; tally: VoteTally };

export interface TallyMatchupArgs {
  tally: VoteTally;
  expectedVotes: number;
  competitorAId: string;
  competitorBId: string;
}

export function tallyMatchup(args: TallyMatchupArgs): TallyOutcome {
  const { tally, expectedVotes, competitorAId, competitorBId } = args;

  if (tally.total < expectedVotes) {
    return { kind: 'pending', tally };
  }

  if (tally.player1 > tally.player2) {
    return { kind: 'winner', winnerCompetitorId: competitorAId, tally };
  }
  if (tally.player2 > tally.player1) {
    return { kind: 'winner', winnerCompetitorId: competitorBId, tally };
  }

  return { kind: 'tie', tally };
}
