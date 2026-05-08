'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';

export function SimulateConfigLink({ competitionId }: { competitionId: string }) {
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });

  if (!competition || competition.isSimulation) return null;

  // Only show when the competition has at least some config worth cloning
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
      Simulate This Config
    </Link>
  );
}
