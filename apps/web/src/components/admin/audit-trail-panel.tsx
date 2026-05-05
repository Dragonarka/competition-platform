'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';

interface CriterionInfo {
  id: string;
  name: string;
}

interface AuditTrailPanelProps {
  scoreId: string;
  criteria: CriterionInfo[];
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditTrailPanel({ scoreId, criteria }: AuditTrailPanelProps) {
  const nameMap = useMemo(() => new Map(criteria.map((c) => [c.id, c.name])), [criteria]);

  const {
    data: trail,
    isLoading,
    error,
  } = trpc.tournament.getScoreAuditTrail.useQuery({ scoreId }, { enabled: Boolean(scoreId) });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading audit trail...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">
        {error.message}
      </p>
    );
  }

  if (!trail) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{trail.competitorName}</h2>
        <p className="text-sm text-muted-foreground">Score from {trail.judgeLabel}</p>
      </div>

      {trail.chain.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events found for this score.</p>
      ) : (
        <ol className="space-y-4 border-l-2 border-border pl-6 ml-2">
          {trail.chain.map((entry) => {
            if (entry.kind === 'submitted') {
              return (
                <li key={`s-${entry.sequence}`} className="relative">
                  <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-green-500 ring-4 ring-background" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Submitted
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt)} &middot; sequence #{entry.sequence}
                    </p>
                    <table className="text-xs mt-2">
                      <tbody>
                        {entry.criteriaScores.map((c) => (
                          <tr key={c.criterionId}>
                            <td className="pr-3 text-muted-foreground">
                              {nameMap.get(c.criterionId) ?? c.criterionId}
                            </td>
                            <td className="font-mono">{c.value}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-border">
                          <td className="pt-1 pr-3 font-semibold">Total</td>
                          <td className="pt-1 font-mono font-bold">{entry.totalScore}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </li>
              );
            }
            return (
              <li key={`o-${entry.sequence}`} className="relative">
                <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-background" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Overridden
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)} &middot; sequence #{entry.sequence}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {/* TODO(post-MVP): resolve overriddenByClerkId to organizer
                        name/email via clerkClient.users.getUser() — add a
                        getOrganizerProfile tRPC query with 5-min cache. Out of
                        scope for Story 4.2. */}
                    by <span className="font-mono">{entry.overriddenByClerkId}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-mono">{entry.originalTotalScore}</span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="font-mono font-bold">{entry.newTotalScore}</span>
                  </p>
                  <blockquote className="border-l-2 border-amber-500/40 pl-3 italic text-sm text-foreground/90 mt-2">
                    {entry.reason}
                  </blockquote>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-muted-foreground">
                      Show criteria diff
                    </summary>
                    <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                      <div>
                        <p className="font-semibold mb-1">Original</p>
                        <table>
                          <tbody>
                            {entry.originalCriteriaScores.map((c) => (
                              <tr key={c.criterionId}>
                                <td className="pr-3 text-muted-foreground">
                                  {nameMap.get(c.criterionId) ?? c.criterionId}
                                </td>
                                <td className="font-mono">{c.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <p className="font-semibold mb-1">New</p>
                        <table>
                          <tbody>
                            {entry.newCriteriaScores.map((c) => (
                              <tr key={c.criterionId}>
                                <td className="pr-3 text-muted-foreground">
                                  {nameMap.get(c.criterionId) ?? c.criterionId}
                                </td>
                                <td className="font-mono">{c.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
