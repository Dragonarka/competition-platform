import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en' },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /.*judge.*\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testMatch: /.*judge.*\.spec\.ts/,
    },
  ],
  webServer: IS_CI
    ? undefined
    : [
        {
          command: 'pnpm --filter @competition-platform/api start:dev',
          url: `${API_URL}/health`,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'pnpm --filter @competition-platform/web dev',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
  metadata: {
    project: 'competition-platform',
    stack: 'Next.js 16 + NestJS 11 + tRPC + Socket.IO',
  },
});
