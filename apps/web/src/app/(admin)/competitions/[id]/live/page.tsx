import { Suspense } from 'react';
import { DashboardLiveIsland } from '@/components/admin/dashboard-live-island';

export const experimental_ppr = true;

export default async function LiveDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Live Dashboard</h1>
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
              ))}
            </div>
            <div className="h-48 rounded-lg border bg-muted/40 animate-pulse" />
          </div>
        }
      >
        <DashboardLiveIsland competitionId={id} />
      </Suspense>
    </div>
  );
}
