import type {
  BracketGeneratedPayload,
  CompetitionStartedPayload,
  PhaseTransitionedPayload,
} from './tournament-events';
import type {
  ScoreSubmittedPayload,
  ScoreOverriddenPayload,
  VoteSubmittedPayload,
} from './scoring-events';
import type { CompetitorWithdrawnPayload, CompetitorRescuedPayload } from './competitor-events';
import type { StandingsEntry } from '../types/standings.types';
import type { JudgeLiveStatus } from '../types/judge-live-status';

export interface ServerToClientEvents {
  'competition.started': (data: CompetitionStartedPayload) => void;
  'score.submitted': (data: ScoreSubmittedPayload) => void;
  'score.overridden': (data: ScoreOverriddenPayload) => void;
  'standings.updated': (data: StandingsEntry[]) => void;
  'phase.transitioned': (data: PhaseTransitionedPayload) => void;
  'bracket.generated': (data: BracketGeneratedPayload) => void;
  'vote.submitted': (data: VoteSubmittedPayload) => void;
  'judge.status-changed': (data: JudgeLiveStatus) => void;
  'competitor.withdrawn': (data: CompetitorWithdrawnPayload) => void;
  'competitor.rescued': (data: CompetitorRescuedPayload) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'join.judge': (data: { competitionId: string; sessionId: string }) => void;
  'join.admin': (data: { competitionId: string }) => void;
  'join.public': (data: { competitionId: string }) => void;
  'judge.status': (data: { competitionId: string; sessionId: string; queueSize: number }) => void;
}
