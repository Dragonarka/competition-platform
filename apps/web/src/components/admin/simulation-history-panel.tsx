'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';

interface SimulationHistoryPanelProps {
  competitionId: string;
}

export function SimulationHistoryPanel({ competitionId }: SimulationHistoryPanelProps) {
  const t = useTranslations('Simulation.panels.history');
  const format = useFormatter();
  const { data: events = [] } = trpc.tournament.listSimulationResetEvents.useQuery({
    competitionId,
  });

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="text-base font-semibold">{t('cardTitle')}</h2>
      <p className="text-xs text-muted-foreground">{t('cardDesc')}</p>
      <ul className="divide-y divide-border text-sm">
        {events.map((e) => (
          <li key={e.resetAt} className="py-2 flex items-baseline justify-between gap-3">
            <span className="font-medium">
              {format.dateTime(new Date(e.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('stats', {
                scores: e.scoresDeleted,
                votes: e.votesDeleted,
                matchups: e.matchupsDeleted,
                assignments: e.groupAssignmentsDeleted,
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
