'use client';

import { useSearchParams } from 'next/navigation';

export function NewCompetitionHeader() {
  const searchParams = useSearchParams();
  const isSimulation = searchParams.get('simulation') === 'true';

  return (
    <h1 className="text-2xl font-semibold text-foreground mb-6">
      {isSimulation ? 'Create Simulation' : 'Create Competition'}
    </h1>
  );
}
