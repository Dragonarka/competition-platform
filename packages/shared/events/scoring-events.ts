export interface ScoreSubmittedPayload {
  judgeSessionId: string;
  competitorId: string;
  competitionId: string;
  scores: { criterionId: string; value: string }[];
  idempotencyKey: string;
  submittedAt: string; // ISO 8601
}

export interface ScoreSubmittedEvent {
  type: 'score.submitted';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: ScoreSubmittedPayload;
  createdBy: string; // judgeSessionId
  createdAt: string;
  sequence: number;
}
