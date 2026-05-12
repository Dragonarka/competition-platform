'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrpcErrorI18nKey } from '@/lib/i18n/trpc-error';

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
  const t = useTranslations('JudgeGroups');
  const tErr = useTranslations();
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
      const key = getTrpcErrorI18nKey(err);
      setSaveError(key ? tErr(key) : err.message);
    },
  });

  const soloModeMutation = trpc.tournament.setSoloMode.useMutation({
    onSuccess: () => {
      void utils.tournament.getCompetition.invalidate({ competitionId });
      setSaveError(null);
    },
    onError: (err) => {
      const key = getTrpcErrorI18nKey(err);
      setSaveError(key ? tErr(key) : err.message);
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
    const effectiveCypherJudgeCount = soloModeEnabled ? 1 : cypherJudgeCount;
    const effectiveCypherGroupCount = soloModeEnabled ? 1 : cypherGroupCount;
    const effectiveBattlesJudgeCount = soloModeEnabled ? 1 : battlesJudgeCount;
    if (
      typeof effectiveCypherJudgeCount !== 'number' ||
      typeof effectiveCypherGroupCount !== 'number' ||
      typeof advancementThreshold !== 'number' ||
      typeof effectiveBattlesJudgeCount !== 'number'
    ) {
      setSaveError(t('allFieldsRequired'));
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
          <CardTitle className="text-base">{t('soloModeTitle')}</CardTitle>
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
            <span className="text-sm">{t('soloModeCheckbox')}</span>
          </label>
          {!isDraft && <p className="text-xs text-muted-foreground">{t('soloModeLockedHint')}</p>}
          {soloModeEnabled && (
            <p className="text-xs text-muted-foreground">{t('soloModeAutoHint')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('cypherPhaseTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cypherJudgeCount">{t('cypherTotalJudgesLabel')}</Label>
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
              <Label htmlFor="cypherGroupCount">{t('groupsLabel')}</Label>
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
              {participantsPerGroup !== null
                ? t('configPreview', {
                    groups: cypherGroupCount as number,
                    judges: judgesPerGroup,
                    participants: participantsPerGroup,
                  })
                : t('configPreviewNoParticipants', {
                    groups: cypherGroupCount as number,
                    judges: judgesPerGroup,
                  })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('advancementTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="advancementThreshold">{t('advancementTopNLabel')}</Label>
          <Input
            id="advancementThreshold"
            type="number"
            min={1}
            value={advancementThreshold}
            onChange={(e) => setAdvancementThreshold(parseIntField(e.target.value))}
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">{t('advancementBattlesHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('battlesPhaseTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="battlesJudgeCount">{t('battlesTotalJudgesLabel')}</Label>
            <Input
              id="battlesJudgeCount"
              type="number"
              min={1}
              max={100}
              value={battlesJudgeCount}
              onChange={(e) => setBattlesJudgeCount(parseIntField(e.target.value))}
              disabled={mutation.isPending || soloModeEnabled}
            />
            <p className="text-xs text-muted-foreground">{t('battlesTotalJudgesHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tieBreakingRule">{t('tieRuleLabel')}</Label>
            <select
              id="tieBreakingRule"
              value={tieBreakingRule}
              onChange={(e) =>
                setTieBreakingRule(e.target.value as 're_vote' | 'organizer_decision')
              }
              disabled={mutation.isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="re_vote">{t('tieRuleRevote')}</option>
              <option value="organizer_decision">{t('tieRuleOrganizer')}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? t('saving') : saved ? t('savedConfirm') : t('saveButtonLabel')}
      </Button>
    </form>
  );
}

export function JudgeGroupsManager({ competitionId }: JudgeGroupsManagerProps) {
  const t = useTranslations('JudgeGroups');
  const { data: comp, isLoading: compLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });

  if (compLoading) {
    return <p className="text-muted-foreground text-sm">{t('loadingConfig')}</p>;
  }

  if (!comp) {
    return <p className="text-sm text-destructive">{t('competitionNotFound')}</p>;
  }

  return <JudgeGroupsForm key={comp.id} competitionId={competitionId} comp={comp} />;
}
