'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface CompetitorManagementPanelProps {
  competitionId: string;
}

interface ActionFormState {
  competitorId: string;
  action: 'withdraw' | 'rescue';
  reason: string;
  error: string | null;
}

export function CompetitorManagementPanel({ competitionId }: CompetitorManagementPanelProps) {
  const t = useTranslations('Competitors');
  const tErr = useTranslations();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<ActionFormState | null>(null);

  const { data: competitors = [], isLoading } = trpc.tournament.listCompetitorsWithStatus.useQuery({
    competitionId,
  });
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });

  const withdrawMutation = trpc.tournament.withdrawCompetitor.useMutation({
    onSuccess: () => {
      setForm(null);
      void utils.tournament.listCompetitorsWithStatus.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      const msg = key ? tErr(key) : err.message;
      setForm((prev) => (prev ? { ...prev, error: msg } : prev));
    },
  });

  const rescueMutation = trpc.tournament.rescueCompetitor.useMutation({
    onSuccess: () => {
      setForm(null);
      void utils.tournament.listCompetitorsWithStatus.invalidate({ competitionId });
      void utils.tournament.getStandings.invalidate({ competitionId });
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      const msg = key ? tErr(key) : err.message;
      setForm((prev) => (prev ? { ...prev, error: msg } : prev));
    },
  });

  const isCompetitionActive = competition?.status === 'active';
  const hasCypherCompleted =
    competition?.cypherCompletedAt !== null && competition?.cypherCompletedAt !== undefined;

  function openForm(competitorId: string, action: 'withdraw' | 'rescue') {
    setForm({ competitorId, action, reason: '', error: null });
  }

  function handleSubmit() {
    if (!form) return;
    const trimmedReason = form.reason.trim();
    if (!trimmedReason) return;
    if (form.action === 'withdraw') {
      withdrawMutation.mutate({
        competitorId: form.competitorId,
        competitionId,
        reason: trimmedReason,
      });
    } else {
      rescueMutation.mutate({
        competitorId: form.competitorId,
        competitionId,
        reason: trimmedReason,
      });
    }
  }

  return (
    <div className="space-y-4">
      {!isCompetitionActive && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t('notActiveWarning')} <strong>{competition?.status ?? '—'}</strong>
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t('loading')}</p>}

      {!isLoading && competitors.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}

      {competitors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold text-muted-foreground">{t('columnName')}</th>
                <th className="py-2 pr-3 font-semibold text-muted-foreground">
                  {t('columnParticipantId')}
                </th>
                <th className="py-2 pr-3 font-semibold text-muted-foreground">
                  {t('columnStatus')}
                </th>
                <th className="py-2 font-semibold text-muted-foreground">{t('columnActions')}</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => {
                const isFormOpen = form?.competitorId === c.id;
                const isWithdrawn = c.status === 'withdrawn';

                return (
                  <tr
                    key={c.id}
                    className={`border-b border-border last:border-0 ${isWithdrawn ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                  >
                    {!isFormOpen ? (
                      <>
                        <td className="py-3 pr-3 font-medium">{c.name}</td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          {c.participantId}
                        </td>
                        <td className="py-3 pr-3">
                          {isWithdrawn ? (
                            <span className="text-amber-700 dark:text-amber-400 text-xs font-medium">
                              {t('withdrawnBadge')}
                            </span>
                          ) : (
                            <span className="text-green-700 dark:text-green-400 text-xs font-medium">
                              {t('activeBadge')}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          {!isWithdrawn && isCompetitionActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openForm(c.id, 'withdraw')}
                            >
                              {t('withdrawCta')}
                            </Button>
                          )}
                          {isWithdrawn && isCompetitionActive && hasCypherCompleted && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openForm(c.id, 'rescue')}
                            >
                              {t('rescueCta')}
                            </Button>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-3">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            {form.action === 'withdraw'
                              ? t('withdrawTitle', { name: c.name })
                              : t('rescueTitle', { name: c.name })}
                          </p>
                          <input
                            type="text"
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder={t('actionReasonPlaceholder')}
                            value={form.reason}
                            onChange={(e) =>
                              setForm((prev) =>
                                prev ? { ...prev, reason: e.target.value, error: null } : prev,
                              )
                            }
                            maxLength={500}
                          />
                          {form.error && <p className="text-destructive text-sm">{form.error}</p>}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleSubmit}
                              disabled={
                                form.reason.trim().length === 0 ||
                                withdrawMutation.isPending ||
                                rescueMutation.isPending
                              }
                            >
                              {t('confirm')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setForm(null)}
                              disabled={withdrawMutation.isPending || rescueMutation.isPending}
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
