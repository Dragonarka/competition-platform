import type { Page, Request } from '@playwright/test';

export function waitForTrpcCall(
  page: Page,
  procedure: string,
  timeoutMs = 10_000,
): Promise<Request> {
  return page.waitForRequest((req) => req.url().includes(`/trpc/${procedure}`), {
    timeout: timeoutMs,
  });
}

export async function simulateOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

export async function simulateOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

export async function throttleNetwork(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
}
