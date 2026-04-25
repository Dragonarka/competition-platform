export type CriterionType = 'numeric' | 'vote' | 'ranking';
export type AggregationRule = 'weighted-average' | 'sum' | 'median' | 'custom';

export interface CriterionDefinition {
  id: string;
  name: string;
  type: CriterionType;
  min: number;
  max: number;
  precision: number;
  weight?: number;
}

export interface ScoreValue {
  criterionId: string;
  value: string;
}

export interface ScorePayload {
  judgeId: string;
  competitorId: string;
  roundId: string;
  scores: ScoreValue[];
  idempotencyKey: string;
}

export interface AggregatedResult {
  competitorId: string;
  totalScore: string;
  scoresByJudge: Record<string, string>;
}

export interface ScoringSchema {
  criteria: CriterionDefinition[];
  aggregation: AggregationRule;
  customAggregator?: (scores: ScorePayload[]) => AggregatedResult[];
}
