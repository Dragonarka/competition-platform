'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { createCompetitionSchema, createSimulationSchema } from '@competition-platform/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

interface FormCoreProps {
  isSimulation: boolean;
  sourceId: string | null;
  sourceName: string | null;
}

function CreateCompetitionFormCore({ isSimulation, sourceId, sourceName }: FormCoreProps) {
  const router = useRouter();
  const [name, setName] = useState(sourceName ? `${sourceName} (Simulation)` : '');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [mockParticipantCount, setMockParticipantCount] = useState('24');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = trpc.tournament.create.useMutation({
    onSuccess(data) {
      router.push(`/competitions/${data.id}`);
    },
  });

  const createSimMutation = trpc.tournament.createSimulation.useMutation({
    onSuccess(data) {
      router.push(`/competitions/${data.id}`);
    },
  });

  const activeMutation = isSimulation ? createSimMutation : createMutation;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const baseInput = {
      name: name.trim(),
      date: date ? `${date}T12:00:00.000Z` : null,
      description: description.trim() || null,
    };

    if (isSimulation) {
      const parsedCount = parseInt(mockParticipantCount, 10);
      const simInput = {
        ...baseInput,
        mockParticipantCount: Number.isNaN(parsedCount) ? undefined : parsedCount,
        sourceCompetitionId: sourceId || undefined,
      };

      const result = createSimulationSchema.safeParse(simInput);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (field && !fieldErrors[field]) {
            fieldErrors[field] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }
      createSimMutation.mutate(result.data);
    } else {
      const result = createCompetitionSchema.safeParse(baseInput);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (field && !fieldErrors[field]) {
            fieldErrors[field] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }
      createMutation.mutate(result.data);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4">
          {isSimulation && sourceName && (
            <p className="text-sm text-muted-foreground">
              Configuration will be cloned from {sourceName}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isSimulation ? 'e.g. Practice Session 01' : 'e.g. Summer Dance Battle 2026'
              }
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the competition"
              rows={3}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && (
              <p id="description-error" className="text-sm text-destructive">
                {errors.description}
              </p>
            )}
          </div>

          {isSimulation && (
            <div className="space-y-2">
              <Label htmlFor="mockParticipantCount">Mock Participants</Label>
              <Input
                id="mockParticipantCount"
                type="number"
                min={2}
                max={200}
                value={mockParticipantCount}
                onChange={(e) => setMockParticipantCount(e.target.value)}
                aria-invalid={!!errors.mockParticipantCount}
                aria-describedby={errors.mockParticipantCount ? 'mock-count-error' : undefined}
              />
              <p className="text-xs text-muted-foreground">
                Auto-generates competitors named &ldquo;Competitor 01&rdquo; through
                &ldquo;Competitor N&rdquo; (2–200)
              </p>
              {errors.mockParticipantCount && (
                <p id="mock-count-error" className="text-sm text-destructive">
                  {errors.mockParticipantCount}
                </p>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={activeMutation.isPending}>
            {activeMutation.isPending
              ? 'Creating...'
              : isSimulation
                ? 'Create Simulation'
                : 'Create Competition'}
          </Button>
        </CardFooter>
      </Card>

      {activeMutation.error && (
        <p className="mt-4 text-sm text-destructive">{activeMutation.error.message}</p>
      )}
    </form>
  );
}

export function CreateCompetitionForm() {
  const searchParams = useSearchParams();
  const isSimulation = searchParams.get('simulation') === 'true';
  const sourceId = searchParams.get('source');

  const sourceQuery = trpc.tournament.getCompetition.useQuery(
    { competitionId: sourceId! },
    { enabled: isSimulation && !!sourceId },
  );

  // When cloning from a source: wait for data before rendering inner form
  // so initial name state initializes from props (split-component pattern)
  if (isSimulation && sourceId) {
    if (!sourceQuery.data) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading source competition…
          </CardContent>
        </Card>
      );
    }
    return (
      <CreateCompetitionFormCore
        key={sourceQuery.data.id}
        isSimulation
        sourceId={sourceId}
        sourceName={sourceQuery.data.name}
      />
    );
  }

  return (
    <CreateCompetitionFormCore isSimulation={isSimulation} sourceId={null} sourceName={null} />
  );
}
