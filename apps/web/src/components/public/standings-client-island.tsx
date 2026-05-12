'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { usePublicSocket } from '@/hooks/use-public-socket';
import type { StandingsEntry } from '@competition-platform/shared';
import { StandingsTable, type NextMatchupHint } from './standings-table';

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

interface StandingsClientIslandProps {
  competitionId: string;
  initialStandings: StandingsEntry[];
  initialNext: NextMatchupHint[];
}

export function StandingsClientIsland({
  competitionId,
  initialStandings,
  initialNext,
}: StandingsClientIslandProps) {
  const t = useTranslations('PublicStandings');
  const utils = trpc.useUtils();

  const { data: standings = initialStandings } = trpc.tournament.getStandings.useQuery(
    { competitionId },
    { initialData: initialStandings },
  );

  const { data: nextHints = initialNext } = trpc.tournament.getPublicNextMatchups.useQuery(
    { competitionId },
    { initialData: initialNext },
  );

  const { connectionStatus } = usePublicSocket({
    competitionId,
    onStandingsUpdated: (incoming) => {
      utils.tournament.getStandings.setData({ competitionId }, incoming);
    },
    onPhaseTransitioned: () => {
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getPublicNextMatchups.invalidate({ competitionId });
    },
    onMatchupCompleted: () => {
      void utils.tournament.getPublicNextMatchups.invalidate({ competitionId });
    },
    onBracketAdvanced: () => {
      void utils.tournament.getPublicNextMatchups.invalidate({ competitionId });
    },
    onCompetitionCompleted: () => {
      void utils.tournament.getPublicNextMatchups.invalidate({ competitionId });
    },
  });

  const nextByCompetitorId = useMemo(() => {
    const map = new Map<string, NextMatchupHint>();
    for (const hint of nextHints) {
      map.set(hint.competitorId, hint);
    }
    return map;
  }, [nextHints]);

  const stale = connectionStatus === 'reconnecting' || connectionStatus === 'disconnected';
  const statusLabel: string =
    connectionStatus === 'connected'
      ? t('statusConnected')
      : connectionStatus === 'reconnecting'
        ? t('statusReconnecting')
        : t('statusDisconnected');

  return (
    <main className="min-h-screen bg-background p-4 max-w-3xl mx-auto">
      <div className="fixed top-3 right-3 flex items-center gap-2 z-10">
        <div
          aria-hidden="true"
          className={`w-3 h-3 rounded-full ${STATUS_COLORS[connectionStatus] ?? 'bg-gray-400'}`}
        />
        <span className="text-xs text-muted-foreground" data-testid="connection-status-label">
          {statusLabel}
        </span>
      </div>

      <h1 className="text-2xl font-bold mb-6">{t('liveTitle')}</h1>

      <div
        className={`transition-opacity ${stale ? 'opacity-60' : 'opacity-100'}`}
        data-testid="standings-stale-wrapper"
        data-stale={stale ? 'true' : 'false'}
      >
        <StandingsTable standings={standings} nextByCompetitorId={nextByCompetitorId} />
      </div>
    </main>
  );
}

export type { NextMatchupHint };
