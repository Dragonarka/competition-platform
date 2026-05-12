'use client';

import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { usePublicSocket } from '@/hooks/use-public-socket';
import type { PublicBracketData } from '@competition-platform/shared';
import { BracketView } from './bracket-view';

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

interface BracketClientIslandProps {
  competitionId: string;
  initialBracket: PublicBracketData;
}

export function BracketClientIsland({ competitionId, initialBracket }: BracketClientIslandProps) {
  const t = useTranslations('PublicBracket');
  const utils = trpc.useUtils();

  const { data: bracket = initialBracket } = trpc.tournament.getPublicBracket.useQuery(
    { competitionId },
    { initialData: initialBracket },
  );

  const { connectionStatus } = usePublicSocket({
    competitionId,
    onPhaseTransitioned: () => {
      void utils.tournament.getPublicBracket.invalidate({ competitionId });
    },
    onMatchupCompleted: () => {
      void utils.tournament.getPublicBracket.invalidate({ competitionId });
    },
    onBracketAdvanced: () => {
      void utils.tournament.getPublicBracket.invalidate({ competitionId });
    },
    onCompetitionCompleted: () => {
      void utils.tournament.getPublicBracket.invalidate({ competitionId });
    },
  });

  const stale = connectionStatus === 'reconnecting' || connectionStatus === 'disconnected';
  const statusLabel: string =
    connectionStatus === 'connected'
      ? t('statusConnected')
      : connectionStatus === 'reconnecting'
        ? t('statusReconnecting')
        : t('statusDisconnected');

  return (
    <main className="min-h-screen bg-background p-4 max-w-5xl mx-auto">
      <div className="fixed top-3 right-3 flex items-center gap-2 z-10">
        <div
          aria-hidden="true"
          className={`w-3 h-3 rounded-full ${STATUS_COLORS[connectionStatus] ?? 'bg-gray-400'}`}
        />
        <span className="text-xs text-muted-foreground" data-testid="connection-status-label">
          {statusLabel}
        </span>
      </div>

      <h1 className="text-2xl font-bold mb-6">{t('pageTitle')}</h1>

      <div
        className={`transition-opacity ${stale ? 'opacity-60' : 'opacity-100'}`}
        data-testid="bracket-stale-wrapper"
        data-stale={stale ? 'true' : 'false'}
      >
        <BracketView bracket={bracket} />
      </div>
    </main>
  );
}
