import { notFound } from 'next/navigation';
import { TRPCClientError } from '@trpc/client';
import { createServerTrpcClient } from '@/lib/trpc-server';
import { StandingsClientIsland } from '@/components/public/standings-client-island';

interface PageProps {
  params: Promise<{ competitionId: string }>;
}

// Server component: SSR-fetches initial standings + next-matchup hints,
// hands them to the client island as props. Subsequent live updates flow
// through usePublicSocket inside the island. (Story 6.1)
export default async function StandingsPage({ params }: PageProps) {
  const { competitionId } = await params;
  const client = createServerTrpcClient();

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
    <StandingsClientIsland
      competitionId={competitionId}
      initialStandings={initialStandings}
      initialNext={initialNext}
    />
  );
}
