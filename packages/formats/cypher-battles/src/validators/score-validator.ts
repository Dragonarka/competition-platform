import { validateScoreString } from '@competition-platform/format-sdk';
import type {
  ScorePayload,
  FormatContext,
  ValidationResult,
} from '@competition-platform/format-sdk';
import { CYPHER_DEFAULT_CRITERIA } from '../scoring/cypher-scoring.schema';

export function scoreValidator(score: ScorePayload, _context: FormatContext): ValidationResult {
  const errors: string[] = [];
  for (const sv of score.scores) {
    const criterion = CYPHER_DEFAULT_CRITERIA.find((c) => c.id === sv.criterionId);
    if (!criterion) {
      continue;
    }
    if (!/^\d+\.\d{2}$/.test(sv.value)) {
      errors.push(
        `Criterion "${sv.criterionId}": value "${sv.value}" must be formatted as a string with exactly 2 decimal places (e.g. "8.75")`,
      );
    } else if (!validateScoreString(sv.value, criterion.min, criterion.max)) {
      errors.push(
        `Criterion "${sv.criterionId}": value "${sv.value}" must be between ${criterion.min} and ${criterion.max}`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
