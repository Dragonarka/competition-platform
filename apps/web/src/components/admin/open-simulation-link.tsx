'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';

export function OpenSimulationLink({ competitionId }: { competitionId: string }) {
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });

  if (!competition || !competition.isSimulation) return null;

  return (
    <Link
      href={`/competitions/${competitionId}/simulation`}
      className={buttonVariants({ variant: 'default', size: 'sm' })}
    >
      Open Simulation Control
    </Link>
  );
}
