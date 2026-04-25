'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ParticipantsManagerProps {
  competitionId: string;
}

export function ParticipantsManager({ competitionId }: ParticipantsManagerProps) {
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
        setConflictError(err.message);
      }
    },
  });

  const removeMutation = trpc.tournament.removeParticipant.useMutation({
    onSuccess() {
      utils.tournament.listParticipants.invalidate({ competitionId });
      setRemoveError(null);
    },
    onError(err) {
      setRemoveError(err.message);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Participant Format</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>Format</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === 'individual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFormatChange('individual')}
                disabled={formatMutation.isPending || competitionQuery.isLoading}
              >
                Individual
              </Button>
              <Button
                type="button"
                variant={format === 'pairs' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFormatChange('pairs')}
                disabled={formatMutation.isPending || competitionQuery.isLoading}
              >
                Pairs
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {participantsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading participants...</p>
          )}

          {participantsQuery.data && participantsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No participants registered yet.</p>
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
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {removeError && <p className="text-sm text-destructive">{removeError}</p>}

          <form onSubmit={handleAdd} className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="participant-id">Participant ID</Label>
              <Input
                id="participant-id"
                value={participantId}
                onChange={(e) => {
                  setParticipantId(e.target.value);
                  setConflictError(null);
                }}
                placeholder="e.g. MC-001"
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
              <Label htmlFor="participant-name">Name</Label>
              <Input
                id="participant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. DJ Sample"
                required
              />
            </div>

            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Adding...' : 'Add Participant'}
            </Button>

            {addMutation.error && !conflictError && (
              <p className="text-sm text-destructive">{addMutation.error.message}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
