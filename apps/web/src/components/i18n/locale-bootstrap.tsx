'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { usePathname, useRouter } from '@/i18n/navigation';
import { readStoredLocale } from '@/lib/i18n/preference-storage';
import type { SupportedLocale } from '@competition-platform/shared';

// Mounted once near the root of every locale-aware layout. Reads
// localStorage.preferredLocale on first paint and, when the user is
// unauthenticated and the URL locale differs, redirects them to the stored
// locale. Authenticated users defer to the server-side reconciliation in
// (admin)/layout.tsx to avoid double-redirect races.
export function LocaleBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as SupportedLocale;
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) return;
    const stored = readStoredLocale();
    if (!stored) return;
    if (stored === locale) return;
    router.replace(pathname, { locale: stored });
  }, [isLoaded, isSignedIn, locale, pathname, router]);

  return null;
}
