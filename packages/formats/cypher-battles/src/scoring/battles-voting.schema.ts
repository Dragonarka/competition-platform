import type { CriterionDefinition } from '@competition-platform/format-sdk';

export const BATTLES_VOTE_CRITERION: CriterionDefinition = {
  id: 'battles-vote',
  name: 'Battles Vote',
  type: 'vote',
  min: 0,
  max: 2,
  precision: 0,
};
