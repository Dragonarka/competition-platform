'use client';

import { useEffect, useRef } from 'react';

// Turbopack cold-compile of /sign-in and /sign-up can race with next-intl's
// SSR context setup, causing useTranslations() to crash on the very first
// request after a dev-server restart (or first prod cold start). The page
// itself is fine — a refresh fixes it. To avoid leaving the user on a 500,
// we auto-call `reset()` once on mount: that re-runs the server render with
// a hot module graph, which compiles cleanly.
//
// We retry only once to avoid masking real bugs; if the second render also
// throws, we surface a minimal error UI.
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    reset();
  }, [reset]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Loading
        </p>
        <p className="text-sm text-muted-foreground">One moment — preparing sign-in.</p>
        {process.env.NODE_ENV === 'development' && (
          <p className="mt-4 max-w-md font-mono text-[10px] break-all text-muted-foreground/60">
            {error.message}
          </p>
        )}
      </div>
    </div>
  );
}
