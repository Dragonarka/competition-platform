'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { trpc } from '@/lib/trpc';
import { useAdminSocket } from '@/hooks/use-admin-socket';
import { roundLabel } from '@/lib/bracket-utils';
import { PresenterView } from '@/components/presenter/presenter-view';
import type { PresenterViewProps } from '@/components/presenter/presenter-view';
import type { StandingsEntry } from '@competition-platform/shared';

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

export default function PresenterPage() {
  const t = useTranslations('Presenter');
  const { competitionId } = useParams<{ competitionId: string }>();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [clerkToken, setClerkToken] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');
  const [socketError, setSocketError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const isReady = isLoaded && Boolean(isSignedIn);

  const { data: competition } = trpc.tournament.getCompetition.useQuery(
    { competitionId },
    { enabled: isReady },
  );

  const { data: snapshot } = trpc.tournament.getDashboardSnapshot.useQuery(
    { competitionId },
    { enabled: isReady },
  );

  const { data: bracket } = trpc.tournament.getBracket.useQuery(
    { competitionId },
    { enabled: isReady && Boolean(competition?.cypherCompletedAt) },
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

  const effectiveToken = isReady ? clerkToken : null;

  useAdminSocket({
    competitionId,
    clerkToken: effectiveToken,
    onStatusChange: setConnectionStatus,
    onError: (err) => setSocketError(err.message),

    onScoreSubmitted: () => {
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },

    onStandingsUpdated: (standings: StandingsEntry[]) => {
      utils.tournament.getDashboardSnapshot.setData({ competitionId }, (prev) =>
        prev ? { ...prev, topStandings: standings.slice(0, 10) } : prev,
      );
    },

    onPhaseTransitioned: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
      void utils.tournament.getBracket.invalidate({ competitionId });
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
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },

    onCompetitorRescued: () => {
      void utils.tournament.getDashboardSnapshot.invalidate({ competitionId });
    },
  });

  if (!isLoaded) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        data-testid="presenter-loading"
      >
        <p className="text-lg text-zinc-400">{t('loading')}</p>
      </div>
    );
  }

  if (!competition || !snapshot) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        data-testid="presenter-loading"
      >
        <p className="text-lg text-zinc-400">{t('loadingCompetition')}</p>
      </div>
    );
  }

  const presenterProps = derivePresenterProps(competition, snapshot, bracket);
  const isStale = connectionStatus === 'reconnecting' || connectionStatus === 'disconnected';
  const statusLabel: string =
    connectionStatus === 'connected'
      ? t('statusConnected')
      : connectionStatus === 'reconnecting'
        ? t('statusReconnecting')
        : t('statusDisconnected');

  return (
    <>
      <div
        className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs backdrop-blur"
        data-testid="presenter-connection-badge"
      >
        <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[connectionStatus]}`} />
        <span className="text-zinc-300">{statusLabel}</span>
      </div>

      {socketError && (
        <div className="fixed bottom-3 left-3 right-3 z-50 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-200 backdrop-blur">
          {t('liveUpdatesError', { message: socketError })}
        </div>
      )}

      <div className={isStale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <PresenterView {...presenterProps} />
      </div>
    </>
  );
}

interface CompetitionData {
  name: string;
  status: string;
  cypherCompletedAt: string | Date | null;
}

interface SnapshotData {
  currentPhase: string;
  totalScoresSubmitted: number;
  totalScoresExpected: number;
  topStandings: StandingsEntry[];
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
  competitorA: { name: string; participantId: string } | null;
  competitorB: { name: string; participantId: string } | null;
}

interface BracketData {
  matchups: BracketMatchup[];
  championCompetitorId: string | null;
  currentRoundNumber: number | null;
}

function derivePresenterProps(
  competition: CompetitionData,
  snapshot: SnapshotData,
  bracket: BracketData | undefined,
): PresenterViewProps {
  const KNOWN_PHASES = new Set([
    'configuration',
    'cypher',
    'cypher-review',
    'battles',
    'completed',
  ]);
  const currentPhase = (
    KNOWN_PHASES.has(snapshot.currentPhase) ? snapshot.currentPhase : 'configuration'
  ) as PresenterViewProps['currentPhase'];

  let currentMatchup: PresenterViewProps['currentMatchup'] = null;
  let nextMatchup: PresenterViewProps['nextMatchup'] = null;
  let champion: PresenterViewProps['champion'] = null;

  if (bracket && bracket.matchups.length > 0) {
    const matchups = bracket.matchups;

    const round1Count = matchups.filter((m) => m.roundNumber === 1).length;
    const totalRounds = round1Count > 0 ? Math.log2(round1Count) + 1 : 0;

    if (bracket.championCompetitorId) {
      for (const m of matchups) {
        if (m.competitorAId === bracket.championCompetitorId && m.competitorA) {
          champion = { name: m.competitorA.name, seed: m.seedA ?? 0 };
          break;
        }
        if (m.competitorBId === bracket.championCompetitorId && m.competitorB) {
          champion = { name: m.competitorB.name, seed: m.seedB ?? 0 };
          break;
        }
      }
    }

    if (bracket.currentRoundNumber !== null) {
      const unresolvedInRound = matchups.filter(
        (m) =>
          m.roundNumber === bracket.currentRoundNumber &&
          m.winnerCompetitorId === null &&
          !m.isBye &&
          m.competitorA &&
          m.competitorB,
      );

      if (unresolvedInRound.length > 0) {
        const first = unresolvedInRound[0]!;
        currentMatchup = {
          competitorA: first.competitorA!.name,
          competitorB: first.competitorB!.name,
          roundLabel: roundLabel(first.roundNumber, totalRounds),
        };

        if (unresolvedInRound.length > 1) {
          const second = unresolvedInRound[1]!;
          nextMatchup = {
            competitorA: second.competitorA!.name,
            competitorB: second.competitorB!.name,
            roundLabel: roundLabel(second.roundNumber, totalRounds),
          };
        } else {
          const nextRound = bracket.currentRoundNumber + 1;
          const nextRoundMatchups = matchups.filter(
            (m) =>
              m.roundNumber === nextRound &&
              m.winnerCompetitorId === null &&
              !m.isBye &&
              m.competitorA &&
              m.competitorB,
          );
          if (nextRoundMatchups.length > 0) {
            const nm = nextRoundMatchups[0]!;
            nextMatchup = {
              competitorA: nm.competitorA!.name,
              competitorB: nm.competitorB!.name,
              roundLabel: roundLabel(nm.roundNumber, totalRounds),
            };
          }
        }
      }
    }
  }

  return {
    competitionName: competition.name,
    currentPhase,
    totalScoresSubmitted: snapshot.totalScoresSubmitted,
    totalScoresExpected: snapshot.totalScoresExpected,
    topStandings: snapshot.topStandings.slice(0, 5),
    currentMatchup,
    nextMatchup,
    champion,
  };
}
