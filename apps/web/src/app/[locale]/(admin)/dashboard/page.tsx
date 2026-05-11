import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CompetitionList } from '@/components/admin/competition-list';
import { CompetitionListSkeleton } from '@/components/admin/competition-list-skeleton';

export default async function DashboardPage() {
  const t = await getTranslations('Dashboard');
  const tCompetitions = await getTranslations('Competitions');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {/* Create competition button — implemented in Story 2.1 */}
        <button
          disabled
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium opacity-40 cursor-not-allowed"
        >
          {tCompetitions('newCompetition')}
        </button>
      </div>
      <Suspense fallback={<CompetitionListSkeleton />}>
        <CompetitionList />
      </Suspense>
    </div>
  );
}
