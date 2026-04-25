'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AssignmentResult {
  groupCount: number;
  competitorCount: number;
  judgeCount: number;
}

export function StartCypherPhasePanel({ competitionId }: { competitionId: string }) {
  const { data: competition, isLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignmentResult | null>(null);

  const startMutation = trpc.tournament.startCypherPhase.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      utils.tournament.getCompetition.invalidate({ competitionId });
    },
    onError: (err) => setError(err.message),
  });

  if (isLoading)
    return <p className="text-muted-foreground text-sm">Loading competition status...</p>;
  if (!competition) return null;

  if (competition.status === 'active') {
    return (
      <Card className="border-green-500">
        <CardHeader>
          <CardTitle className="text-base text-green-600">Cypher Phase Active</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The Cypher phase has started. Judges can now access their assigned participants via
            their invite links.
          </p>
          {result && (
            <p className="text-sm mt-2">
              {result.competitorCount} participants assigned across {result.groupCount} groups (
              {result.judgeCount} judges).
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start Cypher Phase</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Starting the Cypher phase will automatically assign all registered participants to judge
          groups using round-robin distribution. Make sure all criteria, participants, and judge
          links are configured before starting.
        </p>
        {error && (
          <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">{error}</p>
        )}
        <Button
          onClick={() => startMutation.mutate({ competitionId })}
          disabled={startMutation.isPending}
          className="w-full sm:w-auto"
        >
          {startMutation.isPending ? 'Starting...' : 'Start Cypher Phase'}
        </Button>
      </CardContent>
    </Card>
  );
}
