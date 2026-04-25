export interface CompetitionStartedPayload {
  competitionId: string;
  groupCount: number;
  judgeAssignments: { judgeSessionId: string; groupIndex: number }[];
  competitorAssignments: { competitorId: string; groupIndex: number }[];
  startedAt: string; // ISO 8601
}

export interface CompetitionStartedEvent {
  type: 'competition.started';
  aggregateId: string;
  aggregateType: 'competition';
  payload: CompetitionStartedPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}
