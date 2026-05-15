import { createFormat } from '@competition-platform/format-sdk';
import type {
  CompetitionFormat,
  CriterionDefinition,
  JudgeScoreVisibility,
  JudgeGroupAssignment,
  PhaseDefinition,
  FormatStateMachineConfig,
  TieBreakRule,
  ValidationResult,
  ScorePayload,
  CompetitionState,
} from '@competition-platform/format-sdk';

// Self-contained vote criterion. Mirrors the head-to-head shape used in
// cypher-battles' battles phase so the existing submitVote / matchup pipeline
// works unchanged. Duplicated here on purpose — a format plugin shouldn't
// depend on another format plugin.
export const SIMPLE_BRACKET_VOTE_CRITERION: CriterionDefinition = {
  id: 'simple-bracket-vote',
  name: 'Bracket Vote',
  type: 'vote',
  min: 0,
  max: 2,
  precision: 0,
};

export const simpleBracketPhase: PhaseDefinition = {
  id: 'bracket',
  name: 'Bracket',
  type: 'voting',
  rules: {
    format: 'single-elimination',
    seedingStrategy: 'registration-order',
    voteOptions: ['player1', 'player2', 'tie'],
    requireMajority: true,
  },
  advancementCriteria: {
    type: 'bracket-progression',
  },
};

export const simpleBracketStateMachine: FormatStateMachineConfig = {
  initial: 'draft',
  states: {
    draft: { on: { START_BRACKET: 'bracket' } },
    bracket: { on: { COMPLETE_BRACKET: 'completed' } },
    completed: { type: 'final' },
  },
};

const TIE_BREAKING_RULES: TieBreakRule[] = [
  { type: 're-vote', maxRounds: 1 },
  { type: 'organizer-decision' },
];

const JUDGE_VISIBILITY: JudgeScoreVisibility = 'after-phase';
const JUDGE_GROUPS: JudgeGroupAssignment = 'round-robin';

export const simpleBracketFormat: CompetitionFormat = createFormat({
  id: 'simple-bracket',
  name: 'Simple Bracket',
  version: '1.0.0',
  description:
    'Single-elimination bracket straight from the registration list. Seeded in registration order; symmetric NCAA-style pairings; byes auto-advance.',
  author: 'competition-platform',
  domain: 'general',

  scoringSchema: {
    criteria: [SIMPLE_BRACKET_VOTE_CRITERION],
    aggregation: 'sum',
  },

  phases: [simpleBracketPhase],

  stateMachine: simpleBracketStateMachine,

  validators: {
    // Vote payloads are the only scoring artefact here; full vote-shape
    // validation lives in the API layer (submitVote zod schema). At the
    // format level we just confirm the score belongs to our criterion.
    scoreValidator(score: ScorePayload): ValidationResult {
      const errors: string[] = [];
      const unknown = score.scores
        .map((s) => s.criterionId)
        .filter((id) => id !== SIMPLE_BRACKET_VOTE_CRITERION.id);
      if (unknown.length > 0) {
        errors.push(`Unknown criterionId(s) for simple-bracket: ${unknown.join(', ')}`);
      }
      return { valid: errors.length === 0, errors };
    },
    phaseTransitionValidator(from: string, to: string, _state: CompetitionState): ValidationResult {
      const allowed = simpleBracketStateMachine.states[from]?.on ?? {};
      const valid = Object.values(allowed).includes(to);
      return {
        valid,
        errors: valid ? [] : [`Transition ${from} → ${to} is not defined`],
      };
    },
  },

  fairnessRules: {
    judgeScoreVisibility: JUDGE_VISIBILITY,
    judgeGroupAssignment: JUDGE_GROUPS,
    tieBreaking: TIE_BREAKING_RULES,
  },

  ui: {
    judgeInput: {
      component: 'JudgeVoteInput',
      requiredPlatformHooks: ['useSocket', 'useOfflineQueue', 'useJudgeSession'],
    },
    publicDisplay: {
      component: 'PublicBracket',
      requiredPlatformHooks: ['useSocket'],
    },
    adminConfig: {
      component: 'AdminConfig',
      requiredPlatformHooks: [],
    },
  },
});
