import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { SimulationClient } from '@/components/admin/simulation-client';

export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('Simulation.panels.client');

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-7 w-64 animate-pulse rounded-md bg-muted/60" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/40" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-lg border bg-muted/40 animate-pulse" />
          <span className="sr-only">{t('loading')}</span>
        </div>
      }
    >
      <SimulationClient competitionId={id} />
    </Suspense>
  );
}
