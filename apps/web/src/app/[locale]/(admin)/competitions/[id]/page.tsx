import { getTranslations } from 'next-intl/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CriteriaManager } from '@/components/admin/criteria-manager';
import { ParticipantsManager } from '@/components/admin/participants-manager';
import { JudgeGroupsManager } from '@/components/admin/judge-groups-manager';
import { JudgeLinksManager } from '@/components/admin/judge-links-manager';
import { StartCypherPhasePanel } from '@/components/admin/start-cypher-phase-panel';
import { CypherResultsPanel } from '@/components/admin/cypher-results-panel';
import { BracketViewPanel } from '@/components/admin/bracket-view-panel';
import { BattlesVotingPanel } from '@/components/admin/battles-voting-panel';
import { TieResolutionBanner } from '@/components/admin/tie-resolution-banner';
import { LiveDashboardLink } from '@/components/admin/live-dashboard-link';
import { SimulateConfigLink } from '@/components/admin/simulate-config-link';
import { OpenSimulationLink } from '@/components/admin/open-simulation-link';
import { CompetitorManagementPanel } from '@/components/admin/competitor-management-panel';
import { SoloScoringPanel } from '@/components/admin/solo-scoring-panel';

export default async function CompetitionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('CompetitionConfig');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>
        <div className="flex items-center gap-2">
          <OpenSimulationLink competitionId={id} />
          <SimulateConfigLink competitionId={id} />
          <LiveDashboardLink competitionId={id} />
        </div>
      </div>
      <SoloScoringPanel competitionId={id} />
      <CypherResultsPanel competitionId={id} />
      <TieResolutionBanner competitionId={id} />
      <BattlesVotingPanel competitionId={id} />
      <BracketViewPanel competitionId={id} />
      <StartCypherPhasePanel competitionId={id} />
      <Tabs defaultValue="criteria">
        <TabsList>
          <TabsTrigger value="criteria">{t('tabs.criteria')}</TabsTrigger>
          <TabsTrigger value="participants">{t('tabs.participants')}</TabsTrigger>
          <TabsTrigger value="competitors">{t('tabs.competitors')}</TabsTrigger>
          <TabsTrigger value="judge-groups">{t('tabs.judgeGroups')}</TabsTrigger>
          <TabsTrigger value="judge-links">{t('tabs.judgeLinks')}</TabsTrigger>
        </TabsList>
        <TabsContent value="criteria">
          <CriteriaManager competitionId={id} />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsManager competitionId={id} />
        </TabsContent>
        <TabsContent value="competitors">
          <CompetitorManagementPanel competitionId={id} />
        </TabsContent>
        <TabsContent value="judge-groups">
          <JudgeGroupsManager competitionId={id} />
        </TabsContent>
        <TabsContent value="judge-links">
          <JudgeLinksManager competitionId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
