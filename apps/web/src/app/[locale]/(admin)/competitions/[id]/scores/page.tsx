import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { ScoreOverrideManager } from '@/components/admin/score-override-manager';

export default async function ScoresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('LiveDashboard');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">{t('scoresPageTitle')}</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">{t('loadingScores')}</p>}>
        <ScoreOverrideManager competitionId={id} />
      </Suspense>
    </div>
  );
}
