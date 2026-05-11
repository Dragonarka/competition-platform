'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Competition } from '@competition-platform/shared';

const statusStyles: Record<Competition['status'], string> = {
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  archived: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600',
};

export function CompetitionCard({ competition }: { competition: Competition }) {
  const t = useTranslations('Competitions');
  const tStatus = useTranslations('Competitions.status');
  const format = useFormatter();

  return (
    <Link
      href={`/competitions/${competition.id}`}
      className="block rounded-lg border border-border bg-card p-4 hover:bg-accent/5 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-medium text-foreground leading-tight">{competition.name}</h3>
        <div className="flex items-center gap-1.5">
          {competition.isSimulation && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
              {t('simulationBadge')}
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusStyles[competition.status]}`}
          >
            {tStatus(competition.status)}
          </span>
        </div>
      </div>
      {competition.description && (
        <p className="text-muted-foreground text-xs mb-2 line-clamp-2">{competition.description}</p>
      )}
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        {competition.date && (
          <span>{format.dateTime(new Date(competition.date), { dateStyle: 'medium' })}</span>
        )}
        <span>
          {t('createdOn', {
            date: format.dateTime(new Date(competition.createdAt), { dateStyle: 'medium' }),
          })}
        </span>
      </div>
    </Link>
  );
}
