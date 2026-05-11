'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';

export function SimulateConfigLink({ competitionId }: { competitionId: string }) {
  const t = useTranslations('Simulation');
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });

  if (!competition || competition.isSimulation) return null;

  const hasConfig =
    competition.cypherJudgeCount !== null ||
    competition.battlesJudgeCount !== null ||
    competition.advancementThreshold !== null;
  if (!hasConfig) return null;

  return (
    <Link
      href={`/competitions/new?simulation=true&source=${competitionId}`}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {t('configLink')}
    </Link>
  );
}
