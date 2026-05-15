'use client';

import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { AppRouter } from '@competition-platform/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl(): string {
  // Always use the absolute API origin so the browser bypasses the Next.js
  // rewrite layer entirely. Avoids the failure mode where the rewrite
  // destination is empty at build time and silently routes /trpc/* to the
  // web origin (which 404s). The API has CORS configured for the web origin.
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
}

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/trpc`,
          async headers() {
            const token = await getToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
