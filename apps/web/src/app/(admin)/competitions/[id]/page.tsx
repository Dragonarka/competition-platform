import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CriteriaManager } from '@/components/admin/criteria-manager';
import { ParticipantsManager } from '@/components/admin/participants-manager';
import { JudgeGroupsManager } from '@/components/admin/judge-groups-manager';
import { JudgeLinksManager } from '@/components/admin/judge-links-manager';
import { StartCypherPhasePanel } from '@/components/admin/start-cypher-phase-panel';
import { CypherResultsPanel } from '@/components/admin/cypher-results-panel';
import { BracketViewPanel } from '@/components/admin/bracket-view-panel';
import { BattlesVotingPanel } from '@/components/admin/battles-voting-panel';
import { LiveDashboardLink } from '@/components/admin/live-dashboard-link';
import { CompetitorManagementPanel } from '@/components/admin/competitor-management-panel';
import { SoloScoringPanel } from '@/components/admin/solo-scoring-panel';

export default async function CompetitionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Competition Configuration</h1>
        <LiveDashboardLink competitionId={id} />
      </div>
      <SoloScoringPanel competitionId={id} />
      <CypherResultsPanel competitionId={id} />
      <BattlesVotingPanel competitionId={id} />
      <BracketViewPanel competitionId={id} />
      <StartCypherPhasePanel competitionId={id} />
      <Tabs defaultValue="criteria">
        <TabsList>
          <TabsTrigger value="criteria">Evaluation Criteria</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="judge-groups">Judge Groups</TabsTrigger>
          <TabsTrigger value="judge-links">Judge Links</TabsTrigger>
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
