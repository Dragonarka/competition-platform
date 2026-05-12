'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

interface ParticipantsManagerProps {
  competitionId: string;
}

export function ParticipantsManager({ competitionId }: ParticipantsManagerProps) {
  const t = useTranslations('Participants');
  const tCommon = useTranslations('Common');
  const tErr = useTranslations();
  const [participantId, setParticipantId] = useState('');
  const [name, setName] = useState('');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [formatOverride, setFormatOverride] = useState<'individual' | 'pairs' | null>(null);

  const participantsQuery = trpc.tournament.listParticipants.useQuery({
    competitionId,
  });

  const competitionQuery = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const serverFormat = competitionQuery.data?.participantFormat ?? null;
  const format = formatOverride ?? serverFormat;

  const utils = trpc.useUtils();

  const addMutation = trpc.tournament.addParticipant.useMutation({
    onSuccess() {
      utils.tournament.listParticipants.invalidate({ competitionId });
      setParticipantId('');
      setName('');
      setConflictError(null);
    },
    onError(err) {
      if (err.data?.code === 'CONFLICT') {
        const key = getTrpcErrorI18nKey(err);
        setConflictError(key ? tErr(key) : err.message);
      }
    },
  });

  const removeMutation = trpc.tournament.removeParticipant.useMutation({
    onSuccess() {
      utils.tournament.listParticipants.invalidate({ competitionId });
      setRemoveError(null);
    },
    onError(err) {
      const key = getTrpcErrorI18nKey(err);
      setRemoveError(key ? tErr(key) : err.message);
    },
  });

  const formatMutation = trpc.tournament.setParticipantFormat.useMutation({
    onError() {
      setFormatOverride(null);
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setConflictError(null);
    addMutation.mutate({
      competitionId,
      participantId: participantId.trim(),
      name: name.trim(),
    });
  }

  function handleFormatChange(newFormat: 'individual' | 'pairs') {
    setFormatOverride(newFormat);
    formatMutation.mutate({ competitionId, format: newFormat });
  }

  const addErrorKey = getTrpcErrorI18nKey(addMutation.error);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('formatTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>{t('formatLabel')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === 'individual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFormatChange('individual')}
                disabled={formatMutation.isPending || competitionQuery.isLoading}
              >
                {t('formatIndividual')}
              </Button>
              <Button
                type="button"
                variant={format === 'pairs' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFormatChange('pairs')}
                disabled={formatMutation.isPending || competitionQuery.isLoading}
              >
                {t('formatPairs')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {participantsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          )}

          {participantsQuery.data && participantsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          )}

          {participantsQuery.data && participantsQuery.data.length > 0 && (
            <ul className="space-y-2">
              {participantsQuery.data.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-muted-foreground">{p.participantId}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate({ competitorDbId: p.id })}
                    disabled={removeMutation.isPending}
                  >
                    {tCommon('remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {removeError && <p className="text-sm text-destructive">{removeError}</p>}

          <form onSubmit={handleAdd} className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="participant-id">{t('participantIdLabel')}</Label>
              <Input
                id="participant-id"
                value={participantId}
                onChange={(e) => {
                  setParticipantId(e.target.value);
                  setConflictError(null);
                }}
                placeholder={t('participantIdPlaceholder')}
                required
                aria-describedby={conflictError ? 'pid-error' : undefined}
                aria-invalid={!!conflictError}
              />
              {conflictError && (
                <p id="pid-error" className="text-sm text-destructive">
                  {conflictError}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="participant-name">{t('nameLabel')}</Label>
              <Input
                id="participant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                required
              />
            </div>

            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? t('adding') : t('addCta')}
            </Button>

            {addMutation.error && !conflictError && (
              <p className="text-sm text-destructive">
                {addErrorKey ? tErr(addErrorKey) : addMutation.error.message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
