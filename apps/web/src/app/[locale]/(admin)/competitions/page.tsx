import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CompetitionList } from '@/components/admin/competition-list';
import { CompetitionListSkeleton } from '@/components/admin/competition-list-skeleton';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';

export default async function CompetitionsPage() {
  const t = await getTranslations('Competitions');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>
        <div className="flex gap-2">
          <Link
            href="/competitions/new?simulation=true"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('newSimulation')}
          </Link>
          <Link href="/competitions/new" className={buttonVariants()}>
            {t('newCompetition')}
          </Link>
        </div>
      </div>
      <Suspense fallback={<CompetitionListSkeleton />}>
        <CompetitionList />
      </Suspense>
    </div>
  );
}
