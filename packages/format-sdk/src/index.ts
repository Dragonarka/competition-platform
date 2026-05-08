export type {
  CompetitionFormat,
  ValidationResult,
  CompetitionState,
  FormatContext,
  JudgeScoreVisibility,
  JudgeGroupAssignment,
  TieBreakRule,
} from './types/format.types';
export type {
  CriterionDefinition,
  CriterionType,
  AggregationRule,
  ScorePayload,
  ScoreValue,
  AggregatedResult,
  CriterionBreakdownEntry,
  ScoringSchema,
} from './types/scoring.types';
export type {
  PhaseDefinition,
  PhaseType,
  AdvancementCriteria,
  FormatStateMachineConfig,
  StateConfig,
} from './types/phase.types';
export type { ComponentManifest, FormatUI } from './types/ui.types';
export { createFormat } from './helpers/create-format';
export {
  addScores,
  sumScores,
  formatScore,
  validateScoreString,
  compareScores,
} from './helpers/score-utils';
export { validateFormat } from './testing/validate-format';
export type { FormatValidationReport, GateResult } from './testing/validate-format';
