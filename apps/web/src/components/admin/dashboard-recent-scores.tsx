'use client';

import type { ScoreSubmittedPayload } from '@competition-platform/shared';

interface RecentScoreEntry {
  key: string;
  judgeSessionId: string;
  competitorId: string;
  competitionId: string;
  scores: { criterionId: string; value: string }[];
  idempotencyKey: string;
  submittedAt: string;
}

interface DashboardRecentScoresProps {
  entries: RecentScoreEntry[];
  judgeLabels: Map<string, string>;
  competitorNames: Map<string, string>;
}

function totalRawScore(scores: { value: string }[]): string {
  const sum = scores.reduce((acc, s) => acc + parseFloat(s.value), 0);
  return sum.toFixed(2);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

export function DashboardRecentScores({
  entries,
  judgeLabels,
  competitorNames,
}: DashboardRecentScoresProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No scores submitted yet.</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div
          key={entry.key}
          className="flex items-center justify-between gap-2 text-sm py-2 border-b border-border last:border-0"
        >
          <div className="min-w-0">
            <span className="font-medium truncate block">
              {competitorNames.get(entry.competitorId) ?? entry.competitorId}
            </span>
            <span className="text-xs text-muted-foreground truncate block">
              by {judgeLabels.get(entry.judgeSessionId) ?? entry.judgeSessionId}
            </span>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-mono font-bold">{totalRawScore(entry.scores)}</span>
            <span className="text-xs text-muted-foreground block">
              {formatTime(entry.submittedAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function scorePayloadToEntry(p: ScoreSubmittedPayload, key: string): RecentScoreEntry {
  return {
    key,
    judgeSessionId: p.judgeSessionId,
    competitorId: p.competitorId,
    competitionId: p.competitionId,
    scores: p.scores,
    idempotencyKey: p.idempotencyKey,
    submittedAt: p.submittedAt,
  };
}
