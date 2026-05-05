'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

interface TieResolutionBannerProps {
  competitionId: string;
}

interface PendingMatchup {
  id: string;
  roundNumber: number;
  bracketPosition: number;
  competitorAId: string | null;
  competitorBId: string | null;
  competitorA: { name: string; participantId: string } | null;
  competitorB: { name: string; participantId: string } | null;
  tieStatus: 'organizer_decision_pending' | null;
}

function PendingMatchupCard({
  competitionId,
  matchup,
}: {
  competitionId: string;
  matchup: PendingMatchup;
}) {
  const utils = trpc.useUtils();
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.tournament.resolveTie.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
    onError: (err) => setError(err.message),
  });

  const trimmedReason = reason.trim();
  const submittable =
    winnerId !== null &&
    trimmedReason.length >= 4 &&
    trimmedReason.length <= 280 &&
    !mutation.isPending;

  async function handleSubmit() {
    if (!submittable || !winnerId) return;
    await mutation.mutateAsync({
      competitionId,
      matchupId: matchup.id,
      winnerCompetitorId: winnerId,
      reason: trimmedReason,
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Tie requires your decision · Round {matchup.roundNumber} · Match{' '}
        {matchup.bracketPosition + 1}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {matchup.competitorAId && matchup.competitorA && (
          <button
            type="button"
            onClick={() => setWinnerId(matchup.competitorAId!)}
            className={`rounded border px-3 py-2 text-left text-sm ${
              winnerId === matchup.competitorAId
                ? 'border-amber-600 bg-amber-100 dark:bg-amber-900/40'
                : 'border-border bg-card'
            }`}
          >
            <span className="block font-medium">{matchup.competitorA.name}</span>
            <span className="text-xs text-muted-foreground">
              {matchup.competitorA.participantId}
            </span>
          </button>
        )}
        {matchup.competitorBId && matchup.competitorB && (
          <button
            type="button"
            onClick={() => setWinnerId(matchup.competitorBId!)}
            className={`rounded border px-3 py-2 text-left text-sm ${
              winnerId === matchup.competitorBId
                ? 'border-amber-600 bg-amber-100 dark:bg-amber-900/40'
                : 'border-border bg-card'
            }`}
          >
            <span className="block font-medium">{matchup.competitorB.name}</span>
            <span className="text-xs text-muted-foreground">
              {matchup.competitorB.participantId}
            </span>
          </button>
        )}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (4–280 characters) — recorded in the audit trail."
        rows={2}
        className="w-full rounded border border-border bg-background p-2 text-sm"
        maxLength={280}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{trimmedReason.length}/280</span>
        <Button type="button" onClick={handleSubmit} disabled={!submittable} size="sm">
          {mutation.isPending ? 'Resolving…' : 'Confirm winner'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function TieResolutionBanner({ competitionId }: TieResolutionBannerProps) {
  const { data: bracket } = trpc.tournament.getBracket.useQuery({
    competitionId,
  });

  const pending: PendingMatchup[] =
    bracket?.matchups.filter(
      (m) => m.tieStatus === 'organizer_decision_pending' && m.winnerCompetitorId === null,
    ) ?? [];

  if (pending.length === 0) return null;

  return (
    <div className="space-y-3">
      {pending.map((m) => (
        <PendingMatchupCard key={m.id} competitionId={competitionId} matchup={m} />
      ))}
    </div>
  );
}
