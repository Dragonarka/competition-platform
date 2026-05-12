'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { JudgeVoteInput } from '@competition-platform/format-cypher-battles';
import { isNetworkError } from '@/lib/network-error';
import type { QueuedVoteSubmission } from '@/lib/offline-queue';

interface BattlesVotingScreenProps {
  token: string;
  enqueueVote: (s: QueuedVoteSubmission) => void;
  revoteNoticeMatchupId?: string | null;
  onRevoteNoticeDismiss?: () => void;
}

type Status = 'idle' | 'sending' | 'confirmed' | 'queued' | 'error';

export function BattlesVotingScreen({
  token,
  enqueueVote,
  revoteNoticeMatchupId,
  onRevoteNoticeDismiss,
}: BattlesVotingScreenProps) {
  const t = useTranslations('Judge');
  const utils = trpc.useUtils();
  const submitVote = trpc.tournament.submitVote.useMutation();
  const [status, setStatus] = useState<Status>('idle');
  const submitLockRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!revoteNoticeMatchupId) return;
    const id = setTimeout(() => onRevoteNoticeDismiss?.(), 4000);
    return () => clearTimeout(id);
  }, [revoteNoticeMatchupId, onRevoteNoticeDismiss]);

  const { data, isLoading } = trpc.tournament.getBattlesAssignment.useQuery(
    { token },
    { refetchOnWindowFocus: true },
  );

  if (isLoading || !data) {
    return <p className="text-muted-foreground">{t('loadingMatchup')}</p>;
  }

  if (!data.battlesActive) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-muted-foreground">{t('battlesNotStarted')}</p>
      </div>
    );
  }

  if (data.currentMatchup === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-muted-foreground animate-pulse">{t('waitingNextMatchup')}</p>
      </div>
    );
  }

  const matchup = data.currentMatchup;

  async function handleVote(choice: 'player1' | 'player2' | 'tie') {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const submission: QueuedVoteSubmission = {
      kind: 'vote',
      token,
      matchupId: matchup.matchupId,
      vote: choice,
      idempotencyKey,
      queuedAt: new Date().toISOString(),
    };
    setStatus('sending');
    try {
      await submitVote.mutateAsync({
        token,
        matchupId: matchup.matchupId,
        vote: choice,
        idempotencyKey,
      });
      setStatus('confirmed');
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        void utils.tournament.getBattlesAssignment.invalidate({ token });
        setStatus('idle');
        submitLockRef.current = false;
        advanceTimerRef.current = null;
      }, 600);
    } catch (err) {
      if (isNetworkError(err)) {
        enqueueVote(submission);
        setStatus('queued');
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          void utils.tournament.getBattlesAssignment.invalidate({ token });
          setStatus('idle');
          submitLockRef.current = false;
          advanceTimerRef.current = null;
        }, 1500);
      } else {
        setStatus('error');
        submitLockRef.current = false;
      }
    }
  }

  if (status === 'confirmed') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg font-semibold text-green-600">{t('voteSubmittedExclaim')}</p>
      </div>
    );
  }
  if (status === 'queued') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg font-semibold text-yellow-600">{t('queuedNotice')}</p>
      </div>
    );
  }

  const showRevoteNotice =
    revoteNoticeMatchupId !== null &&
    revoteNoticeMatchupId !== undefined &&
    revoteNoticeMatchupId === matchup.matchupId;

  return (
    <div className="flex flex-col gap-4">
      {showRevoteNotice && (
        <p
          role="status"
          className="rounded border border-yellow-500/40 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-200"
        >
          {t('revoteNotice')}
        </p>
      )}
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        {t('matchupHeader', {
          round: matchup.roundNumber,
          match: matchup.bracketPosition + 1,
        })}
      </p>
      <JudgeVoteInput
        key={matchup.matchupId}
        matchupId={matchup.matchupId}
        player1Id={matchup.competitorA.id}
        player1Name={matchup.competitorA.name}
        player1Seed={matchup.competitorA.seed ?? null}
        player2Id={matchup.competitorB.id}
        player2Name={matchup.competitorB.name}
        player2Seed={matchup.competitorB.seed ?? null}
        onVote={handleVote}
        disabled={status === 'sending'}
        labels={{
          seed: (n) => t('seed', { n }),
          submitting: t('voteSubmitting'),
          voteForPlayer1: t('voteForA', { name: matchup.competitorA.name }),
          voteForPlayer2: t('voteForB', { name: matchup.competitorB.name }),
          voteTie: t('voteTie'),
        }}
      />
      {status === 'error' && <p className="text-sm text-destructive">{t('submissionFailed')}</p>}
    </div>
  );
}
