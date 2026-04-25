import { createFormat } from '@competition-platform/format-sdk';
import type { CompetitionFormat } from '@competition-platform/format-sdk';
import { CYPHER_DEFAULT_CRITERIA } from './scoring/cypher-scoring.schema';
import { BATTLES_VOTE_CRITERION } from './scoring/battles-voting.schema';
import { cypherPhase } from './phases/cypher-phase';
import { battlesPhase } from './phases/battles-phase';
import { cypherBattlesStateMachine } from './phases/state-machine';
import { scoreValidator } from './validators/score-validator';
import { phaseTransitionValidator } from './validators/transition-validator';
import {
  CYPHER_JUDGE_SCORE_VISIBILITY,
  CYPHER_JUDGE_GROUP_ASSIGNMENT,
  CYPHER_TIE_BREAKING_RULES,
} from './fairness/cypher-fairness-rules';

export const cypherBattlesFormat: CompetitionFormat = createFormat({
  id: 'cypher-battles',
  name: 'Cypher Battles',
  version: '1.0.0',
  description:
    'Two-phase dance competition: Cypher (numeric scoring) → Battles (head-to-head voting)',
  author: 'competition-platform',
  domain: 'dance',

  scoringSchema: {
    criteria: [...CYPHER_DEFAULT_CRITERIA, BATTLES_VOTE_CRITERION],
    aggregation: 'sum',
  },

  phases: [cypherPhase, battlesPhase],

  stateMachine: cypherBattlesStateMachine,

  validators: {
    scoreValidator,
    phaseTransitionValidator,
  },

  fairnessRules: {
    judgeScoreVisibility: CYPHER_JUDGE_SCORE_VISIBILITY,
    judgeGroupAssignment: CYPHER_JUDGE_GROUP_ASSIGNMENT,
    tieBreaking: CYPHER_TIE_BREAKING_RULES,
  },

  ui: {
    judgeInput: {
      component: 'JudgeScoreInput',
      requiredPlatformHooks: ['useSocket', 'useOfflineQueue', 'useJudgeSession'],
    },
    publicDisplay: {
      component: 'PublicStandings',
      requiredPlatformHooks: ['useSocket'],
    },
    adminConfig: {
      component: 'AdminConfig',
      requiredPlatformHooks: [],
    },
    presenterView: {
      component: 'PresenterView',
      requiredPlatformHooks: ['useSocket'],
    },
  },
});
