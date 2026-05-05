export interface CompetitorWithdrawnPayload {
  competitorId: string;
  competitionId: string;
  competitorName: string;
  reason: string;
  withdrawnByClerkId: string;
  withdrawnAt: string; // ISO 8601
}

export interface CompetitorWithdrawnEvent {
  type: 'competitor.withdrawn';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: CompetitorWithdrawnPayload;
  createdBy: string; // organizer Clerk ID
  createdAt: string;
  sequence: number;
}

export interface CompetitorRescuedPayload {
  competitorId: string;
  competitionId: string;
  competitorName: string;
  reason: string;
  rescuedByClerkId: string;
  rescuedAt: string; // ISO 8601
}

export interface CompetitorRescuedEvent {
  type: 'competitor.rescued';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: CompetitorRescuedPayload;
  createdBy: string; // organizer Clerk ID
  createdAt: string;
  sequence: number;
}
