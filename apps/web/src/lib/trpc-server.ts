// Vanilla tRPC client for server components (Story 6.1).
// Uses the same HTTP transport as the browser client — avoids bootstrapping
// NestJS DI inside the Next.js Node runtime.
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@competition-platform/api/trpc';

function getApiUrl(): string {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
}

export function createServerTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${getApiUrl()}/trpc` })],
  });
}
