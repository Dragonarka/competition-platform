import { Suspense } from 'react';
import { ScoreOverrideManager } from '@/components/admin/score-override-manager';

export default async function ScoresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Manage Scores</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading scores...</p>}>
        <ScoreOverrideManager competitionId={id} />
      </Suspense>
    </div>
  );
}
