import { notFound } from 'next/navigation';
import { TRPCClientError } from '@trpc/client';
import { createServerTrpcClient } from '@/lib/trpc-server';
import { BracketClientIsland } from '@/components/public/bracket-client-island';

interface PageProps {
  params: Promise<{ competitionId: string }>;
}

export default async function BracketPage({ params }: PageProps) {
  const { competitionId } = await params;
  const client = createServerTrpcClient();

  let initialBracket;
  try {
    initialBracket = await client.tournament.getPublicBracket.query({
      competitionId,
    });
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.code === 'NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  return <BracketClientIsland competitionId={competitionId} initialBracket={initialBracket} />;
}
