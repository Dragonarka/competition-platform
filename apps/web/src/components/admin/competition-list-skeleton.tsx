import { Skeleton } from '@/components/ui/skeleton';

export function CompetitionListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
