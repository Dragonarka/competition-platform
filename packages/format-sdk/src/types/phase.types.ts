export type PhaseType = 'scoring' | 'voting' | 'bracket' | 'custom';

export interface AdvancementCriteria {
  type: 'top-n' | 'threshold' | 'all' | 'bracket-progression';
  value?: number;
}

export interface PhaseDefinition {
  id: string;
  name: string;
  type: PhaseType;
  rules: Record<string, unknown>;
  advancementCriteria: AdvancementCriteria;
}

export interface StateConfig {
  on?: Record<string, string>;
  type?: 'final';
}

export interface FormatStateMachineConfig {
  initial: string;
  states: Record<string, StateConfig>;
}
