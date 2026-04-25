import { describe, it, expect } from 'vitest';
import { scoreValidator } from './validators/score-validator';
import { phaseTransitionValidator } from './validators/transition-validator';
import type {
  ScorePayload,
  FormatContext,
  CompetitionState,
} from '@competition-platform/format-sdk';

const mockContext: FormatContext = {
  competitionId: 'comp-1',
  formatId: 'cypher-battles',
  config: {},
};

const mockState: CompetitionState = {
  competitionId: 'comp-1',
  currentPhase: 'cypher',
  participants: {},
  scores: {},
};

describe('scoreValidator', () => {
  it('accepts valid scores within range', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [
        { criterionId: 'musicality', value: '8.50' },
        { criterionId: 'technique', value: '7.00' },
      ],
      idempotencyKey: 'key-1',
    };
    const result = scoreValidator(payload, mockContext);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects score above max', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [{ criterionId: 'musicality', value: '11.00' }],
      idempotencyKey: 'key-2',
    };
    const result = scoreValidator(payload, mockContext);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects score below min', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [{ criterionId: 'technique', value: '-1.00' }],
      idempotencyKey: 'key-3',
    };
    const result = scoreValidator(payload, mockContext);
    expect(result.valid).toBe(false);
  });

  it('rejects score with wrong decimal format', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [{ criterionId: 'musicality', value: '8.5' }],
      idempotencyKey: 'key-4',
    };
    const result = scoreValidator(payload, mockContext);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('2 decimal places'))).toBe(true);
  });

  it('passes unknown criteria through without error', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [{ criterionId: 'custom-criterion', value: '5.00' }],
      idempotencyKey: 'key-5',
    };
    const result = scoreValidator(payload, mockContext);
    expect(result.valid).toBe(true);
  });
});

describe('phaseTransitionValidator', () => {
  it('allows draft → cypher', () => {
    const result = phaseTransitionValidator('draft', 'cypher', mockState);
    expect(result.valid).toBe(true);
  });

  it('allows cypher → advancement-review', () => {
    const result = phaseTransitionValidator('cypher', 'advancement-review', mockState);
    expect(result.valid).toBe(true);
  });

  it('allows advancement-review → battles', () => {
    const result = phaseTransitionValidator('advancement-review', 'battles', mockState);
    expect(result.valid).toBe(true);
  });

  it('allows battles → completed', () => {
    const result = phaseTransitionValidator('battles', 'completed', mockState);
    expect(result.valid).toBe(true);
  });

  it('rejects draft → battles (skipping phases)', () => {
    const result = phaseTransitionValidator('draft', 'battles', mockState);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid phase transition');
  });

  it('rejects completed → anything', () => {
    const result = phaseTransitionValidator('completed', 'cypher', mockState);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown source phase', () => {
    const result = phaseTransitionValidator('unknown', 'cypher', mockState);
    expect(result.valid).toBe(false);
  });
});
