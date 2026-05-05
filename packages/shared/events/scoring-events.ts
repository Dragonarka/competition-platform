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

export interface ScoreOverriddenPayload {
  scoreId: string;
  competitionId: string;
  judgeSessionId: string;
  competitorId: string;
  originalCriteriaScores: { criterionId: string; value: string }[];
  newCriteriaScores: { criterionId: string; value: string }[];
  originalTotalScore: string;
  newTotalScore: string;
  reason: string;
  overriddenByClerkId: string;
  overriddenAt: string; // ISO 8601
}

export interface ScoreOverriddenEvent {
  type: 'score.overridden';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: ScoreOverriddenPayload;
  createdBy: string; // organizer Clerk ID
  createdAt: string;
  sequence: number;
}

export interface VoteSubmittedPayload {
  competitionId: string;
  matchupId: string;
  judgeSessionId: string;
  vote: 'player1' | 'player2' | 'tie';
  idempotencyKey: string;
  submittedAt: string; // ISO 8601
}

export interface VoteSubmittedEvent {
  type: 'vote.submitted';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: VoteSubmittedPayload;
  createdBy: string; // judgeSessionId
  createdAt: string;
  sequence: number;
}
