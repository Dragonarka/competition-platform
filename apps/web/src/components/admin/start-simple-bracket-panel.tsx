'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface BracketResult {
  bracketSize: number;
  qualifierCount: number;
  competitorCount: number;
}

export function StartSimpleBracketPanel({ competitionId }: { competitionId: string }) {
  const t = useTranslations('StartBracket');
  const tErr = useTranslations();
  const { data: competition, isLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BracketResult | null>(null);

  const startMutation = trpc.tournament.startSimpleBracket.useMutation({
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

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('loadingStatus')}</p>;
  if (!competition) return null;
  if (competition.formatKind !== 'simple_bracket') return null;

  if (competition.status === 'active') {
    return (
      <Card className="border-green-500">
        <CardHeader>
          <CardTitle className="text-base text-green-600">{t('activeTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('activeBody')}</p>
          {result && (
            <p className="mt-2 text-sm">
              {t('bracketSummary', {
                competitors: result.competitorCount,
                size: result.bracketSize,
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
          <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
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
