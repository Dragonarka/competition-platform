'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';

interface LiveDashboardLinkProps {
  competitionId: string;
}

export function LiveDashboardLink({ competitionId }: LiveDashboardLinkProps) {
  const t = useTranslations('LiveDashboard');
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });

  if (competition?.status !== 'active') return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/competitions/${competitionId}/live`} className={buttonVariants()}>
        {t('linkLabel')} →
      </Link>
      <Link
        href={`/competitions/${competitionId}/scores`}
        className={buttonVariants({ variant: 'outline' })}
      >
        {t('manageScores')}
      </Link>
    </div>
  );
}
