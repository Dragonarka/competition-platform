'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useJudgeSocket } from '@/hooks/use-judge-socket';
import { useScoringStore } from '@/stores/scoring.store';
// TODO: load via FormatRenderer once format registry is implemented
import { JudgeScoreInput } from '@competition-platform/format-cypher-battles';

const DRAFT_KEY = (judgeSessionId: string, competitorId: string) =>
  `judge-draft-${judgeSessionId}-${competitorId}`;

function parseDraft(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const STATUS_COLORS = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
} as const;

export default function JudgePage() {
  const { token } = useParams<{ token: string }>();
  const { submissionStatus, connectionStatus, setSubmissionStatus, setConnectionStatus } =
    useScoringStore();
  const utils = trpc.useUtils();
  const [localScoredIds, setLocalScoredIds] = useState<string[]>([]);
  const submitLockRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
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

  const { data: assignments } = trpc.tournament.getJudgeAssignments.useQuery(
    { token },
    { enabled: tokenData?.competitionStatus === 'active' },
  );

  const submitScoreMutation = trpc.tournament.submitScore.useMutation();

  useJudgeSocket({
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
    onStatusChange: setConnectionStatus,
  });

  const ConnectionDot = (
    <div className="fixed top-3 right-3 flex items-center gap-2 z-10">
      <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[connectionStatus]}`} />
      <span className="text-xs text-muted-foreground">
        {connectionStatus === 'connected' ? 'Online' : connectionStatus}
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Validating link...</p>
      </main>
    );
  }

  if (error) {
    const isInvalidLink = error.data?.code === 'NOT_FOUND';
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-2xl font-bold">
            {isInvalidLink ? 'Link Not Valid' : 'Something went wrong'}
          </h1>
          <p className="text-muted-foreground">
            {isInvalidLink
              ? 'This judge link is invalid or has been revoked. Contact the organizer for a new link.'
              : 'Unable to validate your link. Please try again.'}
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
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-2xl font-bold">Welcome, {tokenData.label}</h1>
          <p className="text-muted-foreground">
            Competition: <strong>{tokenData.competitionName}</strong>
          </p>
          <p className="text-sm text-muted-foreground animate-pulse">
            Waiting for competition to start...
          </p>
        </div>
      </main>
    );
  }

  if (!assignments) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        {ConnectionDot}
        <p className="text-muted-foreground">Loading assignments...</p>
      </main>
    );
  }

  const allScoredIds = [...new Set([...assignments.scoredCompetitorIds, ...localScoredIds])];
  const unscored = assignments.assignedCompetitors.filter((c) => !allScoredIds.includes(c.id));

  if (unscored.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        {ConnectionDot}
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">All done!</p>
          <p className="text-muted-foreground">Waiting for next round...</p>
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
    // Synchronous lock — prevents double-submit if React hasn't yet propagated
    // the submitting state to the button's disabled prop.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const idempotencyKey = crypto.randomUUID();
    setSubmissionStatus('sending');
    try {
      await submitScoreMutation.mutateAsync({
        token,
        competitorId: currentCompetitor.id,
        scores: Object.entries(formattedScores).map(([criterionId, value]) => ({
          criterionId,
          value,
        })),
        idempotencyKey,
      });
      localStorage.removeItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id));
      setSubmissionStatus('confirmed');
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        setLocalScoredIds((prev) => [...prev, currentCompetitor.id]);
        setSubmissionStatus('idle');
        submitLockRef.current = false;
        advanceTimerRef.current = null;
      }, 800);
    } catch {
      setSubmissionStatus('error');
      submitLockRef.current = false;
    }
  }

  return (
    <main className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
      {ConnectionDot}
      <div className="mb-6 pt-8">
        <p className="text-sm text-muted-foreground">{tokenData.label}</p>
        <p className="text-xs text-muted-foreground">
          {unscored.length} of {assignments.assignedCompetitors.length} remaining
        </p>
      </div>

      {submissionStatus === 'confirmed' ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-lg font-semibold text-green-600">Score submitted!</p>
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
        />
      )}

      {submissionStatus === 'error' && (
        <p className="mt-4 text-sm text-destructive">Submission failed. Please try again.</p>
      )}
    </main>
  );
}
