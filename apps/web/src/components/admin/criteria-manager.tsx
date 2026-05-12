'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface CriteriaManagerProps {
  competitionId: string;
}

export function CriteriaManager({ competitionId }: CriteriaManagerProps) {
  const t = useTranslations('Criteria');
  const tCommon = useTranslations('Common');
  const tErr = useTranslations();
  const [name, setName] = useState('');
  const [minScore, setMinScore] = useState('0');
  const [maxScore, setMaxScore] = useState('10');
  const [minError, setMinError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const criteriaQuery = trpc.tournament.listCriteria.useQuery({ competitionId });
  const templatesQuery = trpc.tournament.listCompetitionsWithCriteria.useQuery();

  const utils = trpc.useUtils();

  const addMutation = trpc.tournament.addCriterion.useMutation({
    onSuccess() {
      utils.tournament.listCriteria.invalidate({ competitionId });
      setName('');
      setMinScore('0');
      setMaxScore('10');
      setMinError('');
    },
  });

  const removeMutation = trpc.tournament.removeCriterion.useMutation({
    onSuccess() {
      utils.tournament.listCriteria.invalidate({ competitionId });
    },
  });

  const copyMutation = trpc.tournament.copyCriteriaTemplate.useMutation({
    onSuccess() {
      utils.tournament.listCriteria.invalidate({ competitionId });
      utils.tournament.listCompetitionsWithCriteria.invalidate();
      setSelectedTemplate('');
    },
  });

  const availableTemplates = templatesQuery.data?.filter((c) => c.id !== competitionId);

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMinError('');

    const min = parseFloat(minScore);
    const max = parseFloat(maxScore);

    if (isNaN(min) || isNaN(max) || min >= max) {
      setMinError(t('minError'));
      return;
    }

    addMutation.mutate({
      competitionId,
      name: name.trim(),
      minScore: min.toFixed(2),
      maxScore: max.toFixed(2),
    });
  }

  function handleCopyTemplate() {
    if (!selectedTemplate) return;
    copyMutation.mutate({
      sourceCompetitionId: selectedTemplate,
      targetCompetitionId: competitionId,
    });
  }

  const addErrorKey = getTrpcErrorI18nKey(addMutation.error);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {criteriaQuery.isLoading && (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          )}

          {criteriaQuery.data && criteriaQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          )}

          {criteriaQuery.data && criteriaQuery.data.length > 0 && (
            <ul className="space-y-2">
              {criteriaQuery.data.map((criterion) => (
                <li
                  key={criterion.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{criterion.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {criterion.minScore}–{criterion.maxScore}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate({ criterionId: criterion.id })}
                    disabled={removeMutation.isPending}
                  >
                    {tCommon('remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddSubmit} className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="criterion-name">{t('nameLabel')}</Label>
              <Input
                id="criterion-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                required
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="min-score">{t('minLabel')}</Label>
                <Input
                  id="min-score"
                  type="number"
                  step="0.01"
                  min="0"
                  value={minScore}
                  onChange={(e) => {
                    setMinScore(e.target.value);
                    setMinError('');
                  }}
                  aria-describedby={minError ? 'min-score-error' : undefined}
                  aria-invalid={!!minError}
                />
                {minError && (
                  <p id="min-score-error" className="text-sm text-destructive">
                    {minError}
                  </p>
                )}
              </div>

              <div className="flex-1 space-y-1">
                <Label htmlFor="max-score">{t('maxLabel')}</Label>
                <Input
                  id="max-score"
                  type="number"
                  step="0.01"
                  min="0"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? t('adding') : t('addCta')}
            </Button>

            {addMutation.error && (
              <p className="text-sm text-destructive">
                {addErrorKey ? tErr(addErrorKey) : addMutation.error.message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {availableTemplates && availableTemplates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('copyTemplate')}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="template-select">{t('sourceCompetition')}</Label>
              <select
                id="template-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{t('selectPlaceholder')}</option>
                {availableTemplates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              onClick={handleCopyTemplate}
              disabled={!selectedTemplate || copyMutation.isPending}
            >
              {copyMutation.isPending ? t('copying') : t('copyCta')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
