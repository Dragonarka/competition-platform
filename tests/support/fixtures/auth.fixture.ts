import { test as base, type Page, type BrowserContext } from '@playwright/test';
import path from 'node:path';

const STORAGE_STATE_DIR = path.resolve(__dirname, '../../.auth');
export const ORGANIZER_STATE = path.join(STORAGE_STATE_DIR, 'organizer.json');

export interface AuthFixtures {
  organizerContext: BrowserContext;
  organizerPage: Page;
  judgePage: Page;
  publicPage: Page;
}

export const authTest = base.extend<AuthFixtures>({
  organizerContext: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ORGANIZER_STATE });
    await use(context);
    await context.close();
  },
  organizerPage: async ({ organizerContext }, use) => {
    const page = await organizerContext.newPage();
    await use(page);
  },
  judgePage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  publicPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
