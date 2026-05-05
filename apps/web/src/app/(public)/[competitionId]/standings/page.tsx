'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { usePublicSocket } from '@/hooks/use-public-socket';

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  connected: 'Live',
  reconnecting: 'Reconnecting...',
  disconnected: 'Offline',
};

export default function StandingsPage() {
  const params = useParams<{ competitionId: string }>();
  const competitionId = params.competitionId;

  const utils = trpc.useUtils();

  const { data: standings = [], isLoading } = trpc.tournament.getStandings.useQuery(
    { competitionId },
    { enabled: Boolean(competitionId) },
  );

  // The gateway pushes the full StandingsEntry[] payload on each score commit.
  // Write it directly into the TanStack Query cache so no HTTP re-fetch is
  // needed — with N concurrent viewers × M score submissions, avoiding a round
  // trip per viewer per submission keeps bandwidth and server load bounded.
  const { connectionStatus } = usePublicSocket({
    competitionId,
    onStandingsUpdated: (incoming) => {
      utils.tournament.getStandings.setData({ competitionId }, incoming);
    },
    onPhaseTransitioned: () => {
      void utils.tournament.getStandings.invalidate({ competitionId });
    },
  });

  return (
    <main className="min-h-screen bg-background p-4 max-w-2xl mx-auto">
      <div className="fixed top-3 right-3 flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${STATUS_COLORS[connectionStatus] ?? 'bg-gray-400'}`}
        />
        <span className="text-xs text-muted-foreground">
          {STATUS_LABELS[connectionStatus] ?? connectionStatus}
        </span>
      </div>

      <h1 className="text-2xl font-bold mb-6">Live Standings</h1>

      {isLoading && <p className="text-muted-foreground">Loading standings...</p>}

      {!isLoading && standings.length === 0 && (
        <p className="text-muted-foreground">
          No scores submitted yet. Standings will appear as judges score.
        </p>
      )}

      {standings.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 pr-4 font-semibold text-muted-foreground w-10">#</th>
              <th className="text-left py-3 pr-4 font-semibold text-muted-foreground">Name</th>
              <th className="text-left py-3 pr-4 font-semibold text-muted-foreground">ID</th>
              <th className="text-right py-3 pr-4 font-semibold text-muted-foreground">Score</th>
              <th className="text-right py-3 font-semibold text-muted-foreground">Judges</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((entry) => (
              <tr key={entry.competitorId} className="border-b border-border last:border-0">
                <td className="py-4 pr-4 font-bold text-xl tabular-nums">{entry.rank}</td>
                <td className="py-4 pr-4 font-medium">{entry.competitorName}</td>
                <td className="py-4 pr-4 text-muted-foreground">{entry.participantId}</td>
                <td className="py-4 pr-4 text-right font-mono font-bold text-lg tabular-nums">
                  {entry.totalScore}
                </td>
                <td className="py-4 text-right text-muted-foreground">{entry.judgeCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
