'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScoreOverrideForm } from './score-override-form';
import { AuditTrailPanel } from './audit-trail-panel';

interface ScoreOverrideManagerProps {
  competitionId: string;
}

export function ScoreOverrideManager({ competitionId }: ScoreOverrideManagerProps) {
  const t = useTranslations('ScoreOverride');
  const format = useFormatter();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedScoreId = searchParams.get('score');

  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);

  function formatDate(iso: string): string {
    try {
      return format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

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
        <TabsTrigger value="active">{t('tabActiveScores')}</TabsTrigger>
        <TabsTrigger value="audit">{t('tabAuditTrail')}</TabsTrigger>
      </TabsList>

      <TabsContent value="active">
        {competition?.status !== 'active' && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
            {t('notActiveWarning')} <strong>{competition?.status ?? '—'}</strong>
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">{t('loadingScores')}</p>}

        {!isLoading && scoreList.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noScoresSubmitted')}</p>
        )}

        {scoreList.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">
                    {t('columnJudge')}
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">
                    {t('columnCompetitor')}
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground text-right">
                    {t('columnTotal')}
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">
                    {t('columnSubmitted')}
                  </th>
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">
                    {t('columnStatus')}
                  </th>
                  <th className="py-2 font-semibold text-muted-foreground">{t('columnActions')}</th>
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
                                {t('judgeGroupTag', { n: s.groupIndex + 1 })}
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
                                {t('statusOverridden')}
                              </span>
                            ) : (
                              <span className="text-green-700 dark:text-green-400">
                                {t('statusOriginal')}
                              </span>
                            )}
                          </td>
                          <td className="py-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingScoreId(s.scoreId)}
                              disabled={competition?.status !== 'active'}
                            >
                              {t('overrideCta')}
                            </Button>
                            {s.hasOverrides && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => viewHistory(s.scoreId)}
                              >
                                {t('viewHistory')}
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
          <p className="text-sm text-muted-foreground">{t('auditEmptyPrompt')}</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
