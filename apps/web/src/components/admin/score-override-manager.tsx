'use client';

import { useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScoreOverrideForm } from './score-override-form';
import { AuditTrailPanel } from './audit-trail-panel';

interface ScoreOverrideManagerProps {
  competitionId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ScoreOverrideManager({ competitionId }: ScoreOverrideManagerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedScoreId = searchParams.get('score');

  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);

  const { data: scoreList = [], isLoading } = trpc.tournament.listScoresForOverride.useQuery({
    competitionId,
  });
  const { data: competition } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const { data: criteriaList = [] } = trpc.tournament.listCriteria.useQuery({
    competitionId,
  });

  const criteria = useMemo(
    () =>
      criteriaList.map((c) => ({
        id: c.id,
        name: c.name,
        min: parseFloat(c.minScore),
        max: parseFloat(c.maxScore),
      })),
    [criteriaList],
  );

  function viewHistory(scoreId: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('score', scoreId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Tabs key={selectedScoreId ?? 'none'} defaultValue={selectedScoreId ? 'audit' : 'active'}>
      <TabsList>
        <TabsTrigger value="active">Active Scores</TabsTrigger>
        <TabsTrigger value="audit">Audit Trail</TabsTrigger>
      </TabsList>

      <TabsContent value="active">
        {competition?.status !== 'active' && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
            Score overrides are only allowed while the competition is active. Current status:{' '}
            <strong>{competition?.status ?? 'unknown'}</strong>
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && scoreList.length === 0 && (
          <p className="text-sm text-muted-foreground">No scores submitted yet.</p>
        )}

        {scoreList.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Judge</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Competitor</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground text-right">
                    Total
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Submitted</th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Status</th>
                  <th className="py-2 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scoreList.map((s) => {
                  const isEditing = editingScoreId === s.scoreId;
                  const currentScores: Record<string, string> = {};
                  for (const c of s.criteriaScores) {
                    currentScores[c.criterionId] = c.value;
                  }
                  return (
                    <tr
                      key={s.scoreId}
                      className={`border-b border-border last:border-0 ${
                        s.hasOverrides ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      {!isEditing ? (
                        <>
                          <td className="py-3 pr-3">
                            <div className="font-medium">{s.judgeLabel}</div>
                            {s.groupIndex !== null && (
                              <div className="text-xs text-muted-foreground">
                                Group {s.groupIndex + 1}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="font-medium">{s.competitorName}</div>
                            <div className="text-xs text-muted-foreground">{s.participantId}</div>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {s.totalScore}
                          </td>
                          <td className="py-3 pr-3 text-xs text-muted-foreground">
                            {formatDate(s.submittedAt)}
                          </td>
                          <td className="py-3 pr-3 text-xs">
                            {s.hasOverrides ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                ⚠ Overridden
                              </span>
                            ) : (
                              <span className="text-green-700 dark:text-green-400">✓ Original</span>
                            )}
                          </td>
                          <td className="py-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingScoreId(s.scoreId)}
                              disabled={competition?.status !== 'active'}
                            >
                              Override
                            </Button>
                            {s.hasOverrides && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => viewHistory(s.scoreId)}
                              >
                                View history
                              </Button>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={6} className="py-3">
                          <ScoreOverrideForm
                            scoreId={s.scoreId}
                            competitorName={s.competitorName}
                            judgeLabel={s.judgeLabel}
                            criteria={criteria}
                            currentScores={currentScores}
                            onCancel={() => setEditingScoreId(null)}
                            onSuccess={() => setEditingScoreId(null)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="audit">
        {selectedScoreId ? (
          <AuditTrailPanel scoreId={selectedScoreId} criteria={criteria} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Click &quot;View history&quot; on a score row to see its audit trail.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
