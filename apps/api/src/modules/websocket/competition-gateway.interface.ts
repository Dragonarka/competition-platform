import type {
  BracketAdvancedPayload,
  BracketGeneratedPayload,
  CompetitionCompletedPayload,
  CompetitionStartedPayload,
  MatchupCompletedPayload,
  MatchupRevoteRequiredPayload,
  MatchupTieResolutionRequiredPayload,
  PhaseTransitionedPayload,
  ScoreSubmittedPayload,
  ScoreOverriddenPayload,
  VoteSubmittedPayload,
  CompetitorWithdrawnPayload,
  CompetitorRescuedPayload,
  StandingsEntry,
  JudgeLiveStatus,
} from '@competition-platform/shared';

export interface ICompetitionGateway {
  broadcastCompetitionStarted(
    competitionId: string,
    payload: CompetitionStartedPayload,
  ): void;
  broadcastScoreSubmitted(
    competitionId: string,
    payload: ScoreSubmittedPayload,
  ): void;
  broadcastScoreOverridden(
    competitionId: string,
    payload: ScoreOverriddenPayload,
  ): void;
  broadcastStandingsUpdated(
    competitionId: string,
    standings: StandingsEntry[],
  ): void;
  broadcastPhaseTransitioned(
    competitionId: string,
    payload: PhaseTransitionedPayload,
  ): void;
  broadcastBracketGenerated(
    competitionId: string,
    payload: BracketGeneratedPayload,
  ): void;
  broadcastVoteSubmitted(
    competitionId: string,
    payload: VoteSubmittedPayload,
  ): void;
  broadcastMatchupCompleted(
    competitionId: string,
    payload: MatchupCompletedPayload,
  ): void;
  broadcastMatchupRevoteRequired(
    competitionId: string,
    payload: MatchupRevoteRequiredPayload,
  ): void;
  broadcastMatchupTieResolutionRequired(
    competitionId: string,
    payload: MatchupTieResolutionRequiredPayload,
  ): void;
  broadcastBracketAdvanced(
    competitionId: string,
    payload: BracketAdvancedPayload,
  ): void;
  broadcastCompetitionCompleted(
    competitionId: string,
    payload: CompetitionCompletedPayload,
  ): void;
  broadcastJudgeStatusChanged(
    competitionId: string,
    status: JudgeLiveStatus,
  ): void;
  broadcastCompetitorWithdrawn(
    competitionId: string,
    payload: CompetitorWithdrawnPayload,
  ): void;
  broadcastCompetitorRescued(
    competitionId: string,
    payload: CompetitorRescuedPayload,
  ): void;
  getJudgePresence(competitionId: string): JudgeLiveStatus[];
  clearPresence(competitionId: string): void;
}
