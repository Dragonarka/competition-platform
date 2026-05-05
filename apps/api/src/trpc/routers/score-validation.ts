// Shared score validator — used by both submitScore (Story 3.3) and
// overrideScore (Story 4.2). Extracted into a pure function so both
// procedures stay in lockstep and the rules can be unit-tested without
// the full mutation pipeline.

export interface CriterionDef {
  id: string;
  name: string;
  minScore: string;
  maxScore: string;
}

export interface SubmittedScore {
  criterionId: string;
  value: string;
}

export type ScoreValidationResult =
  | { ok: true }
  | { ok: false; error: string; errorCode: 'SCORE_OUTSIDE_RANGE' };

export function validateCriteriaScores(
  criteria: CriterionDef[],
  submitted: SubmittedScore[],
): ScoreValidationResult {
  const validIds = new Set(criteria.map((c) => c.id));

  // Reject unknown criterionIds — prevents junk payload from polluting
  // the jsonb column and downstream aggregations.
  for (const s of submitted) {
    if (!validIds.has(s.criterionId)) {
      return {
        ok: false,
        error: `Unknown criterion: ${s.criterionId}`,
        errorCode: 'SCORE_OUTSIDE_RANGE',
      };
    }
  }

  const submittedMap = new Map(submitted.map((s) => [s.criterionId, s.value]));
  for (const c of criteria) {
    const v = submittedMap.get(c.id);
    if (v === undefined) {
      return {
        ok: false,
        error: `Missing score for criterion: ${c.name}`,
        errorCode: 'SCORE_OUTSIDE_RANGE',
      };
    }
    const val = parseFloat(v);
    const min = parseFloat(c.minScore);
    const max = parseFloat(c.maxScore);
    if (val < min || val > max) {
      return {
        ok: false,
        error: `${c.name}: value ${v} must be between ${c.minScore} and ${c.maxScore}`,
        errorCode: 'SCORE_OUTSIDE_RANGE',
      };
    }
  }

  return { ok: true };
}
