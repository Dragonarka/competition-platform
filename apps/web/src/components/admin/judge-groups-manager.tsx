'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JudgeGroupsManagerProps {
  competitionId: string;
}

interface CompData {
  id: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  cypherJudgeCount: number | null;
  cypherGroupCount: number | null;
  advancementThreshold: number | null;
  battlesJudgeCount: number | null;
  tieBreakingRule: 're_vote' | 'organizer_decision' | null;
  soloMode: boolean;
}

interface JudgeGroupsFormProps {
  competitionId: string;
  comp: CompData;
}

function JudgeGroupsForm({ competitionId, comp }: JudgeGroupsFormProps) {
  const { data: participants } = trpc.tournament.listParticipants.useQuery({ competitionId });
  const utils = trpc.useUtils();

  const participantCount = participants?.length ?? 0;

  const [cypherJudgeCount, setCypherJudgeCount] = useState<number | ''>(
    comp.cypherJudgeCount ?? '',
  );
  const [cypherGroupCount, setCypherGroupCount] = useState<number | ''>(
    comp.cypherGroupCount ?? '',
  );
  const [advancementThreshold, setAdvancementThreshold] = useState<number | ''>(
    comp.advancementThreshold ?? '',
  );
  const [battlesJudgeCount, setBattlesJudgeCount] = useState<number | ''>(
    comp.battlesJudgeCount ?? '',
  );
  const [tieBreakingRule, setTieBreakingRule] = useState<'re_vote' | 'organizer_decision'>(
    comp.tieBreakingRule ?? 're_vote',
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = trpc.tournament.setJudgeConfig.useMutation({
    onSuccess: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });

  const soloModeMutation = trpc.tournament.setSoloMode.useMutation({
    onSuccess: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });

  const isDraft = comp.status === 'draft';
  const soloModeEnabled = comp.soloMode;

  const validJudges = typeof cypherJudgeCount === 'number' && cypherJudgeCount > 0;
  const validGroups = typeof cypherGroupCount === 'number' && cypherGroupCount > 0;
  const validConfig =
    validJudges && validGroups && (cypherGroupCount as number) <= (cypherJudgeCount as number);
  const judgesPerGroup = validConfig
    ? Math.floor((cypherJudgeCount as number) / (cypherGroupCount as number))
    : 0;
  const participantsPerGroup =
    validConfig && participantCount > 0
      ? Math.ceil(participantCount / (cypherGroupCount as number))
      : null;

  const parseIntField = (val: string): number | '' => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? '' : parsed;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    // In solo mode, judge counts and group count are forced to 1 — the
    // organizer is the sole judge covering one group of all competitors.
    const effectiveCypherJudgeCount = soloModeEnabled ? 1 : cypherJudgeCount;
    const effectiveCypherGroupCount = soloModeEnabled ? 1 : cypherGroupCount;
    const effectiveBattlesJudgeCount = soloModeEnabled ? 1 : battlesJudgeCount;
    if (
      typeof effectiveCypherJudgeCount !== 'number' ||
      typeof effectiveCypherGroupCount !== 'number' ||
      typeof advancementThreshold !== 'number' ||
      typeof effectiveBattlesJudgeCount !== 'number'
    ) {
      setSaveError('All fields are required');
      return;
    }
    mutation.mutate({
      competitionId,
      cypherJudgeCount: effectiveCypherJudgeCount,
      cypherGroupCount: effectiveCypherGroupCount,
      advancementThreshold,
      battlesJudgeCount: effectiveBattlesJudgeCount,
      tieBreakingRule,
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solo Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={soloModeEnabled}
              disabled={!isDraft || soloModeMutation.isPending}
              onChange={(e) => {
                soloModeMutation.mutate({
                  competitionId,
                  soloMode: e.target.checked,
                });
              }}
            />
            <span className="text-sm">
              I&apos;ll score directly as the organizer — no separate judges needed
            </span>
          </label>
          {!isDraft && (
            <p className="text-xs text-muted-foreground">
              Solo mode can only be toggled before the competition starts.
            </p>
          )}
          {soloModeEnabled && (
            <p className="text-xs text-muted-foreground">
              Judge counts are managed automatically in solo mode (1 organizer = 1 judge × 1 group).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cypher Phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cypherJudgeCount">Total Judges</Label>
              <Input
                id="cypherJudgeCount"
                type="number"
                min={1}
                max={100}
                value={cypherJudgeCount}
                onChange={(e) => setCypherJudgeCount(parseIntField(e.target.value))}
                disabled={mutation.isPending || soloModeEnabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cypherGroupCount">Number of Groups</Label>
              <Input
                id="cypherGroupCount"
                type="number"
                min={1}
                max={50}
                value={cypherGroupCount}
                onChange={(e) => setCypherGroupCount(parseIntField(e.target.value))}
                disabled={mutation.isPending || soloModeEnabled}
              />
            </div>
          </div>
          {validConfig && (
            <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded">
              {cypherGroupCount} group(s) of {judgesPerGroup} judge(s)
              {participantsPerGroup !== null
                ? ` — each judge evaluates ~${participantsPerGroup} participants`
                : participantCount === 0
                  ? ' — add participants to see distribution preview'
                  : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advancement to Battles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="advancementThreshold">Top N Participants Advance</Label>
          <Input
            id="advancementThreshold"
            type="number"
            min={1}
            value={advancementThreshold}
            onChange={(e) => setAdvancementThreshold(parseIntField(e.target.value))}
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            The top N participants by Cypher score advance to the Battles bracket.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Battles Phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="battlesJudgeCount">Total Judges (Battles)</Label>
            <Input
              id="battlesJudgeCount"
              type="number"
              min={1}
              max={100}
              value={battlesJudgeCount}
              onChange={(e) => setBattlesJudgeCount(parseIntField(e.target.value))}
              disabled={mutation.isPending || soloModeEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Configured independently from Cypher judges (FR8).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tieBreakingRule">Tie-breaking Rule</Label>
            <select
              id="tieBreakingRule"
              value={tieBreakingRule}
              onChange={(e) =>
                setTieBreakingRule(e.target.value as 're_vote' | 'organizer_decision')
              }
              disabled={mutation.isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="re_vote">Re-vote (judges vote again)</option>
              <option value="organizer_decision">
                Organizer Decision (organizer picks winner)
              </option>
            </select>
          </div>
        </CardContent>
      </Card>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save Configuration'}
      </Button>
    </form>
  );
}

export function JudgeGroupsManager({ competitionId }: JudgeGroupsManagerProps) {
  const { data: comp, isLoading: compLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });

  if (compLoading) {
    return <p className="text-muted-foreground text-sm">Loading configuration...</p>;
  }

  if (!comp) {
    return <p className="text-sm text-destructive">Competition not found.</p>;
  }

  return <JudgeGroupsForm key={comp.id} competitionId={competitionId} comp={comp} />;
}
