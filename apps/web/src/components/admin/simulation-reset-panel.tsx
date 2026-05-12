'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import type { SimulationResetPayload } from '@competition-platform/shared';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface SimulationResetPanelProps {
  competitionId: string;
}

export function SimulationResetPanel({ competitionId }: SimulationResetPanelProps) {
  const t = useTranslations('Simulation.panels.reset');
  const tErr = useTranslations();
  const format = useFormatter();
  const utils = trpc.useUtils();
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState<SimulationResetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.tournament.resetSimulation.useMutation({
    onSuccess: (data) => {
      setLastResult(data);
      setError(null);
      setConfirming(false);
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getBracket.invalidate({ competitionId });
      void utils.tournament.listScoresForOverride.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
      void utils.tournament.listSimulationResetEvents.invalidate({ competitionId });
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      setError(key ? tErr(key) : err.message);
    },
  });

  if (!competition || !competition.isSimulation) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t('cardTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('cardDesc')}</p>
      </div>

      {!confirming && (
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setConfirming(true)}>
            {t('resetCta')}
          </Button>
          {lastResult && (
            <span className="text-xs text-muted-foreground">
              {t('lastResetSummary', {
                time: format.dateTime(new Date(lastResult.resetAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
                scores: lastResult.scoresDeleted,
                votes: lastResult.votesDeleted,
                matchups: lastResult.matchupsDeleted,
              })}
            </span>
          )}
        </div>
      )}

      {confirming && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">{t('confirmWarning')}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              onClick={() => mutation.mutate({ competitionId })}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t('resetting') : t('confirmCta')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={mutation.isPending}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
