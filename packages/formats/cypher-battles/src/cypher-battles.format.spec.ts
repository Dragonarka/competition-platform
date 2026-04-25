import { describe, it, expect } from 'vitest';
import { validateFormat } from '@competition-platform/format-sdk';
import { cypherBattlesFormat } from './cypher-battles.format';

describe('cypherBattlesFormat SDK validation', () => {
  const report = validateFormat(cypherBattlesFormat);

  it('passes all 5 validation gates', () => {
    if (!report.valid) {
      const failedGates = Object.entries(report.gates)
        .filter(([, g]) => !g.passed)
        .map(([name, g]) => `${name}: ${g.errors.join('; ')}`);
      throw new Error(`Format validation failed:\n${failedGates.join('\n')}`);
    }
    expect(report.valid).toBe(true);
  });

  it('gate 1: interface compliance passes', () => {
    expect(report.gates.interfaceCompliance.passed).toBe(true);
  });

  it('gate 2: schema consistency passes (min < max, precision 2)', () => {
    expect(report.gates.schemaConsistency.passed).toBe(true);
  });

  it('gate 3: state machine reachability passes (all states reachable, terminal state defined)', () => {
    expect(report.gates.stateMachineReachability.passed).toBe(true);
  });

  it('gate 4: UI component manifests are valid', () => {
    expect(report.gates.uiComponentRendering.passed).toBe(true);
  });

  it('gate 5: fairness rules consistency passes', () => {
    expect(report.gates.fairnessRulesConsistency.passed).toBe(true);
  });

  it('format id is cypher-battles', () => {
    expect(cypherBattlesFormat.id).toBe('cypher-battles');
  });

  it('all numeric criteria have precision 2', () => {
    for (const c of cypherBattlesFormat.scoringSchema.criteria) {
      if (c.type === 'numeric') {
        expect(c.precision).toBe(2);
      }
    }
  });

  it('all numeric criteria have min < max', () => {
    for (const c of cypherBattlesFormat.scoringSchema.criteria) {
      if (c.type === 'numeric') {
        expect(c.min).toBeLessThan(c.max);
      }
    }
  });

  it('state machine has completed as terminal state', () => {
    expect(cypherBattlesFormat.stateMachine.states.completed?.type).toBe('final');
  });

  it('state machine initial state is draft', () => {
    expect(cypherBattlesFormat.stateMachine.initial).toBe('draft');
  });
});
