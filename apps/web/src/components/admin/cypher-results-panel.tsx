'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { usePublicSocket } from '@/hooks/use-public-socket';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface CypherResultsPanelProps {
  competitionId: string;
}

export function CypherResultsPanel({ competitionId }: CypherResultsPanelProps) {
  const t = useTranslations('CypherResults');
  const tErr = useTranslations();
  const tCommon = useTranslations('Common');
  const format = useFormatter();

  function formatLockedAt(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      return format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso ?? '';
    }
  }

  const utils = trpc.useUtils();
  const { data: competition, isLoading: competitionLoading } =
    trpc.tournament.getCompetition.useQuery({ competitionId });
  const { data: standings = [], isLoading: standingsLoading } =
    trpc.tournament.getStandings.useQuery(
      { competitionId },
      { enabled: competition?.status === 'active' },
    );

  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeMutation = trpc.tournament.completeCypherPhase.useMutation({
    onSuccess: () => {
      setError(null);
      setIsConfirming(false);
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      setError(key ? tErr(key) : err.message);
    },
  });

  usePublicSocket({
    competitionId,
    onPhaseTransitioned: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
    },
  });

  if (competitionLoading) {
    return <p className="text-muted-foreground text-sm">{t('loadingCompetition')}</p>;
  }
  if (!competition) return null;
  if (competition.status !== 'active') return null;

  const advancementThreshold = competition.advancementThreshold ?? 0;
  const totalParticipants = standings.length;
  const advancedCount =
    advancementThreshold > 0 ? Math.min(advancementThreshold, totalParticipants) : 0;
  const isLocked = competition.cypherCompletedAt != null;

  const maxJudgeCount = standings.length > 0 ? Math.max(...standings.map((s) => s.judgeCount)) : 0;
  const pendingCount = standings.filter((s) => s.judgeCount < maxJudgeCount).length;
  const hasPendingWarning = !isLocked && pendingCount > 0;

  const headerLabel =
    advancementThreshold > 0 && totalParticipants > advancementThreshold
      ? t('topNAdvance', { threshold: advancementThreshold, total: totalParticipants })
      : totalParticipants > 0
        ? t('allAdvance', { total: totalParticipants })
        : t('noneSubmitted');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {standingsLoading && (
          <p className="text-sm text-muted-foreground">{t('loadingStandings')}</p>
        )}

        <p className="text-sm text-muted-foreground">{headerLabel}</p>

        {hasPendingWarning && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {pendingCount === 1
              ? t('pendingScoresOne')
              : t('pendingScoresMany', { count: pendingCount })}
          </p>
        )}

        {standings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground w-10">
                    {t('rankHeader')}
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">
                    {t('nameHeader')}
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">{t('idHeader')}</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground text-right">
                    {t('scoreHeader')}
                  </th>
                  <th className="py-2 font-semibold text-muted-foreground text-right">
                    {t('judgesHeader')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((entry) => {
                  const advances = advancedCount > 0 && entry.rank <= advancedCount;
                  return (
                    <tr
                      key={entry.competitorId}
                      className={`border-b border-border last:border-0 ${
                        advances ? 'bg-green-50 dark:bg-green-950/20' : ''
                      }`}
                    >
                      <td className="py-2 pr-3 font-bold tabular-nums">{entry.rank}</td>
                      <td className="py-2 pr-3 font-medium">
                        {entry.competitorName}
                        {advances && (
                          <span className="ml-2 text-xs font-medium text-green-700 dark:text-green-400">
                            {t('advancesIndicator')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{entry.participantId}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {entry.totalScore}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{entry.judgeCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {isLocked ? (
          <div className="border border-green-500 bg-green-50 dark:bg-green-950/20 rounded p-3 space-y-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              {t('lockedNotice', { time: formatLockedAt(competition.cypherCompletedAt) })}
            </p>
            <p className="text-xs text-muted-foreground">
              {advancedCount === 1
                ? t('advancesCountOne')
                : t('advancesCountMany', { count: advancedCount })}
            </p>
            <Button disabled className="mt-2 w-full sm:w-auto">
              {t('confirmedCta')}
            </Button>
          </div>
        ) : !isConfirming ? (
          <div className="space-y-2">
            {error && (
              <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}
            <Button
              onClick={() => {
                setError(null);
                setIsConfirming(true);
              }}
              disabled={advancementThreshold <= 0}
              className="w-full sm:w-auto"
            >
              {t('confirmAdvanceCta')}
            </Button>
            {advancementThreshold <= 0 && (
              <p className="text-xs text-destructive">{t('thresholdMissing')}</p>
            )}
          </div>
        ) : (
          <div className="border border-destructive rounded p-3 space-y-2">
            <p className="text-sm font-medium">
              {advancedCount === 1
                ? t('lockPromptOne')
                : t('lockPromptMany', { count: advancedCount })}
            </p>
            <p className="text-xs text-muted-foreground">{t('irreversibleHint')}</p>
            {error && (
              <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => completeMutation.mutate({ competitionId })}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? t('confirmingProgress') : t('yesConfirm')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsConfirming(false);
                  setError(null);
                }}
                disabled={completeMutation.isPending}
              >
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
