import type { PhaseDefinition } from '@competition-platform/format-sdk';

export const battlesPhase: PhaseDefinition = {
  id: 'battles',
  name: 'Battles Phase',
  type: 'voting',
  rules: {
    format: 'single-elimination',
    voteOptions: ['player1', 'player2', 'tie'],
    requireMajority: true,
  },
  advancementCriteria: {
    type: 'bracket-progression',
  },
};
