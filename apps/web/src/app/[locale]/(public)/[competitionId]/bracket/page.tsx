import { notFound } from 'next/navigation';
import { TRPCClientError } from '@trpc/client';
import { getTranslations } from 'next-intl/server';
import { createServerTrpcClient } from '@/lib/trpc-server';
import { BracketClientIsland } from '@/components/public/bracket-client-island';
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

export default async function BracketPage({ params }: PageProps) {
  const { competitionId } = await params;
  const client = createServerTrpcClient();
  const t = await getTranslations('PublicBracket');

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <PageHeader>
        <PageHeaderText>
          <PageHeaderEyebrow>{t('pageTitle')}</PageHeaderEyebrow>
          <PageHeaderTitle>{t('title')}</PageHeaderTitle>
        </PageHeaderText>
        <PageHeaderActions>
          <StatusBadge variant="live" dot>
            {t('statusConnected')}
          </StatusBadge>
          <ShareLinkButton />
        </PageHeaderActions>
      </PageHeader>
      <BracketClientIsland competitionId={competitionId} initialBracket={initialBracket} />
    </div>
  );
}
