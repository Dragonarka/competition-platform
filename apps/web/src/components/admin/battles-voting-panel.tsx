'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { JudgeVoteInput } from '@competition-platform/format-cypher-battles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface BattlesVotingPanelProps {
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
}

function MatchupCard({
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
}: MatchupCardProps) {
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
      setError(err.message);
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
    });
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        Round {roundNumber} · Match {bracketPosition + 1}
      </p>
      {success ? (
        <p className="text-sm font-semibold text-green-600">Vote recorded ✓</p>
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
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function BattlesVotingPanel({ competitionId }: BattlesVotingPanelProps) {
  const { data: competition } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const { data: bracket } = trpc.tournament.getBracket.useQuery(
    { competitionId },
    {
      enabled: Boolean(competition?.cypherCompletedAt) && Boolean(competition?.soloMode),
    },
  );

  if (!competition?.soloMode || !competition?.cypherCompletedAt) return null;

  const open =
    bracket?.matchups.filter(
      (m) => !m.isBye && m.winnerCompetitorId === null && m.competitorA && m.competitorB,
    ) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solo Battles Voting</CardTitle>
        <CardDescription>
          Vote on each open matchup. Bye matchups auto-advance and aren&apos;t shown here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All matchups in this round are voted on. Waiting for the next round to be materialised.
          </p>
        ) : (
          open.map((m) => (
            <MatchupCard
              key={m.id}
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
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
