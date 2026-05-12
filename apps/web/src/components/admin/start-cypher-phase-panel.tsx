'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface AssignmentResult {
  groupCount: number;
  competitorCount: number;
  judgeCount: number;
}

export function StartCypherPhasePanel({ competitionId }: { competitionId: string }) {
  const t = useTranslations('StartCypher');
  const tErr = useTranslations();
  const { data: competition, isLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignmentResult | null>(null);

  const startMutation = trpc.tournament.startCypherPhase.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      utils.tournament.getCompetition.invalidate({ competitionId });
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      setError(key ? tErr(key) : err.message);
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">{t('loadingStatus')}</p>;
  if (!competition) return null;

  if (competition.status === 'active') {
    return (
      <Card className="border-green-500">
        <CardHeader>
          <CardTitle className="text-base text-green-600">{t('activeTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('activeBody')}</p>
          {result && (
            <p className="text-sm mt-2">
              {t('assignmentResult', {
                competitors: result.competitorCount,
                groups: result.groupCount,
                judges: result.judgeCount,
              })}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
        {error && (
          <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">{error}</p>
        )}
        <Button
          onClick={() => startMutation.mutate({ competitionId })}
          disabled={startMutation.isPending}
          className="w-full sm:w-auto"
        >
          {startMutation.isPending ? t('starting') : t('startCta')}
        </Button>
      </CardContent>
    </Card>
  );
}
