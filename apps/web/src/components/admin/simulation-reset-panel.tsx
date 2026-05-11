'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import type { SimulationResetPayload } from '@competition-platform/shared';

interface SimulationResetPanelProps {
  competitionId: string;
}

export function SimulationResetPanel({ competitionId }: SimulationResetPanelProps) {
  const utils = trpc.useUtils();
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState<SimulationResetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.tournament.resetSimulation.useMutation({
    onSuccess: (data) => {
      setLastResult(data);
      setError(null);
      setConfirming(false);
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getBracket.invalidate({ competitionId });
      void utils.tournament.listScoresForOverride.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
      void utils.tournament.listSimulationResetEvents.invalidate({ competitionId });
    },
    onError: (err) => setError(err.message),
  });

  if (!competition || !competition.isSimulation) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Reset Simulation</h2>
        <p className="text-sm text-muted-foreground">
          Wipes all scores, votes, and bracket progress for this simulation. Mock participants,
          evaluation criteria, and judge links are kept.
        </p>
      </div>

      {!confirming && (
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Reset Simulation
          </Button>
          {lastResult && (
            <span className="text-xs text-muted-foreground">
              Last reset: {new Date(lastResult.resetAt).toLocaleString()} —{' '}
              {lastResult.scoresDeleted} scores, {lastResult.votesDeleted} votes,{' '}
              {lastResult.matchupsDeleted} matchups removed.
            </span>
          )}
        </div>
      )}

      {confirming && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            This cannot be undone. All run-state data will be deleted.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              onClick={() => mutation.mutate({ competitionId })}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Resetting…' : 'Confirm Reset'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
