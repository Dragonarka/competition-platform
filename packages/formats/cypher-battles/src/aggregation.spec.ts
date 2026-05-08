import { describe, it, expect } from 'vitest';
import { aggregateCypherScore, aggregateCompetitorScores } from './scoring/aggregation';
import type { ScorePayload } from '@competition-platform/format-sdk';

describe('aggregateCypherScore', () => {
  it('sums all criterion scores for a single submission', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [
        { criterionId: 'musicality', value: '8.00' },
        { criterionId: 'technique', value: '7.50' },
        { criterionId: 'creativity', value: '9.00' },
      ],
      idempotencyKey: 'key-1',
    };
    expect(aggregateCypherScore(payload)).toBe('24.50');
  });

  it('returns 0.00 for empty scores array', () => {
    const payload: ScorePayload = {
      judgeId: 'j1',
      competitorId: 'c1',
      roundId: 'r1',
      scores: [],
      idempotencyKey: 'key-2',
    };
    expect(aggregateCypherScore(payload)).toBe('0.00');
  });
});

describe('aggregateCompetitorScores', () => {
  it('aggregates scores from multiple judges', () => {
    const payloads: ScorePayload[] = [
      {
        judgeId: 'j1',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [{ criterionId: 'musicality', value: '8.00' }],
        idempotencyKey: 'key-1',
      },
      {
        judgeId: 'j2',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [{ criterionId: 'musicality', value: '7.00' }],
        idempotencyKey: 'key-2',
      },
    ];
    const result = aggregateCompetitorScores(payloads);
    expect(result.competitorId).toBe('c1');
    expect(result.totalScore).toBe('15.00');
    expect(result.scoresByJudge['j1']).toBe('8.00');
    expect(result.scoresByJudge['j2']).toBe('7.00');
  });

  it('returns empty result for no payloads', () => {
    const result = aggregateCompetitorScores([]);
    expect(result.competitorId).toBe('');
    expect(result.totalScore).toBe('0.00');
    expect(result.scoresByJudge).toEqual({});
    expect(result.criteriaBreakdown).toEqual([]);
  });

  it('Story 6.1: criteriaBreakdown for a single judge with multiple criteria', () => {
    const payloads: ScorePayload[] = [
      {
        judgeId: 'j1',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [
          { criterionId: 'foundations', value: '8.50' },
          { criterionId: 'musicality', value: '7.75' },
          { criterionId: 'style', value: '9.00' },
        ],
        idempotencyKey: 'k-1',
      },
    ];
    const result = aggregateCompetitorScores(payloads);
    expect(result.criteriaBreakdown).toEqual([
      { criterionId: 'foundations', total: '8.50', judgeCount: 1 },
      { criterionId: 'musicality', total: '7.75', judgeCount: 1 },
      { criterionId: 'style', total: '9.00', judgeCount: 1 },
    ]);
  });

  it('Story 6.1: criteriaBreakdown sums across multiple judges', () => {
    const payloads: ScorePayload[] = [
      {
        judgeId: 'j1',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [
          { criterionId: 'foundations', value: '8.00' },
          { criterionId: 'style', value: '9.00' },
        ],
        idempotencyKey: 'k-1',
      },
      {
        judgeId: 'j2',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [
          { criterionId: 'foundations', value: '7.50' },
          { criterionId: 'style', value: '8.50' },
        ],
        idempotencyKey: 'k-2',
      },
      {
        judgeId: 'j3',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [
          { criterionId: 'foundations', value: '9.00' },
          { criterionId: 'style', value: '8.00' },
        ],
        idempotencyKey: 'k-3',
      },
    ];
    const result = aggregateCompetitorScores(payloads);
    expect(result.criteriaBreakdown).toEqual([
      { criterionId: 'foundations', total: '24.50', judgeCount: 3 },
      { criterionId: 'style', total: '25.50', judgeCount: 3 },
    ]);
  });

  it('Story 6.1: criteriaBreakdown handles judges who score different criterion sets', () => {
    const payloads: ScorePayload[] = [
      {
        judgeId: 'j1',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [
          { criterionId: 'c1', value: '8.00' },
          { criterionId: 'c2', value: '7.00' },
        ],
        idempotencyKey: 'k-1',
      },
      {
        judgeId: 'j2',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [
          { criterionId: 'c1', value: '6.00' },
          { criterionId: 'c3', value: '9.00' },
        ],
        idempotencyKey: 'k-2',
      },
    ];
    const result = aggregateCompetitorScores(payloads);
    expect(result.criteriaBreakdown).toEqual([
      { criterionId: 'c1', total: '14.00', judgeCount: 2 },
      { criterionId: 'c2', total: '7.00', judgeCount: 1 },
      { criterionId: 'c3', total: '9.00', judgeCount: 1 },
    ]);
  });

  it('Story 6.1: existing totalScore + scoresByJudge regression - both still populated', () => {
    const payloads: ScorePayload[] = [
      {
        judgeId: 'j1',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [{ criterionId: 'musicality', value: '8.00' }],
        idempotencyKey: 'k-1',
      },
      {
        judgeId: 'j2',
        competitorId: 'c1',
        roundId: 'r1',
        scores: [{ criterionId: 'musicality', value: '7.00' }],
        idempotencyKey: 'k-2',
      },
    ];
    const result = aggregateCompetitorScores(payloads);
    expect(result.totalScore).toBe('15.00');
    expect(result.scoresByJudge).toEqual({ j1: '8.00', j2: '7.00' });
    // and breakdown is also there
    expect(result.criteriaBreakdown).toEqual([
      { criterionId: 'musicality', total: '15.00', judgeCount: 2 },
    ]);
  });
});
