'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

interface SoloScoringPanelProps {
  competitionId: string;
}

interface CriterionDef {
  id: string;
  name: string;
  min: number;
  max: number;
}

function isValidValue(value: string, c: CriterionDef): boolean {
  if (value.trim().length === 0) return false;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return false;
  return n >= c.min && n <= c.max;
}

interface CompetitorScoringRowProps {
  competitorId: string;
  competitorName: string;
  participantId: string;
  criteria: CriterionDef[];
  competitionId: string;
  alreadyScored: boolean;
}

function CompetitorScoringRow({
  competitorId,
  competitorName,
  participantId,
  criteria,
  competitionId,
  alreadyScored,
}: CompetitorScoringRowProps) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.tournament.submitOrganizerScore.useMutation({
    onSuccess: () => {
      setValues({});
      setError(null);
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const allValid = criteria.every((c) => isValidValue(values[c.id] ?? '', c));

  function handleSubmit(): void {
    if (!allValid) return;
    setError(null);
    const scores = criteria.map((c) => ({
      criterionId: c.id,
      value: parseFloat(values[c.id] ?? '0').toFixed(2),
    }));
    mutation.mutate({
      competitionId,
      competitorId,
      scores,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-3">
        <div className="font-medium">{competitorName}</div>
        <div className="text-xs text-muted-foreground">{participantId}</div>
        {alreadyScored && (
          <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">✓ Scored</div>
        )}
      </td>
      {criteria.map((c) => (
        <td key={c.id} className="py-3 pr-3">
          <input
            type="number"
            step="0.01"
            min={c.min}
            max={c.max}
            placeholder={`${c.min}–${c.max}`}
            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={values[c.id] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
            disabled={mutation.isPending || alreadyScored}
          />
        </td>
      ))}
      <td className="py-3 align-top">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!allValid || mutation.isPending || alreadyScored}
        >
          {mutation.isPending ? 'Submitting…' : 'Submit Score'}
        </Button>
        {error && <p className="text-destructive text-xs mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export function SoloScoringPanel({ competitionId }: SoloScoringPanelProps) {
  const { data: competition } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const { data: competitorList = [] } = trpc.tournament.listCompetitorsWithStatus.useQuery({
    competitionId,
  });
  const { data: criteriaList = [] } = trpc.tournament.listCriteria.useQuery({
    competitionId,
  });
  const { data: standings = [] } = trpc.tournament.getStandings.useQuery({
    competitionId,
  });

  const criteria = useMemo<CriterionDef[]>(
    () =>
      criteriaList.map((c) => ({
        id: c.id,
        name: c.name,
        min: parseFloat(c.minScore),
        max: parseFloat(c.maxScore),
      })),
    [criteriaList],
  );

  const scoredIds = useMemo(() => new Set(standings.map((s) => s.competitorId)), [standings]);

  if (!competition) return null;
  if (!competition.soloMode) return null;
  if (competition.status !== 'active') return null;
  if (competition.cypherCompletedAt) return null;

  const activeCompetitors = competitorList.filter((c) => c.status === 'active');

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Solo Scoring</h2>
        <p className="text-sm text-muted-foreground">
          Score competitors directly. Each score is recorded under your organizer identity and
          aggregated into the live standings.
        </p>
      </div>
      {activeCompetitors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active competitors to score.</p>
      ) : criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add evaluation criteria before scoring.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold text-muted-foreground">Competitor</th>
                {criteria.map((c) => (
                  <th key={c.id} className="py-2 pr-3 font-semibold text-muted-foreground">
                    {c.name}
                    <div className="text-xs font-normal text-muted-foreground">
                      ({c.min}–{c.max})
                    </div>
                  </th>
                ))}
                <th className="py-2 font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {activeCompetitors.map((c) => (
                <CompetitorScoringRow
                  key={c.id}
                  competitorId={c.id}
                  competitorName={c.name}
                  participantId={c.participantId}
                  criteria={criteria}
                  competitionId={competitionId}
                  alreadyScored={scoredIds.has(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
