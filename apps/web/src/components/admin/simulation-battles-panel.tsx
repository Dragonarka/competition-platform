'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { JudgeVoteInput } from '@competition-platform/format-cypher-battles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface SimulationBattlesPanelProps {
  competitionId: string;
}

interface MatchupCardProps {
  matchupId: string;
  competitionId: string;
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string;
  competitorAName: string;
  competitorASeed: number | null;
  competitorBId: string;
  competitorBName: string;
  competitorBSeed: number | null;
  simulatedJudgeIndex: number;
}

function SimMatchupCard({
  matchupId,
  competitionId,
  roundNumber,
  bracketPosition,
  competitorAId,
  competitorAName,
  competitorASeed,
  competitorBId,
  competitorBName,
  competitorBSeed,
  simulatedJudgeIndex,
}: MatchupCardProps) {
  const t = useTranslations('Simulation.panels.battles');
  const tJudge = useTranslations('Judge');
  const tErr = useTranslations();
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = trpc.tournament.submitOrganizerVote.useMutation({
    onSuccess: () => {
      setError(null);
      setSuccess(true);
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      setError(key ? tErr(key) : err.message);
    },
  });

  async function handleVote(choice: 'player1' | 'player2' | 'tie') {
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await mutation.mutateAsync({
      competitionId,
      matchupId,
      vote: choice,
      idempotencyKey,
      simulatedJudgeIndex,
    });
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t('matchupHeaderFmt', { round: roundNumber, match: bracketPosition + 1 })}
      </p>
      {success ? (
        <p className="text-sm font-semibold text-green-600">
          {t('voteRecordedAsJudge', { n: simulatedJudgeIndex + 1 })}
        </p>
      ) : (
        <JudgeVoteInput
          matchupId={matchupId}
          player1Id={competitorAId}
          player1Name={competitorAName}
          player1Seed={competitorASeed}
          player2Id={competitorBId}
          player2Name={competitorBName}
          player2Seed={competitorBSeed}
          onVote={handleVote}
          disabled={mutation.isPending}
          labels={{
            seed: (n) => tJudge('seed', { n }),
            submitting: tJudge('voteSubmitting'),
            voteForPlayer1: tJudge('voteForA', { name: competitorAName }),
            voteForPlayer2: tJudge('voteForB', { name: competitorBName }),
            voteTie: tJudge('voteTie'),
          }}
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function SimulationBattlesPanel({ competitionId }: SimulationBattlesPanelProps) {
  const t = useTranslations('Simulation.panels.battles');
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });
  const { data: bracket } = trpc.tournament.getBracket.useQuery(
    { competitionId },
    { enabled: !!competition?.isSimulation && !!competition?.cypherCompletedAt },
  );
  const [selectedJudge, setSelectedJudge] = useState(0);

  if (!competition || !competition.isSimulation || !competition.cypherCompletedAt) return null;

  const judgeCount = competition.battlesJudgeCount ?? 0;

  const open =
    bracket?.matchups.filter(
      (m) => !m.isBye && m.winnerCompetitorId === null && m.competitorA && m.competitorB,
    ) ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-end justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t('panelTitle')}</CardTitle>
            <CardDescription>{t('panelDesc', { count: judgeCount })}</CardDescription>
          </div>
          <label className="flex flex-col text-xs text-muted-foreground">
            {t('judgeSelectorLabel')}
            <select
              aria-label={t('judgeSelectorAria')}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={selectedJudge}
              onChange={(e) => setSelectedJudge(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: judgeCount }, (_, j) => (
                <option key={j} value={j}>
                  {t('judgeOption', { n: j + 1 })}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('allVoted')}</p>
        ) : (
          open.map((m) => (
            <SimMatchupCard
              key={`${m.id}-J${selectedJudge}`}
              matchupId={m.id}
              competitionId={competitionId}
              roundNumber={m.roundNumber}
              bracketPosition={m.bracketPosition}
              competitorAId={m.competitorAId!}
              competitorAName={m.competitorA!.name}
              competitorASeed={m.seedA}
              competitorBId={m.competitorBId!}
              competitorBName={m.competitorB!.name}
              competitorBSeed={m.seedB}
              simulatedJudgeIndex={selectedJudge}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
