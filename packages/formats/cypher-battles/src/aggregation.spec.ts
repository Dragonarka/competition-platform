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
  });
});
