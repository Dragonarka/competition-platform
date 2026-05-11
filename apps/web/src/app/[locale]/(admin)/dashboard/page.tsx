import { Suspense } from 'react';
import { CompetitionList } from '@/components/admin/competition-list';
import { CompetitionListSkeleton } from '@/components/admin/competition-list-skeleton';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Competitions</h1>
        {/* Create competition button — implemented in Story 2.1 */}
        <button
          disabled
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium opacity-40 cursor-not-allowed"
        >
          New Competition
        </button>
      </div>
      <Suspense fallback={<CompetitionListSkeleton />}>
        <CompetitionList />
      </Suspense>
    </div>
  );
}
