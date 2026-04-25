export interface StandingsEntry {
  rank: number;
  competitorId: string;
  competitorName: string;
  participantId: string;
  totalScore: string; // "X.XX" — sum across all judges who scored this competitor
  scoresByJudge: Record<string, string>; // judgeSessionId → "X.XX" judge total
  judgeCount: number;
}
