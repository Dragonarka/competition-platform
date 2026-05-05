'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

interface CriterionDef {
  id: string;
  name: string;
  min: number;
  max: number;
}

interface ScoreOverrideFormProps {
  scoreId: string;
  competitorName: string;
  judgeLabel: string;
  criteria: CriterionDef[];
  currentScores: Record<string, string>;
  onCancel: () => void;
  onSuccess: () => void;
}

function isValidValue(value: string, c: CriterionDef): boolean {
  if (value.trim().length === 0) return false;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return false;
  return n >= c.min && n <= c.max;
}

export function ScoreOverrideForm({
  scoreId,
  competitorName,
  judgeLabel,
  criteria,
  currentScores,
  onCancel,
  onSuccess,
}: ScoreOverrideFormProps) {
  const [values, setValues] = useState<Record<string, string>>({ ...currentScores });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const overrideMutation = trpc.tournament.overrideScore.useMutation({
    onSuccess: () => {
      void utils.tournament.listScoresForOverride.invalidate();
      void utils.tournament.getStandings.invalidate();
      onSuccess();
    },
    onError: (err) => setError(err.message),
  });

  // Derive Save-disabled state directly from inputs (no useEffect / mirrored state).
  const allValuesValid = criteria.every((c) => isValidValue(values[c.id] ?? '', c));
  const reasonOk = reason.trim().length > 0 && reason.trim().length <= 500;
  const canSave = allValuesValid && reasonOk && !overrideMutation.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    const newScores = criteria.map((c) => ({
      criterionId: c.id,
      value: parseFloat(values[c.id]!).toFixed(2),
    }));
    overrideMutation.mutate({ scoreId, newScores, reason: reason.trim() });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border rounded p-4 space-y-3 bg-background"
    >
      <div>
        <p className="text-sm font-medium">
          Override score: <strong>{competitorName}</strong>{' '}
          <span className="text-muted-foreground">by {judgeLabel}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Overrides use the current evaluation criteria configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {criteria.map((c) => (
          <label key={c.id} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {c.name}{' '}
              <span className="text-xs text-muted-foreground">
                ({c.min.toFixed(2)}–{c.max.toFixed(2)})
              </span>
            </span>
            <input
              type="number"
              step="0.01"
              min={c.min}
              max={c.max}
              value={values[c.id] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
              className="border border-input rounded px-2 py-1 text-sm font-mono"
            />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Reason <span className="text-destructive">*</span>
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          required
          className="border border-input rounded px-2 py-1 text-sm"
          placeholder="Why is this score being modified?"
        />
        <span className="text-xs text-muted-foreground">{reason.trim().length}/500</span>
      </label>

      {error && (
        <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSave}>
          {overrideMutation.isPending ? 'Saving...' : 'Save override'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={overrideMutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
