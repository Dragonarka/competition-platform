export interface EvaluationCriterion {
  id: string;
  competitionId: string;
  name: string;
  minScore: string;
  maxScore: string;
  precision: number;
  displayOrder: number;
  createdAt: Date;
}
