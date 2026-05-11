'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_DOT: Record<string, string> = {
  configuration: 'bg-gray-400',
  cypher: 'bg-green-500',
  'cypher-review': 'bg-yellow-400',
  battles: 'bg-blue-500',
  completed: 'bg-gray-500',
};

interface DashboardKpiCardsProps {
  currentPhase: string;
  totalScoresSubmitted: number;
  totalScoresExpected: number;
  connectedJudges: number;
  totalJudges: number;
}

export function DashboardKpiCards({
  currentPhase,
  totalScoresSubmitted,
  totalScoresExpected,
  connectedJudges,
  totalJudges,
}: DashboardKpiCardsProps) {
  const t = useTranslations('Dashboard');
  const tPhase = useTranslations('Dashboard.phaseLabels');
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('phase')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[currentPhase] ?? 'bg-gray-400'}`}
            />
            <span className="text-lg font-semibold">{tPhase(currentPhase)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('scoresKpi')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {totalScoresSubmitted}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              / {totalScoresExpected}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('scoresKpiHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('judgesOnline')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {connectedJudges}
            <span className="text-base font-normal text-muted-foreground"> / {totalJudges}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('judgesOnlineHint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
