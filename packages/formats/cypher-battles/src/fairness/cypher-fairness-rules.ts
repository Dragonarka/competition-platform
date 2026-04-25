import type {
  TieBreakRule,
  JudgeScoreVisibility,
  JudgeGroupAssignment,
} from '@competition-platform/format-sdk';

export const CYPHER_JUDGE_SCORE_VISIBILITY: JudgeScoreVisibility = 'after-phase';
export const CYPHER_JUDGE_GROUP_ASSIGNMENT: JudgeGroupAssignment = 'round-robin';
export const CYPHER_TIE_BREAKING_RULES: TieBreakRule[] = [
  { type: 're-vote', maxRounds: 1 },
  { type: 'organizer-decision' },
];
