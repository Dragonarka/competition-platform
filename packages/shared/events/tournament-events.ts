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

export interface MatchupTallySnapshot {
  player1: number;
  player2: number;
  tie: number;
  total: number;
}

export interface MatchupCompletedPayload {
  competitionId: string;
  matchupId: string;
  roundNumber: number;
  bracketPosition: number;
  winnerCompetitorId: string;
  tally: MatchupTallySnapshot;
  advancedFromTie: boolean;
  organizerDecisionReason: string | null;
  completedAt: string; // ISO 8601
}

export interface MatchupCompletedEvent {
  type: 'matchup.completed';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: MatchupCompletedPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}

export interface MatchupRevoteRequiredPayload {
  competitionId: string;
  matchupId: string;
  revoteCount: number;
  tally: MatchupTallySnapshot;
  detectedAt: string; // ISO 8601
}

export interface MatchupRevoteRequiredEvent {
  type: 'matchup.revote-required';
  aggregateId: string;
  aggregateType: 'competition';
  payload: MatchupRevoteRequiredPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}

export interface MatchupTieResolutionRequiredPayload {
  competitionId: string;
  matchupId: string;
  tally: MatchupTallySnapshot;
  detectedAt: string; // ISO 8601
}

export interface MatchupTieResolutionRequiredEvent {
  type: 'matchup.tie-resolution-required';
  aggregateId: string;
  aggregateType: 'competition';
  payload: MatchupTieResolutionRequiredPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}

export interface BracketAdvancedPayload {
  competitionId: string;
  roundNumber: number; // the NEW round being materialized
  matchups: BracketMatchupSnapshot[];
  advancedAt: string; // ISO 8601
}

export interface BracketAdvancedEvent {
  type: 'bracket.advanced';
  aggregateId: string;
  aggregateType: 'competition';
  payload: BracketAdvancedPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}

export interface CompetitionCompletedPayload {
  competitionId: string;
  championCompetitorId: string;
  completedAt: string; // ISO 8601
}

export interface CompetitionCompletedEvent {
  type: 'competition.completed';
  aggregateId: string;
  aggregateType: 'competition';
  payload: CompetitionCompletedPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}
