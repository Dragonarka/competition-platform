'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { Link, useRouter } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { buttonVariants } from '@/components/ui/button';
import { useAdminSocket } from '@/hooks/use-admin-socket';
import { StartCypherPhasePanel } from '@/components/admin/start-cypher-phase-panel';
import { CypherResultsPanel } from '@/components/admin/cypher-results-panel';
import { BracketViewPanel } from '@/components/admin/bracket-view-panel';
import { TieResolutionBanner } from '@/components/admin/tie-resolution-banner';
import { SimulationCypherPanel } from '@/components/admin/simulation-cypher-panel';
import { SimulationBattlesPanel } from '@/components/admin/simulation-battles-panel';
import { SimulationResetPanel } from '@/components/admin/simulation-reset-panel';
import { SimulationHistoryPanel } from '@/components/admin/simulation-history-panel';

interface SimulationClientProps {
  competitionId: string;
}

export function SimulationClient({ competitionId }: SimulationClientProps) {
  const t = useTranslations('Simulation');
  const { data: competition, isLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const utils = trpc.useUtils();
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [clerkToken, setClerkToken] = useState<string | null>(null);

  const shouldRedirect = competition !== undefined && !competition.isSimulation;

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(`/competitions/${competitionId}`);
    }
  }, [shouldRedirect, competitionId, router]);

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

  useAdminSocket({
    competitionId,
    clerkToken: isLoaded && Boolean(isSignedIn) ? clerkToken : null,
    onSimulationReset: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.getBracket.invalidate({ competitionId });
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('loadingSimulation')}</p>;
  }
  if (!competition) {
    return <p className="text-destructive text-sm">{t('competitionNotFound')}</p>;
  }
  if (!competition.isSimulation) {
    return null;
  }

  const phaseLabel: string = (() => {
    if (competition.status === 'draft') return t('phaseSetup');
    if (competition.status === 'active' && !competition.cypherCompletedAt) return t('phaseCypher');
    if (competition.status === 'active' && competition.cypherCompletedAt) return t('phaseBattles');
    if (competition.status === 'completed') return t('phaseCompleted');
    return competition.status;
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
              {t('badge')}
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              {phaseLabel}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">{competition.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('bannerHint')}</p>
        </div>
        <Link
          href={`/competitions/${competitionId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t('settingsLink')}
        </Link>
      </div>

      <SimulationResetPanel competitionId={competitionId} />

      {competition.status === 'draft' && <StartCypherPhasePanel competitionId={competitionId} />}

      {competition.status === 'active' && !competition.cypherCompletedAt && (
        <>
          <SimulationCypherPanel competitionId={competitionId} />
          <CypherResultsPanel competitionId={competitionId} />
        </>
      )}

      {competition.status === 'active' && competition.cypherCompletedAt && (
        <>
          <TieResolutionBanner competitionId={competitionId} />
          <SimulationBattlesPanel competitionId={competitionId} />
          <BracketViewPanel competitionId={competitionId} />
        </>
      )}

      {competition.status === 'completed' && <BracketViewPanel competitionId={competitionId} />}

      <SimulationHistoryPanel competitionId={competitionId} />
    </div>
  );
}
