export interface PublicBracketCompetitor {
  name: string;
  participantId: string;
}

export interface PublicBracketMatchup {
  id: string;
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string | null;
  competitorBId: string | null;
  seedA: number | null;
  seedB: number | null;
  isBye: boolean;
  winnerCompetitorId: string | null;
  competitorA: PublicBracketCompetitor | null;
  competitorB: PublicBracketCompetitor | null;
}

export interface PublicBracketData {
  matchups: PublicBracketMatchup[];
  championCompetitorId: string | null;
  currentRoundNumber: number | null;
}
