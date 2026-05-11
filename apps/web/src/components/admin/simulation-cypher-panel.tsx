'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

interface SimulationCypherPanelProps {
  competitionId: string;
}

interface CriterionDef {
  id: string;
  name: string;
  min: number;
  max: number;
}

function isValidValue(value: string, c: CriterionDef): boolean {
  if (value.trim().length === 0) return false;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return false;
  return n >= c.min && n <= c.max;
}

interface CompetitorRowProps {
  competitorId: string;
  competitorName: string;
  participantId: string;
  criteria: CriterionDef[];
  competitionId: string;
  simulatedGroupIndex: number;
  simulatedJudgeIndex: number;
  alreadyScored: boolean;
}

function SimCompetitorRow({
  competitorId,
  competitorName,
  participantId,
  criteria,
  competitionId,
  simulatedGroupIndex,
  simulatedJudgeIndex,
  alreadyScored,
}: CompetitorRowProps) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.tournament.submitOrganizerScore.useMutation({
    onSuccess: () => {
      setValues({});
      setError(null);
      void utils.tournament.getStandings.invalidate({ competitionId });
      void utils.tournament.listScoresForOverride.invalidate({ competitionId });
    },
    onError: (err) => setError(err.message),
  });

  const allValid = criteria.every((c) => isValidValue(values[c.id] ?? '', c));

  function handleSubmit(): void {
    if (!allValid) return;
    setError(null);
    const scores = criteria.map((c) => ({
      criterionId: c.id,
      value: parseFloat(values[c.id] ?? '0').toFixed(2),
    }));
    mutation.mutate({
      competitionId,
      competitorId,
      scores,
      idempotencyKey: crypto.randomUUID(),
      simulatedGroupIndex,
      simulatedJudgeIndex,
    });
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-3">
        <div className="font-medium">{competitorName}</div>
        <div className="text-xs text-muted-foreground">{participantId}</div>
        {alreadyScored && (
          <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">✓ Scored</div>
        )}
      </td>
      {criteria.map((c) => (
        <td key={c.id} className="py-3 pr-3">
          <input
            type="number"
            step="0.01"
            min={c.min}
            max={c.max}
            placeholder={`${c.min}–${c.max}`}
            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={values[c.id] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
            disabled={mutation.isPending || alreadyScored}
          />
        </td>
      ))}
      <td className="py-3 align-top">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!allValid || mutation.isPending || alreadyScored}
        >
          {mutation.isPending ? 'Submitting…' : 'Submit'}
        </Button>
        {error && <p className="text-destructive text-xs mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export function SimulationCypherPanel({ competitionId }: SimulationCypherPanelProps) {
  const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });
  const { data: competitorList = [] } = trpc.tournament.listCompetitorsWithStatus.useQuery({
    competitionId,
  });
  const { data: criteriaList = [] } = trpc.tournament.listCriteria.useQuery({ competitionId });
  const { data: simSessions = [] } = trpc.tournament.listSimulatedJudgeSessions.useQuery(
    { competitionId },
    { enabled: !!competition?.isSimulation },
  );
  const { data: scoreRows = [] } = trpc.tournament.listScoresForOverride.useQuery({
    competitionId,
  });

  const [selectedGroup, setSelectedGroup] = useState(0);
  const [selectedJudge, setSelectedJudge] = useState(0);

  const criteria = useMemo<CriterionDef[]>(
    () =>
      criteriaList.map((c) => ({
        id: c.id,
        name: c.name,
        min: parseFloat(c.minScore),
        max: parseFloat(c.maxScore),
      })),
    [criteriaList],
  );

  if (!competition || !competition.isSimulation) return null;
  if (competition.status !== 'active' || competition.cypherCompletedAt) return null;

  const groupCount = competition.cypherGroupCount ?? 0;
  const judgeCount = competition.cypherJudgeCount ?? 0;

  const activeInGroup = competitorList.filter(
    (c) => c.status === 'active' && c.groupIndex === selectedGroup,
  );

  const expectedLabel = `Sim Judge G${String.fromCharCode(65 + selectedGroup)}-J${
    selectedJudge + 1
  }`;
  const currentSession = simSessions.find((s) => s.label === expectedLabel);
  const scoredCompetitorIds = new Set(
    currentSession
      ? scoreRows.filter((r) => r.judgeSessionId === currentSession.id).map((r) => r.competitorId)
      : [],
  );

  const totalActive = activeInGroup.length;
  const scoredCount = activeInGroup.filter((c) => scoredCompetitorIds.has(c.id)).length;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Simulation Cypher Scoring</h2>
          <p className="text-sm text-muted-foreground">
            Score each competitor as each judge in each group. Pick the role you&apos;re acting as.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex flex-col text-xs text-muted-foreground">
            Group
            <select
              aria-label="Judge group"
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: groupCount }, (_, g) => (
                <option key={g} value={g}>
                  Group {String.fromCharCode(65 + g)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Judge
            <select
              aria-label="Judge slot"
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={selectedJudge}
              onChange={(e) => setSelectedJudge(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: judgeCount }, (_, j) => (
                <option key={j} value={j}>
                  Judge {j + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Scored: {scoredCount} of {totalActive} competitors as {expectedLabel}
      </p>
      {totalActive === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active competitors in Group {String.fromCharCode(65 + selectedGroup)}.
        </p>
      ) : criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add evaluation criteria before scoring.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold text-muted-foreground">Competitor</th>
                {criteria.map((c) => (
                  <th key={c.id} className="py-2 pr-3 font-semibold text-muted-foreground">
                    {c.name}
                    <div className="text-xs font-normal text-muted-foreground">
                      ({c.min}–{c.max})
                    </div>
                  </th>
                ))}
                <th className="py-2 font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {activeInGroup.map((c) => (
                <SimCompetitorRow
                  key={`${c.id}-G${selectedGroup}-J${selectedJudge}`}
                  competitorId={c.id}
                  competitorName={c.name}
                  participantId={c.participantId}
                  criteria={criteria}
                  competitionId={competitionId}
                  simulatedGroupIndex={selectedGroup}
                  simulatedJudgeIndex={selectedJudge}
                  alreadyScored={scoredCompetitorIds.has(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
