import type { CompetitionState, ValidationResult } from '@competition-platform/format-sdk';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['cypher'],
  cypher: ['advancement-review'],
  'advancement-review': ['battles'],
  battles: ['completed'],
  completed: [],
};

export function phaseTransitionValidator(
  from: string,
  to: string,
  _state: CompetitionState,
): ValidationResult {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      valid: false,
      errors: [
        `Invalid phase transition: ${from} → ${to}. Allowed from "${from}": [${allowed.join(', ')}]`,
      ],
    };
  }
  return { valid: true, errors: [] };
}
