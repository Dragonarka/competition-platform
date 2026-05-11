'use client';

import { trpc } from '@/lib/trpc';

interface SimulationHistoryPanelProps {
  competitionId: string;
}

export function SimulationHistoryPanel({ competitionId }: SimulationHistoryPanelProps) {
  const { data: events = [] } = trpc.tournament.listSimulationResetEvents.useQuery({
    competitionId,
  });

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="text-base font-semibold">Simulation History</h2>
      <p className="text-xs text-muted-foreground">
        Reset events for this simulation, newest first.
      </p>
      <ul className="divide-y divide-border text-sm">
        {events.map((e) => (
          <li key={e.resetAt} className="py-2 flex items-baseline justify-between gap-3">
            <span className="font-medium">{new Date(e.createdAt).toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">
              {e.scoresDeleted} scores · {e.votesDeleted} votes · {e.matchupsDeleted} matchups ·{' '}
              {e.groupAssignmentsDeleted} assignments
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
