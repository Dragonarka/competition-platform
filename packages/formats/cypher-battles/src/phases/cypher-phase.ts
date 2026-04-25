import type { PhaseDefinition } from '@competition-platform/format-sdk';

export const cypherPhase: PhaseDefinition = {
  id: 'cypher',
  name: 'Cypher Phase',
  type: 'scoring',
  rules: {
    allowPartnerRotation: true,
    scoreVisibility: 'after-phase',
    submissionIdempotent: true,
  },
  advancementCriteria: {
    type: 'top-n',
  },
};
