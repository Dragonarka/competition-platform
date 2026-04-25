import { sumScores } from '@competition-platform/format-sdk';
import type { ScorePayload, AggregatedResult } from '@competition-platform/format-sdk';

export function aggregateCypherScore(payload: ScorePayload): string {
  return sumScores(payload.scores.map((s) => s.value));
}

export function aggregateCompetitorScores(payloads: ScorePayload[]): AggregatedResult {
  if (payloads.length === 0) {
    return { competitorId: '', totalScore: '0.00', scoresByJudge: {} };
  }
  const competitorId = payloads[0].competitorId;
  const scoresByJudge: Record<string, string> = {};
  for (const p of payloads) {
    scoresByJudge[p.judgeId] = aggregateCypherScore(p);
  }
  const total = sumScores(Object.values(scoresByJudge));
  return { competitorId, totalScore: total, scoresByJudge };
}
