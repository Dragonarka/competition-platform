import { sumScores } from '@competition-platform/format-sdk';
import type {
  ScorePayload,
  AggregatedResult,
  CriterionBreakdownEntry,
} from '@competition-platform/format-sdk';

export function aggregateCypherScore(payload: ScorePayload): string {
  return sumScores(payload.scores.map((s) => s.value));
}

export function aggregateCompetitorScores(payloads: ScorePayload[]): AggregatedResult {
  if (payloads.length === 0) {
    return {
      competitorId: '',
      totalScore: '0.00',
      scoresByJudge: {},
      criteriaBreakdown: [],
    };
  }
  const competitorId = payloads[0].competitorId;
  const scoresByJudge: Record<string, string> = {};
  for (const p of payloads) {
    scoresByJudge[p.judgeId] = aggregateCypherScore(p);
  }
  const total = sumScores(Object.values(scoresByJudge));

  // Preserves first-seen order so callers get a stable display order.
  const orderedCriterionIds: string[] = [];
  const valuesByCriterion = new Map<string, string[]>();
  const judgeCountByCriterion = new Map<string, number>();
  for (const p of payloads) {
    for (const s of p.scores) {
      let bucket = valuesByCriterion.get(s.criterionId);
      if (bucket === undefined) {
        bucket = [];
        valuesByCriterion.set(s.criterionId, bucket);
        orderedCriterionIds.push(s.criterionId);
      }
      bucket.push(s.value);
      judgeCountByCriterion.set(s.criterionId, (judgeCountByCriterion.get(s.criterionId) ?? 0) + 1);
    }
  }
  const criteriaBreakdown: CriterionBreakdownEntry[] = orderedCriterionIds.map((criterionId) => ({
    criterionId,
    total: sumScores(valuesByCriterion.get(criterionId) ?? []),
    judgeCount: judgeCountByCriterion.get(criterionId) ?? 0,
  }));

  return { competitorId, totalScore: total, scoresByJudge, criteriaBreakdown };
}
