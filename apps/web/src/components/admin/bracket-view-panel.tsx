'use client';

import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { roundLabel } from '@/lib/bracket-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BracketViewPanelProps {
  competitionId: string;
}

interface CompetitorSlot {
  name: string;
  participantId: string;
}

interface BracketMatchup {
  id: string;
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string | null;
  competitorBId: string | null;
  seedA: number | null;
  seedB: number | null;
  isBye: boolean;
  winnerCompetitorId: string | null;
  competitorA: CompetitorSlot | null;
  competitorB: CompetitorSlot | null;
}

function MatchupSlot({
  competitor,
  seed,
  isWinner,
  isBye,
}: {
  competitor: CompetitorSlot | null;
  seed: number | null;
  isWinner: boolean;
  isBye: boolean;
}) {
  const t = useTranslations('Bracket');
  if (!competitor) {
    return (
      <div className="flex items-center justify-between rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        <span>{t('byeLabel')}</span>
      </div>
    );
  }
  const winnerClass = isWinner
    ? 'border-green-500 bg-green-50 dark:bg-green-950/20 font-semibold'
    : 'border-border';
  return (
    <div
      className={`flex items-center justify-between rounded border ${winnerClass} px-3 py-2 text-sm`}
    >
      <div className="flex items-center gap-2">
        {seed !== null && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
            {seed}
          </span>
        )}
        <span>{competitor.name}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{competitor.participantId}</span>
        {isWinner && <span className="text-green-700 dark:text-green-400">{t('winnerCheck')}</span>}
        {isBye && !isWinner && (
          <span className="text-blue-700 dark:text-blue-400">{t('byeCheck')}</span>
        )}
      </div>
    </div>
  );
}

export function BracketViewPanel({ competitionId }: BracketViewPanelProps) {
  const t = useTranslations('Bracket');
  const { data: competition } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const { data: bracket, isLoading } = trpc.tournament.getBracket.useQuery(
    { competitionId },
    { enabled: Boolean(competition?.cypherCompletedAt) },
  );

  if (!competition?.cypherCompletedAt) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('loadingBracket')}</p>
        </CardContent>
      </Card>
    );
  }

  const matchups: BracketMatchup[] = bracket?.matchups ?? [];
  const championCompetitorId = bracket?.championCompetitorId ?? null;
  const currentRoundNumber = bracket?.currentRoundNumber ?? null;

  if (matchups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('emptyBracket')}</p>
        </CardContent>
      </Card>
    );
  }

  const rounds = new Map<number, BracketMatchup[]>();
  for (const m of matchups) {
    const list = rounds.get(m.roundNumber) ?? [];
    list.push(m);
    rounds.set(m.roundNumber, list);
  }
  const orderedRounds = [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  const round1Count = rounds.get(1)?.length ?? 0;
  const totalRounds = round1Count > 0 ? Math.log2(round1Count) + 1 : orderedRounds.length;

  let championName: string | null = null;
  if (championCompetitorId) {
    for (const m of matchups) {
      if (m.competitorAId === championCompetitorId && m.competitorA) {
        championName = m.competitorA.name;
        break;
      }
      if (m.competitorBId === championCompetitorId && m.competitorB) {
        championName = m.competitorB.name;
        break;
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {championCompetitorId && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-200">
            {t('championBanner', { name: championName ?? championCompetitorId })}
          </div>
        )}
        {currentRoundNumber !== null && (
          <p className="text-xs text-muted-foreground">
            {t('currentRound', { round: roundLabel(currentRoundNumber, totalRounds) })}
          </p>
        )}
        {orderedRounds.map(([roundNumber, roundMatchups]) => (
          <section key={roundNumber} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {roundLabel(roundNumber, totalRounds)}
            </h3>
            <div className="space-y-3">
              {roundMatchups.map((m, idx) => {
                const aIsWinner =
                  m.winnerCompetitorId !== null && m.winnerCompetitorId === m.competitorAId;
                const bIsWinner =
                  m.winnerCompetitorId !== null && m.winnerCompetitorId === m.competitorBId;
                return (
                  <div key={m.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('matchLabel', { n: idx + 1 })}
                    </p>
                    <MatchupSlot
                      competitor={m.competitorA}
                      seed={m.seedA}
                      isWinner={aIsWinner}
                      isBye={m.isBye}
                    />
                    <MatchupSlot
                      competitor={m.competitorB}
                      seed={m.seedB}
                      isWinner={bIsWinner}
                      isBye={false}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
