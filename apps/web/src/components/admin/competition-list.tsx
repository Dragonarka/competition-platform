'use client';

import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { CompetitionCard } from './competition-card';

export function CompetitionList() {
  const t = useTranslations('Competitions.list');
  const { data: competitions } = trpc.tournament.list.useQuery();

  if (!competitions || competitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-lg mb-2">{t('emptyTitle')}</p>
        <p className="text-muted-foreground text-sm mb-6">{t('emptyHint')}</p>
        <Link href="/competitions/new" className={buttonVariants()}>
          {t('emptyCta')}
        </Link>
      </div>
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
