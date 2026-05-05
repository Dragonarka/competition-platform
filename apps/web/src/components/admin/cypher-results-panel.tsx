'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { usePublicSocket } from '@/hooks/use-public-socket';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CypherResultsPanelProps {
  competitionId: string;
}

function formatLockedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function CypherResultsPanel({ competitionId }: CypherResultsPanelProps) {
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
    onError: (err) => setError(err.message),
  });

  // Socket: react to phase.transitioned broadcast (e.g. another organizer's
  // confirm or a battle phase trigger). Refresh competition + standings.
  usePublicSocket({
    competitionId,
    onPhaseTransitioned: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
    },
  });

  if (competitionLoading) {
    return <p className="text-muted-foreground text-sm">Loading competition status...</p>;
  }
  if (!competition) return null;

  // Only render in the active scoring phase. Other statuses are owned by
  // sibling panels (StartCypherPhasePanel renders for 'draft', etc.).
  if (competition.status !== 'active') return null;

  const advancementThreshold = competition.advancementThreshold ?? 0;
  const totalParticipants = standings.length;
  const advancedCount =
    advancementThreshold > 0 ? Math.min(advancementThreshold, totalParticipants) : 0;
  const isLocked = competition.cypherCompletedAt != null;

  // Detect uneven judge coverage: if any competitor has fewer judge scores than
  // the maximum across all competitors, some expected scores are still pending.
  const maxJudgeCount = standings.length > 0 ? Math.max(...standings.map((s) => s.judgeCount)) : 0;
  const pendingCount = standings.filter((s) => s.judgeCount < maxJudgeCount).length;
  const hasPendingWarning = !isLocked && pendingCount > 0;

  const headerLabel =
    advancementThreshold > 0 && totalParticipants > advancementThreshold
      ? `Top ${advancementThreshold} of ${totalParticipants} advance`
      : totalParticipants > 0
        ? `All ${totalParticipants} advance`
        : `No scores submitted yet`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cypher Results &amp; Advancement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {standingsLoading && <p className="text-sm text-muted-foreground">Loading standings...</p>}

        <p className="text-sm text-muted-foreground">{headerLabel}</p>

        {hasPendingWarning && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Note: {pendingCount} competitor{pendingCount === 1 ? '' : 's'}{' '}
            {pendingCount === 1 ? 'has' : 'have'} fewer judge scores than others. You can confirm
            anyway.
          </p>
        )}

        {standings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground w-10">#</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Name</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">ID</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground text-right">
                    Score
                  </th>
                  <th className="py-2 font-semibold text-muted-foreground text-right">Judges</th>
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
                            Advances ✓
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
              ✓ Advancement locked at {formatLockedAt(competition.cypherCompletedAt)}.
            </p>
            <p className="text-xs text-muted-foreground">
              {advancedCount} competitor{advancedCount === 1 ? '' : 's'} advance to Battles.
            </p>
            <Button disabled className="mt-2 w-full sm:w-auto">
              ✓ Advancement Confirmed
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
              Confirm Advancement
            </Button>
            {advancementThreshold <= 0 && (
              <p className="text-xs text-destructive">
                Advancement threshold has not been configured for this competition.
              </p>
            )}
          </div>
        ) : (
          <div className="border border-destructive rounded p-3 space-y-2">
            <p className="text-sm font-medium">
              Lock the top {advancedCount} competitor{advancedCount === 1 ? '' : 's'} for Battles?
            </p>
            <p className="text-xs text-muted-foreground">This cannot be undone via this UI.</p>
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
                {completeMutation.isPending ? 'Confirming...' : 'Yes, confirm advancement'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsConfirming(false);
                  setError(null);
                }}
                disabled={completeMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
