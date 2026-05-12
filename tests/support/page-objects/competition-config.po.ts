import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export type ConfigTab =
  | 'criteria'
  | 'participants'
  | 'competitors'
  | 'judge-groups'
  | 'judge-links';

export class CompetitionConfigPage {
  constructor(readonly page: Page) {}

  async goto(competitionId: string): Promise<void> {
    await this.page.goto(`/competitions/${competitionId}`);
  }

  async expectPageTitle(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  async switchTab(tab: ConfigTab): Promise<void> {
    const labelMap: Record<ConfigTab, RegExp> = {
      criteria: /criteria/i,
      participants: /participants/i,
      competitors: /competitors/i,
      'judge-groups': /judge.?group/i,
      'judge-links': /judge.?link/i,
    };
    await this.page.getByRole('tab', { name: labelMap[tab] }).click();
  }

  async expectTabActive(tab: ConfigTab): Promise<void> {
    const labelMap: Record<ConfigTab, RegExp> = {
      criteria: /criteria/i,
      participants: /participants/i,
      competitors: /competitors/i,
      'judge-groups': /judge.?group/i,
      'judge-links': /judge.?link/i,
    };
    await expect(this.page.getByRole('tab', { name: labelMap[tab], selected: true })).toBeVisible();
  }

  async clickLiveDashboard(): Promise<void> {
    await this.page.getByRole('link', { name: /live/i }).click();
  }

  async clickSimulation(): Promise<void> {
    await this.page.getByRole('link', { name: /simulat/i }).click();
  }
}
