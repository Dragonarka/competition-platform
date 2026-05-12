'use client';
import { useState } from 'react';

export interface JudgeScoreInputLabels {
  /** Label preceding the participant ID. */
  idPrefix: string;
  /** Suffix that follows each criterion label, e.g. " (0–10)". */
  rangeFormat: (min: number, max: number) => string;
  /** Error rendered when a criterion value is missing or outside range. */
  outOfRange: (criterion: string, min: number, max: number) => string;
  /** In-flight submit button text. */
  submitting: string;
  /** Idle submit button text. */
  submit: string;
}

const DEFAULT_LABELS: JudgeScoreInputLabels = {
  idPrefix: 'ID:',
  rangeFormat: (min, max) => ` (${min}–${max})`,
  outOfRange: (name, min, max) => `${name}: enter a value between ${min} and ${max}`,
  submitting: 'Submitting...',
  submit: 'Submit Score',
};

export interface JudgeScoreInputProps {
  competitorId: string;
  competitorName: string;
  participantId: string;
  criteria: Array<{ id: string; name: string; min: number; max: number }>;
  defaultValues?: Record<string, string>;
  onSubmit: (scores: Record<string, string>) => void | Promise<void>;
  onValuesChange?: (values: Record<string, string>) => void;
  disabled?: boolean;
  /**
   * User-facing strings supplied by the host. Optional with English-language
   * defaults so existing tests and consumers render without explicit wiring.
   * Production hosts pass translated strings.
   */
  labels?: Partial<JudgeScoreInputLabels>;
}

export function JudgeScoreInput({
  competitorName,
  participantId,
  criteria,
  defaultValues = {},
  onSubmit,
  onValuesChange,
  disabled = false,
  labels,
}: JudgeScoreInputProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [values, setValues] = useState<Record<string, string>>(defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(criterionId: string, raw: string) {
    const next = { ...values, [criterionId]: raw };
    setValues(next);
    setError(null);
    onValuesChange?.(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const c of criteria) {
      const v = parseFloat(values[c.id] ?? '');
      if (isNaN(v) || v < c.min || v > c.max) {
        setError(l.outOfRange(c.name, c.min, c.max));
        return;
      }
    }
    const formatted = Object.fromEntries(
      criteria.map((c) => [c.id, parseFloat(values[c.id]!).toFixed(2)]),
    );
    setSubmitting(true);
    try {
      await onSubmit(formatted);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="mb-2">
        <p className="text-lg font-bold">{competitorName}</p>
        <p className="text-sm text-muted-foreground">
          {l.idPrefix} {participantId}
        </p>
      </div>
      {criteria.map((c) => (
        <div key={c.id} className="flex flex-col gap-1">
          <label htmlFor={c.id} className="font-medium text-sm">
            {c.name}
            {l.rangeFormat(c.min, c.max)}
          </label>
          <input
            id={c.id}
            type="number"
            min={c.min}
            max={c.max}
            step="0.01"
            value={values[c.id] ?? ''}
            onChange={(e) => handleChange(c.id, e.target.value)}
            disabled={disabled || submitting}
            className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-xl font-semibold"
            required
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || submitting}
        className="min-h-[56px] w-full rounded-md bg-primary text-primary-foreground font-bold text-lg disabled:opacity-50"
      >
        {submitting ? l.submitting : l.submit}
      </button>
    </form>
  );
}
