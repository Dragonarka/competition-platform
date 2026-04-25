import type { CompetitionStartedPayload } from './tournament-events';
import type { ScoreSubmittedPayload } from './scoring-events';
import type { StandingsEntry } from '../types/standings.types';

export interface ServerToClientEvents {
  'competition.started': (data: CompetitionStartedPayload) => void;
  'score.submitted': (data: ScoreSubmittedPayload) => void;
  'standings.updated': (data: StandingsEntry[]) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'join.judge': (data: { competitionId: string; sessionId: string }) => void;
  'join.admin': (data: { competitionId: string }) => void;
  'join.public': (data: { competitionId: string }) => void;
}
