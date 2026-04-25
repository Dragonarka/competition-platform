import type { FormatStateMachineConfig } from '@competition-platform/format-sdk';

export const cypherBattlesStateMachine: FormatStateMachineConfig = {
  initial: 'draft',
  states: {
    draft: {
      on: { START_CYPHER: 'cypher' },
    },
    cypher: {
      on: { COMPLETE_CYPHER: 'advancement-review' },
    },
    'advancement-review': {
      on: { CONFIRM_ADVANCEMENT: 'battles' },
    },
    battles: {
      on: { COMPLETE_BATTLES: 'completed' },
    },
    completed: {
      type: 'final',
    },
  },
};
