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

export interface PhaseTransitionedPayload {
  competitionId: string;
  fromPhase: 'cypher';
  toPhase: 'battles';
  advancedCompetitorIds: string[];
  triggerType: 'admin_confirmed';
  transitionedAt: string; // ISO 8601
}

export interface PhaseTransitionedEvent {
  type: 'phase.transitioned';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: PhaseTransitionedPayload;
  createdBy: string; // organizer Clerk ID
  createdAt: string;
  sequence: number;
}

export interface BracketSeed {
  competitorId: string;
  seed: number; // 1-indexed
}

export interface BracketMatchupSnapshot {
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string | null;
  competitorBId: string | null;
  seedA: number | null;
  seedB: number | null;
  isBye: boolean;
}

export interface BracketGeneratedPayload {
  competitionId: string;
  bracketSize: number;
  qualifierCount: number;
  seeds: BracketSeed[];
  matchups: BracketMatchupSnapshot[]; // round-1 only at generation time
  generatedAt: string; // ISO 8601
}

export interface BracketGeneratedEvent {
  type: 'bracket.generated';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: BracketGeneratedPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}
