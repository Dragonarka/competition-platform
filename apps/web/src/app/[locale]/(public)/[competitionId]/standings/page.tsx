import { notFound } from 'next/navigation';
import { TRPCClientError } from '@trpc/client';
import { getTranslations } from 'next-intl/server';
import { createServerTrpcClient } from '@/lib/trpc-server';
import { StandingsClientIsland } from '@/components/public/standings-client-island';
import { ShareLinkButton } from '@/components/public/share-link-button';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderEyebrow,
  PageHeaderText,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';

interface PageProps {
  params: Promise<{ competitionId: string }>;
}

// Server component: SSR-fetches initial standings + next-matchup hints,
// hands them to the client island as props. Subsequent live updates flow
// through usePublicSocket inside the island. (Story 6.1)
export default async function StandingsPage({ params }: PageProps) {
  const { competitionId } = await params;
  const client = createServerTrpcClient();
  const t = await getTranslations('PublicStandings');

  let initialStandings;
  let initialNext;
  try {
    [initialStandings, initialNext] = await Promise.all([
      client.tournament.getStandings.query({ competitionId }),
      client.tournament.getPublicNextMatchups.query({ competitionId }),
    ]);
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.code === 'NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <PageHeader>
        <PageHeaderText>
          <PageHeaderEyebrow>{t('liveTitle')}</PageHeaderEyebrow>
          <PageHeaderTitle>{t('title')}</PageHeaderTitle>
        </PageHeaderText>
        <PageHeaderActions>
          <StatusBadge variant="live" dot>
            {t('statusConnected')}
          </StatusBadge>
          <ShareLinkButton />
        </PageHeaderActions>
      </PageHeader>
      <StandingsClientIsland
        competitionId={competitionId}
        initialStandings={initialStandings}
        initialNext={initialNext}
      />
    </div>
  );
}
