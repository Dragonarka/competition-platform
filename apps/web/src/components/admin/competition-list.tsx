'use client';

import { Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import {
  EmptyState,
  EmptyStateAction,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@/components/ui/empty-state';
import { CompetitionCard } from './competition-card';

export function CompetitionList() {
  const t = useTranslations('Competitions.list');
  const { data: competitions } = trpc.tournament.list.useQuery();

  if (!competitions || competitions.length === 0) {
    return (
      <EmptyState>
        <EmptyStateIcon>
          <Trophy />
        </EmptyStateIcon>
        <EmptyStateTitle>{t('emptyTitle')}</EmptyStateTitle>
        <EmptyStateDescription>{t('emptyHint')}</EmptyStateDescription>
        <EmptyStateAction>
          <Link href="/competitions/new" className={buttonVariants()}>
            {t('emptyCta')}
          </Link>
        </EmptyStateAction>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {competitions.map((competition) => (
        <CompetitionCard key={competition.id} competition={competition} />
      ))}
    </div>
  );
}
