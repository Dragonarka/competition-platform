import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class OrganizerDashboardPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  async gotoCompetitions(): Promise<void> {
    await this.page.goto('/competitions');
  }

  async gotoNewCompetition(): Promise<void> {
    await this.page.goto('/competitions/new');
  }

  async createCompetition(params: {
    name: string;
    description?: string;
    date?: string;
  }): Promise<string> {
    await this.gotoNewCompetition();
    await this.page.getByLabel(/name/i).fill(params.name);
    if (params.description) await this.page.getByLabel(/description/i).fill(params.description);
    if (params.date) await this.page.getByLabel(/date/i).fill(params.date);
    await this.page.getByRole('button', { name: /create/i }).click();
    await this.page.waitForURL(/\/competitions\/[a-zA-Z0-9_-]+$/);
    const match = this.page.url().match(/\/competitions\/([a-zA-Z0-9_-]+)$/);
    if (!match) throw new Error('Failed to extract competitionId from URL after create');
    return match[1];
  }

  async expectCompetitionInList(name: string): Promise<void> {
    await expect(this.page.getByText(name)).toBeVisible();
  }
}
