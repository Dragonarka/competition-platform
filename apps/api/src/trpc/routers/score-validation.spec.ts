import { describe, it, expect } from 'vitest';
import { validateCriteriaScores, type CriterionDef } from './score-validation';

const baseCriteria: CriterionDef[] = [
  { id: 'c_flow', name: 'Flow', minScore: '0.00', maxScore: '10.00' },
  { id: 'c_delivery', name: 'Delivery', minScore: '1.00', maxScore: '5.00' },
];

describe('validateCriteriaScores', () => {
  it('returns ok for a valid, complete submission', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '8.50' },
      { criterionId: 'c_delivery', value: '4.00' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown criterionId', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '8.00' },
      { criterionId: 'c_unknown', value: '3.00' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('SCORE_OUTSIDE_RANGE');
      expect(result.error).toMatch(/Unknown criterion/);
    }
  });

  it('rejects when a required criterion is missing', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '8.00' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('SCORE_OUTSIDE_RANGE');
      expect(result.error).toMatch(/Missing score for criterion: Delivery/);
    }
  });

  it('rejects a value below the criterion min', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '5.00' },
      { criterionId: 'c_delivery', value: '0.50' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('SCORE_OUTSIDE_RANGE');
      expect(result.error).toMatch(/Delivery/);
    }
  });

  it('rejects a value above the criterion max', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '10.50' },
      { criterionId: 'c_delivery', value: '4.00' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('SCORE_OUTSIDE_RANGE');
      expect(result.error).toMatch(/Flow/);
    }
  });

  it('accepts boundary values (min and max inclusive)', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '0.00' },
      { criterionId: 'c_delivery', value: '5.00' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects when an unknown criterion appears even if all required ones are present', () => {
    const result = validateCriteriaScores(baseCriteria, [
      { criterionId: 'c_flow', value: '8.00' },
      { criterionId: 'c_delivery', value: '4.00' },
      { criterionId: 'c_extra', value: '5.00' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('returns ok for empty criteria + empty submission (no requirements to enforce)', () => {
    expect(validateCriteriaScores([], []).ok).toBe(true);
  });
});
