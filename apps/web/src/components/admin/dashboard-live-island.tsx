'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { useAdminSocket } from '@/hooks/use-admin-socket';
import { DashboardKpiCards } from './dashboard-kpi-cards';
import { DashboardJudgeGrid } from './dashboard-judge-grid';
import { DashboardRecentScores, scorePayloadToEntry } from './dashboard-recent-scores';
import type { ScoreSubmittedPayload, JudgeLiveStatus } from '@competition-platform/shared';

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

const MAX_RECENT_SCORES = 10;

interface RecentScoreEntry {
  key: string;
  judgeSessionId: string;
  competitorId: string;
  competitionId: string;
  scores: { criterionId: string; value: string }[];
  idempotencyKey: string;
  submittedAt: string;
}

interface DashboardLiveIslandProps {
  competitionId: string;
}

export function DashboardLiveIsland({ competitionId }: DashboardLiveIslandProps) {
  const t = useTranslations('Dashboard');
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [clerkToken, setClerkToken] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');
  const [recentScores, setRecentScores] = useState<RecentScoreEntry[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const utils = trpc.useUtils();

  const { data: snapshot, isLoading } = trpc.tournament.getDashboardSnapshot.useQuery(
    { competitionId },
    { enabled: Boolean(competitionId) && isLoaded && Boolean(isSignedIn) },
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void getToken().then((tok) => {
      if (!cancelled) setClerkToken(tok);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const effectiveToken = isLoaded && isSignedIn ? clerkToken : null;

  useAdminSocket({
    competitionId,
    clerkToken: effectiveToken,
    onStatusChange: setConnectionStatus,
    onError: (err) => setSocketError(err.message),

    onScoreSubmitted: (p: ScoreSubmittedPayload) => {
      const key = `${p.idempotencyKey}-${String(++seqRef.current)}`;
      setRecentScores((prev) => [scorePayloadToEntry(p, key), ...prev].slice(0, MAX_RECENT_SCORES));
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },

    onScoreOverridden: () => {
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
      void utils.tournament.listScoresForOverride.invalidate({ competitionId });
    },

    onStandingsUpdated: (standings) => {
      utils.tournament.getDashboardSnapshot.setData({ competitionId }, (prev) =>
        prev ? { ...prev, topStandings: standings.slice(0, 10) } : prev,
      );
    },

    onJudgeStatusChanged: (status: JudgeLiveStatus) => {
      utils.tournament.getDashboardSnapshot.setData({ competitionId }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          judges: prev.judges.map((j) =>
            j.judgeSessionId === status.judgeSessionId
              ? {
                  ...j,
                  connected: status.connected,
                  queueSize: status.queueSize,
                  lastSeenAt: status.lastSeenAt,
                }
              : j,
          ),
        };
      });
    },

    onPhaseTransitioned: () => {
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
      void utils.tournament.getBracket.invalidate({ competitionId });
      void utils.tournament.getCompetition.invalidate({ competitionId });
    },

    onBracketGenerated: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
      void utils.tournament.getCompetition.invalidate({ competitionId });
    },

    onVoteSubmitted: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
    },

    onMatchupCompleted: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
    onMatchupRevoteRequired: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
    onMatchupTieResolutionRequired: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
    onBracketAdvanced: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
    onCompetitionCompleted: () => {
      void utils.tournament.getBracket.invalidate({ competitionId });
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },

    onCompetitorWithdrawn: () => {
      void utils.tournament.listCompetitorsWithStatus.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },

    onCompetitorRescued: () => {
      void utils.tournament.listCompetitorsWithStatus.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },
  });

  const statusLabel: string =
    connectionStatus === 'connected'
      ? t('liveStatusConnected')
      : connectionStatus === 'reconnecting'
        ? t('liveStatusReconnecting')
        : t('liveStatusDisconnected');

  if (!isLoaded) {
    return <p className="text-sm text-muted-foreground">{t('authLoading')}</p>;
  }

  if (!isSignedIn) {
    return <p className="text-sm text-muted-foreground">{t('authRequired')}</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  }

  if (!snapshot) {
    return <p className="text-sm text-muted-foreground">{t('competitionNotFound')}</p>;
  }

  const connectedJudges = snapshot.judges.filter((j) => j.connected).length;

  const judgeLabels = new Map(snapshot.judges.map((j) => [j.judgeSessionId, j.label]));
  const competitorNames = new Map(
    snapshot.topStandings.map((s) => [s.competitorId, s.competitorName]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{snapshot.competitionName}</h2>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${STATUS_COLORS[connectionStatus] ?? 'bg-gray-400'}`}
          />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </div>

      {socketError && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('liveUpdatesError', { message: socketError })}
        </div>
      )}

      <DashboardKpiCards
        currentPhase={snapshot.currentPhase}
        totalScoresSubmitted={snapshot.totalScoresSubmitted}
        totalScoresExpected={snapshot.totalScoresExpected}
        connectedJudges={connectedJudges}
        totalJudges={snapshot.judges.length}
      />

      <section>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          {t('judgeStatus')}
        </h3>
        <DashboardJudgeGrid judges={snapshot.judges} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            {t('topStandings')}
          </h3>
          {snapshot.topStandings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noScores')}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 font-semibold text-muted-foreground w-8">
                    {t('tableRank')}
                  </th>
                  <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">
                    {t('tableName')}
                  </th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">
                    {t('tableScore')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.topStandings.map((entry) => (
                  <tr key={entry.competitorId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-bold tabular-nums">{entry.rank}</td>
                    <td className="py-2 pr-3 font-medium">{entry.competitorName}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{entry.totalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            {t('recentScores')}
          </h3>
          <DashboardRecentScores
            entries={recentScores}
            judgeLabels={judgeLabels}
            competitorNames={competitorNames}
          />
        </section>
      </div>
    </div>
  );
}
