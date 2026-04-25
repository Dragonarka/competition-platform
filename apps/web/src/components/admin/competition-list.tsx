'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';
import { CompetitionCard } from './competition-card';

export function CompetitionList() {
  const { data: competitions } = trpc.tournament.list.useQuery();

  if (!competitions || competitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-lg mb-2">No competitions yet</p>
        <p className="text-muted-foreground text-sm mb-6">
          Create your first competition to get started
        </p>
        <Link href="/competitions/new" className={buttonVariants()}>
          Create Your First Competition
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
