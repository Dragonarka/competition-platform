'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';

export function OpenSimulationLink({ competitionId }: { competitionId: string }) {
  const t = useTranslations('Simulation');
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });

  if (!competition || !competition.isSimulation) return null;

  return (
    <Link
      href={`/competitions/${competitionId}/simulation`}
      className={buttonVariants({ variant: 'default', size: 'sm' })}
    >
      {t('openLink')}
    </Link>
  );
}
