import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_DIR = path.resolve(__dirname, '.auth');
export const ORGANIZER_STATE_PATH = path.join(AUTH_DIR, 'organizer.json');

export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_ORGANIZER_EMAIL;
  const password = process.env.TEST_ORGANIZER_PASSWORD;

  if (!email || !password) {
    console.warn(
      '[e2e:setup] TEST_ORGANIZER_EMAIL / TEST_ORGANIZER_PASSWORD not set — ' +
        'organizer tests will be skipped or fail if .auth/organizer.json is missing.',
    );
    return;
  }

  if (fs.existsSync(ORGANIZER_STATE_PATH)) {
    console.log('[e2e:setup] Reusing cached organizer storageState at', ORGANIZER_STATE_PATH);
    return;
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const baseURL =
    config.projects[0]?.use?.baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000';

  console.log('[e2e:setup] Signing in as organizer at', baseURL);

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/sign-in');

    // Clerk multi-step sign-in: email → Continue → password → Continue
    await page.getByLabel(/email address/i).fill(email);
    await page.getByRole('button', { name: /continue/i }).click();

    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /continue/i }).click();

    // Clerk redirects to the configured afterSignInUrl (set to /dashboard or /)
    await page.waitForURL(/(dashboard|competitions|\/en\/|\/es\/)/, { timeout: 30_000 });

    await context.storageState({ path: ORGANIZER_STATE_PATH });
    console.log('[e2e:setup] Saved organizer storageState to', ORGANIZER_STATE_PATH);
  } finally {
    await browser.close();
  }
}
