import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class JudgeScoringPage {
  constructor(readonly page: Page) {}

  async open(token: string): Promise<void> {
    await this.page.goto(`/judge/${token}`);
  }

  async expectValidLink(judgeLabel: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(`Welcome.*${judgeLabel}`, 'i'))).toBeVisible();
  }

  async expectInvalidLink(): Promise<void> {
    await expect(this.page.getByText(/link not valid/i)).toBeVisible();
  }

  async submitScore(scores: Record<string, number>): Promise<void> {
    for (const [criterionName, value] of Object.entries(scores)) {
      await this.page.getByLabel(new RegExp(criterionName, 'i')).fill(value.toFixed(2));
    }
    await this.page.getByRole('button', { name: /submit/i }).click();
  }

  async expectConfirmation(): Promise<void> {
    await expect(this.page.getByText(/submitted|confirmed|queued/i)).toBeVisible({ timeout: 3000 });
  }
}
