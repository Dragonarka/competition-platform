import type {
  CompetitionStartedPayload,
  ScoreSubmittedPayload,
  StandingsEntry,
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
  broadcastStandingsUpdated(
    competitionId: string,
    standings: StandingsEntry[],
  ): void;
}
