import { Plus } from 'lucide-react';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CompetitionList } from '@/components/admin/competition-list';
import { CompetitionListSkeleton } from '@/components/admin/competition-list-skeleton';
import { buttonVariants } from '@/components/ui/button';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderEyebrow,
  PageHeaderText,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { Link } from '@/i18n/navigation';

export default async function DashboardPage() {
  const t = await getTranslations('Dashboard');
  const tCompetitions = await getTranslations('Competitions');

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderText>
          <PageHeaderEyebrow>{tCompetitions('pageTitle')}</PageHeaderEyebrow>
          <PageHeaderTitle>{t('title')}</PageHeaderTitle>
        </PageHeaderText>
        <PageHeaderActions>
          <Link href="/competitions/new" className={buttonVariants({ size: 'sm' })}>
            <Plus />
            {tCompetitions('newCompetition')}
          </Link>
        </PageHeaderActions>
      </PageHeader>
      <Suspense fallback={<CompetitionListSkeleton />}>
        <CompetitionList />
      </Suspense>
    </div>
  );
}
