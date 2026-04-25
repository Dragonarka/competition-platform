import type { CriterionDefinition } from '@competition-platform/format-sdk';

export const CYPHER_DEFAULT_CRITERIA: CriterionDefinition[] = [
  { id: 'musicality', name: 'Musicality', type: 'numeric', min: 0, max: 10, precision: 2 },
  { id: 'technique', name: 'Technique', type: 'numeric', min: 0, max: 10, precision: 2 },
  { id: 'creativity', name: 'Creativity', type: 'numeric', min: 0, max: 10, precision: 2 },
  {
    id: 'overall-impression',
    name: 'Overall Impression',
    type: 'numeric',
    min: 0,
    max: 10,
    precision: 2,
  },
];
