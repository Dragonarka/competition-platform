import type { ScoringSchema, ScorePayload } from './scoring.types';
import type { PhaseDefinition, FormatStateMachineConfig } from './phase.types';
import type { FormatUI } from './ui.types';

export type JudgeScoreVisibility = 'hidden' | 'after-submission' | 'after-phase';
export type JudgeGroupAssignment = 'random' | 'manual' | 'round-robin';

export interface TieBreakRule {
  type: 're-vote' | 'organizer-decision' | 'sudden-death';
  maxRounds?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CompetitionState {
  competitionId: string;
  currentPhase: string;
  participants: Record<string, unknown>;
  scores: Record<string, unknown>;
}

export interface FormatContext {
  competitionId: string;
  formatId: string;
  config: Record<string, unknown>;
}

export interface CompetitionFormat {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  domain: string;

  scoringSchema: ScoringSchema;
  phases: PhaseDefinition[];
  stateMachine: FormatStateMachineConfig;

  validators: {
    scoreValidator: (score: ScorePayload, context: FormatContext) => ValidationResult;
    phaseTransitionValidator: (
      from: string,
      to: string,
      state: CompetitionState,
    ) => ValidationResult;
  };

  fairnessRules: {
    judgeScoreVisibility: JudgeScoreVisibility;
    judgeGroupAssignment: JudgeGroupAssignment;
    tieBreaking: TieBreakRule[];
  };

  ui: FormatUI;
}
