export interface CriterionBreakdownPublic {
  criterionId: string;
  criterionName: string;
  total: string;
  judgeCount: number;
}

export interface GroupBreakdownPublic {
  groupIndex: number;
  groupLabel: string;
  total: string;
  judgeCount: number;
}

export interface StandingsEntry {
  rank: number;
  competitorId: string;
  competitorName: string;
  participantId: string;
  totalScore: string; // "X.XX" — sum across all judges who scored this competitor
  scoresByJudge: Record<string, string>; // judgeSessionId → "X.XX" judge total
  judgeCount: number;
  // Story 6.1: optional public-facing breakdowns. Optional so existing
  // organizer-side consumers (dashboard topStandings) keep working.
  criteriaBreakdown?: CriterionBreakdownPublic[];
  groupBreakdown?: GroupBreakdownPublic[];
}
