'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';
import { ParticipantsCsvImport } from './participants-csv-import';

interface ParticipantsManagerProps {
  competitionId: string;
}

export function ParticipantsManager({ competitionId }: ParticipantsManagerProps) {
  const t = useTranslations('Participants');
  const tCommon = useTranslations('Common');
  const tErr = useTranslations();
  const [participantId, setParticipantId] = useState('');
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [followerId, setFollowerId] = useState('');
  const [followerName, setFollowerName] = useState('');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [formatOverride, setFormatOverride] = useState<'individual' | 'pairs' | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const participantsQuery = trpc.tournament.listParticipants.useQuery({ competitionId });
  const competitionQuery = trpc.tournament.getCompetition.useQuery({ competitionId });
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

  const addPairMutation = trpc.tournament.addPair.useMutation({
    onSuccess() {
      utils.tournament.listParticipants.invalidate({ competitionId });
      setLeaderId('');
      setLeaderName('');
      setFollowerId('');
      setFollowerName('');
      setConflictError(null);
    },
    onError(err) {
      const key = getTrpcErrorI18nKey(err);
      setConflictError(key ? tErr(key) : err.message);
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
    onSuccess() {
      utils.tournament.getCompetition.invalidate({ competitionId });
    },
  });

  const grouped = useMemo(
    () => groupParticipants(participantsQuery.data ?? []),
    [participantsQuery.data],
  );
  const existingIds = useMemo(
    () => new Set((participantsQuery.data ?? []).map((p) => p.participantId)),
    [participantsQuery.data],
  );
  const unpairedCount =
    format === 'pairs'
      ? (participantsQuery.data ?? []).filter((p) => p.partnerId === null).length
      : 0;

  // Auto-generate an unused id for a competitor when the field is left blank.
  // Pattern: `<prefix>-NNN` where NNN is the lowest 3-digit number that does
  // not collide with an existing participantId. Helps the common case where
  // organizers don't care about IDs and just want sequential labels.
  function nextAutoId(prefix: string): string {
    for (let i = 1; i <= 999; i += 1) {
      const candidate = `${prefix}-${String(i).padStart(3, '0')}`;
      if (!existingIds.has(candidate)) return candidate;
    }
    // Fallback if every slot 001-999 is taken
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }

  function handleAddIndividual(e: React.FormEvent) {
    e.preventDefault();
    setConflictError(null);
    const trimmedId = participantId.trim();
    addMutation.mutate({
      competitionId,
      participantId: trimmedId || nextAutoId('P'),
      name: name.trim(),
    });
  }

  function handleAddPair(e: React.FormEvent) {
    e.preventDefault();
    setConflictError(null);
    const trimmedLeader = leaderId.trim();
    const trimmedFollower = followerId.trim();
    addPairMutation.mutate({
      competitionId,
      leader: {
        participantId: trimmedLeader || nextAutoId('L'),
        name: leaderName.trim(),
      },
      follower: {
        participantId: trimmedFollower || nextAutoId('F'),
        name: followerName.trim(),
      },
    });
  }

  function handleFormatChange(newFormat: 'individual' | 'pairs') {
    setFormatOverride(newFormat);
    formatMutation.mutate({ competitionId, format: newFormat });
  }

  const addErrorKey = getTrpcErrorI18nKey(addMutation.error);
  const pairErrorKey = getTrpcErrorI18nKey(addPairMutation.error);

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
          <div className="flex items-center justify-between">
            <CardTitle>{t('title')}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCsvOpen(true)}
              disabled={!format}
            >
              {t('importCsv')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {format === 'pairs' && unpairedCount > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t('unpairedWarning', { count: unpairedCount })}
            </p>
          )}

          {participantsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          )}

          {participantsQuery.data && participantsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          )}

          {participantsQuery.data && participantsQuery.data.length > 0 && (
            <ul className="space-y-2">
              {grouped.pairs.map((pair) => (
                <li
                  key={pair.leader.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge variant="neutral">{t('roleLeader')}</StatusBadge>
                        <span className="font-medium">{pair.leader.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {pair.leader.participantId}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge variant="neutral">{t('roleFollower')}</StatusBadge>
                        <span className="font-medium">{pair.follower.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {pair.follower.participantId}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMutation.mutate({ competitorDbId: pair.leader.id })}
                      disabled={removeMutation.isPending}
                    >
                      {tCommon('remove')}
                    </Button>
                  </div>
                </li>
              ))}
              {grouped.singles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {p.role && (
                      <StatusBadge variant="warning">
                        {p.role === 'leader' ? t('roleLeader') : t('roleFollower')}
                      </StatusBadge>
                    )}
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">{p.participantId}</span>
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

          {format === 'pairs' ? (
            <form onSubmit={handleAddPair} className="space-y-3 border-t pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                    {t('pairLeader')}
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="leader-id">{t('participantIdLabel')}</Label>
                    <Input
                      id="leader-id"
                      value={leaderId}
                      onChange={(e) => {
                        setLeaderId(e.target.value);
                        setConflictError(null);
                      }}
                      placeholder={t('leaderIdPlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="leader-name">{t('nameLabel')}</Label>
                    <Input
                      id="leader-name"
                      value={leaderName}
                      onChange={(e) => setLeaderName(e.target.value)}
                      placeholder={t('leaderNamePlaceholder')}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                    {t('pairFollower')}
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="follower-id">{t('participantIdLabel')}</Label>
                    <Input
                      id="follower-id"
                      value={followerId}
                      onChange={(e) => {
                        setFollowerId(e.target.value);
                        setConflictError(null);
                      }}
                      placeholder={t('followerIdPlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="follower-name">{t('nameLabel')}</Label>
                    <Input
                      id="follower-name"
                      value={followerName}
                      onChange={(e) => setFollowerName(e.target.value)}
                      placeholder={t('followerNamePlaceholder')}
                      required
                    />
                  </div>
                </div>
              </div>

              {conflictError && <p className="text-sm text-destructive">{conflictError}</p>}

              <Button type="submit" disabled={addPairMutation.isPending}>
                {addPairMutation.isPending ? t('addingPair') : t('addPairCta')}
              </Button>

              {addPairMutation.error && !conflictError && (
                <p className="text-sm text-destructive">
                  {pairErrorKey ? tErr(pairErrorKey) : addPairMutation.error.message}
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleAddIndividual} className="space-y-3 border-t pt-4">
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
          )}
        </CardContent>
      </Card>

      {csvOpen && format && (
        <ParticipantsCsvImport
          competitionId={competitionId}
          format={format}
          existingIds={existingIds}
          onClose={() => setCsvOpen(false)}
          onSuccess={() => setCsvOpen(false)}
        />
      )}
    </div>
  );
}

type ListedParticipant = {
  id: string;
  participantId: string;
  name: string;
  role: 'leader' | 'follower' | null;
  partnerId: string | null;
};

function groupParticipants(rows: readonly ListedParticipant[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const consumed = new Set<string>();
  const pairs: { leader: ListedParticipant; follower: ListedParticipant }[] = [];
  const singles: ListedParticipant[] = [];

  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    if (row.role && row.partnerId && byId.has(row.partnerId)) {
      const partner = byId.get(row.partnerId)!;
      if (!consumed.has(partner.id)) {
        const leader = row.role === 'leader' ? row : partner;
        const follower = row.role === 'leader' ? partner : row;
        pairs.push({ leader, follower });
        consumed.add(row.id);
        consumed.add(partner.id);
        continue;
      }
    }
    singles.push(row);
    consumed.add(row.id);
  }
  return { pairs, singles };
}
