'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { useJudgeSocket } from '@/hooks/use-judge-socket';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useScoringStore } from '@/stores/scoring.store';
import type { QueuedSubmission, QueuedVoteSubmission } from '@/lib/offline-queue';
import { DRAFT_KEY, parseDraft } from '@/lib/judge-draft';
import { isNetworkError } from '@/lib/network-error';
import { BattlesVotingScreen } from '@/components/judge/battles-voting-screen';
// TODO: load via FormatRenderer once format registry is implemented
import { JudgeScoreInput } from '@competition-platform/format-cypher-battles';

const STATUS_COLORS = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
} as const;

interface DrainNotice {
  id: string;
  variant: 'success' | 'error';
  message: string;
}

const DRAIN_SUCCESS_MS = 2500;
const DRAIN_ERROR_MS = 6000;

export default function JudgePage() {
  const t = useTranslations('Judge');
  const { token } = useParams<{ token: string }>();
  const { submissionStatus, connectionStatus, setSubmissionStatus, setConnectionStatus } =
    useScoringStore();
  const utils = trpc.useUtils();
  const [localScoredIds, setLocalScoredIds] = useState<string[]>([]);
  const [drainNotices, setDrainNotices] = useState<DrainNotice[]>([]);
  const submitLockRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drainNoticeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      drainNoticeTimersRef.current.forEach((tm) => clearTimeout(tm));
      drainNoticeTimersRef.current.clear();
    };
  }, []);

  const pushDrainNotice = useCallback((notice: DrainNotice, durationMs: number) => {
    setDrainNotices((prev) => [...prev, notice]);
    const timer = setTimeout(() => {
      setDrainNotices((prev) => prev.filter((n) => n.id !== notice.id));
      drainNoticeTimersRef.current.delete(notice.id);
    }, durationMs);
    drainNoticeTimersRef.current.set(notice.id, timer);
  }, []);

  const {
    data: tokenData,
    isLoading,
    error,
  } = trpc.tournament.validateJudgeToken.useQuery(
    { token },
    {
      retry: false,
      refetchInterval: (query) => (query.state.data?.competitionStatus === 'draft' ? 5000 : false),
    },
  );

  const inBattlesPhase =
    tokenData?.competitionStatus === 'active' && tokenData.cypherCompletedAt !== null;
  const inCypherPhase =
    tokenData?.competitionStatus === 'active' && tokenData.cypherCompletedAt === null;

  const { data: assignments } = trpc.tournament.getJudgeAssignments.useQuery(
    { token },
    { enabled: inCypherPhase },
  );

  const submitScoreMutation = trpc.tournament.submitScore.useMutation();

  const [revoteNoticeMatchupId, setRevoteNoticeMatchupId] = useState<string | null>(null);

  const socketRef = useJudgeSocket({
    token,
    judgeSessionId: tokenData?.judgeSessionId ?? '',
    competitionId: tokenData?.competitionId ?? '',
    onCompetitionStarted: () => {
      void utils.tournament.validateJudgeToken.invalidate({ token });
      void utils.tournament.getJudgeAssignments.invalidate({ token });
    },
    onScoreSubmitted: () => {
      void utils.tournament.getJudgeAssignments.invalidate({ token });
    },
    onVoteSubmitted: () => {
      void utils.tournament.getBattlesAssignment.invalidate({ token });
    },
    onMatchupCompleted: () => {
      void utils.tournament.getBattlesAssignment.invalidate({ token });
    },
    onMatchupRevoteRequired: (p) => {
      setRevoteNoticeMatchupId(p.matchupId);
      void utils.tournament.getBattlesAssignment.invalidate({ token });
    },
    onBracketAdvanced: () => {
      void utils.tournament.getBattlesAssignment.invalidate({ token });
    },
    onCompetitionCompleted: () => {
      void utils.tournament.getBattlesAssignment.invalidate({ token });
    },
    onSimulationReset: () => {
      void utils.tournament.validateJudgeToken.invalidate({ token });
      void utils.tournament.getJudgeAssignments.invalidate({ token });
      void utils.tournament.getBattlesAssignment.invalidate({ token });
      setLocalScoredIds([]);
    },
    onStatusChange: setConnectionStatus,
  });

  const submitVoteMutation = trpc.tournament.submitVote.useMutation();

  const offlineQueue = useOfflineQueue({
    judgeSessionId: tokenData?.judgeSessionId ?? '',
    submitFn: async (s: QueuedSubmission) => {
      if (s.kind === 'vote') {
        return submitVoteMutation.mutateAsync({
          token: s.token,
          matchupId: s.matchupId,
          vote: s.vote,
          idempotencyKey: s.idempotencyKey,
        });
      }
      return submitScoreMutation.mutateAsync({
        token: s.token,
        competitorId: s.competitorId,
        scores: s.scores,
        idempotencyKey: s.idempotencyKey,
      });
    },
    onSuccess: (s) => {
      void utils.tournament.getJudgeAssignments.invalidate({ token });
      pushDrainNotice(
        {
          id: s.idempotencyKey,
          variant: 'success',
          message: s.kind === 'vote' ? t('voteSubmittedNotice') : t('scoreSubmittedNotice'),
        },
        DRAIN_SUCCESS_MS,
      );
      if (s.kind === 'vote') {
        void utils.tournament.getBattlesAssignment.invalidate({ token });
      }
    },
    onPermanentFailure: (s, err) => {
      console.error('[offline-queue] permanent failure dropped from queue', {
        kind: s.kind,
        idempotencyKey: s.idempotencyKey,
        err,
      });
      pushDrainNotice(
        {
          id: s.idempotencyKey,
          variant: 'error',
          message: s.kind === 'vote' ? t('voteFailedNotice') : t('scoreFailedNotice'),
        },
        DRAIN_ERROR_MS,
      );
    },
    onQueueSizeChanged: (size) => {
      const socket = socketRef.current;
      const judgeSessionId = tokenData?.judgeSessionId;
      const competitionId = tokenData?.competitionId;
      if (socket?.connected && judgeSessionId && competitionId) {
        socket.emit('judge.status', { competitionId, sessionId: judgeSessionId, queueSize: size });
      }
    },
  });

  const ConnectionDot = (
    <div className="fixed top-3 right-3 flex items-center gap-2 z-10">
      {tokenData?.isSimulation && (
        <span
          data-testid="practice-mode-badge"
          className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
        >
          {t('practiceModeBadge')}
        </span>
      )}
      <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[connectionStatus]}`} />
      <span className="text-xs text-muted-foreground">
        {connectionStatus === 'connected' ? t('online') : connectionStatus}
      </span>
      {offlineQueue.queueSize > 0 && (
        <span className="text-xs text-yellow-600">
          {t('queuedCount', { n: offlineQueue.queueSize })}
        </span>
      )}
    </div>
  );

  const DrainNoticesStack = drainNotices.length > 0 && (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-12 right-3 flex flex-col gap-1 z-20 max-w-xs"
    >
      {drainNotices.map((n) => (
        <div
          key={n.id}
          className={`text-xs px-3 py-2 rounded shadow ${
            n.variant === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {n.message}
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t('validating')}</p>
      </main>
    );
  }

  if (error) {
    const isInvalidLink = error.data?.code === 'NOT_FOUND';
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-2xl font-bold">
            {isInvalidLink ? t('linkNotValid') : t('somethingWrong')}
          </h1>
          <p className="text-muted-foreground">
            {isInvalidLink ? t('linkNotValidHint') : t('somethingWrongHint')}
          </p>
        </div>
      </main>
    );
  }

  if (!tokenData) return null;

  if (tokenData.competitionStatus === 'draft') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        {ConnectionDot}
        {DrainNoticesStack}
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-2xl font-bold">{t('welcome', { name: tokenData.label })}</h1>
          <p className="text-muted-foreground">
            {t('competitionLabel')} <strong>{tokenData.competitionName}</strong>
          </p>
          <p className="text-sm text-muted-foreground animate-pulse">{t('waitingForStart')}</p>
        </div>
      </main>
    );
  }

  if (inBattlesPhase) {
    return (
      <main className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
        {ConnectionDot}
        {DrainNoticesStack}
        <div className="mb-6 pt-8">
          <p className="text-sm text-muted-foreground">{tokenData.label}</p>
          <p className="text-xs text-muted-foreground">{t('battlesPhase')}</p>
        </div>
        <BattlesVotingScreen
          token={token}
          enqueueVote={(s: QueuedVoteSubmission) => offlineQueue.enqueue(s)}
          revoteNoticeMatchupId={revoteNoticeMatchupId}
          onRevoteNoticeDismiss={() => setRevoteNoticeMatchupId(null)}
        />
      </main>
    );
  }

  if (!assignments) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        {ConnectionDot}
        {DrainNoticesStack}
        <p className="text-muted-foreground">{t('loadingAssignments')}</p>
      </main>
    );
  }

  const allScoredIds = [...new Set([...assignments.scoredCompetitorIds, ...localScoredIds])];
  const unscored = assignments.assignedCompetitors.filter((c) => !allScoredIds.includes(c.id));

  if (unscored.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        {ConnectionDot}
        {DrainNoticesStack}
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">{t('allDone')}</p>
          <p className="text-muted-foreground">{t('waitingNextRound')}</p>
        </div>
      </main>
    );
  }

  const currentCompetitor = unscored[0]!;
  const { judgeSessionId } = assignments;

  const defaultValues: Record<string, string> =
    typeof window !== 'undefined'
      ? parseDraft(localStorage.getItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id)))
      : {};

  async function handleScoreSubmit(formattedScores: Record<string, string>) {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const idempotencyKey = crypto.randomUUID();
    const submission: QueuedSubmission = {
      kind: 'score',
      token,
      competitorId: currentCompetitor.id,
      scores: Object.entries(formattedScores).map(([criterionId, value]) => ({
        criterionId,
        value,
      })),
      idempotencyKey,
      queuedAt: new Date().toISOString(),
    };
    setSubmissionStatus('sending');
    try {
      await submitScoreMutation.mutateAsync(submission);
      localStorage.removeItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id));
      setSubmissionStatus('confirmed');
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        setLocalScoredIds((prev) => [...prev, currentCompetitor.id]);
        setSubmissionStatus('idle');
        submitLockRef.current = false;
        advanceTimerRef.current = null;
      }, 800);
    } catch (err) {
      if (isNetworkError(err)) {
        offlineQueue.enqueue(submission);
        localStorage.removeItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id));
        setSubmissionStatus('queued');
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          setLocalScoredIds((prev) => [...prev, currentCompetitor.id]);
          setSubmissionStatus('idle');
          submitLockRef.current = false;
          advanceTimerRef.current = null;
        }, 1500);
      } else {
        setSubmissionStatus('error');
        submitLockRef.current = false;
      }
    }
  }

  return (
    <main className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
      {ConnectionDot}
      {DrainNoticesStack}
      <div className="mb-6 pt-8">
        <p className="text-sm text-muted-foreground">{tokenData.label}</p>
        <p className="text-xs text-muted-foreground">
          {t('remaining', {
            remaining: unscored.length,
            total: assignments.assignedCompetitors.length,
          })}
        </p>
      </div>

      {submissionStatus === 'confirmed' ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-lg font-semibold text-green-600">{t('scoreSubmittedExclaim')}</p>
        </div>
      ) : submissionStatus === 'queued' ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-lg font-semibold text-yellow-600">{t('queuedNotice')}</p>
        </div>
      ) : (
        <JudgeScoreInput
          key={currentCompetitor.id}
          competitorId={currentCompetitor.id}
          competitorName={currentCompetitor.name}
          participantId={currentCompetitor.participantId}
          criteria={assignments.criteria.map((c) => ({
            id: c.id,
            name: c.name,
            min: parseFloat(c.minScore),
            max: parseFloat(c.maxScore),
          }))}
          defaultValues={defaultValues}
          onValuesChange={(values) => {
            localStorage.setItem(
              DRAFT_KEY(judgeSessionId, currentCompetitor.id),
              JSON.stringify(values),
            );
          }}
          onSubmit={handleScoreSubmit}
          disabled={submissionStatus === 'sending'}
          labels={{
            idPrefix: t('scoreIdPrefix'),
            rangeFormat: (min, max) => t('scoreRange', { min, max }),
            outOfRange: (criterion, min, max) => t('scoreOutOfRange', { criterion, min, max }),
            submitting: t('voteSubmitting'),
            submit: t('submitScore'),
          }}
        />
      )}

      {submissionStatus === 'error' && (
        <p className="mt-4 text-sm text-destructive">{t('submissionFailed')}</p>
      )}
    </main>
  );
}
