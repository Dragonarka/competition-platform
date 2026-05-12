'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { usePathname, useRouter } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import type { SupportedLocale } from '@competition-platform/shared';

// Story 8.2 — mounted inside the admin layout (organizers only). Reconciles
// the URL locale with the user's server-side preferred_locale on every
// authenticated page render.
//
// Behaviour:
//   1. If locale-switch-pending is set in sessionStorage, a LanguageSwitcher
//      navigation just fired. Clear the flag and skip reconciliation — the
//      setPreference mutation is still in-flight and the new locale is already
//      in the URL. Without this guard the reconciler races the mutation and
//      redirects back to the old locale (es→en redirect-loop fix).
//   2. On first successful getPreferences fetch, if no row exists server-side
//      (hasPreference:false), seed it with the current URL locale. This handles
//      first-ever-sign-in: the URL the user navigated to expresses intent.
//   3. Otherwise, if the stored preference differs from the URL locale,
//      redirect to the preference-matching path. Cross-device sync: user
//      picked Spanish on phone, opens laptop at /dashboard → /es/dashboard.
//   4. Once-per-mount guard prevents multiple redirects on re-renders.
export function OrganizerLocaleReconciler() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as SupportedLocale;
  const { isLoaded, isSignedIn } = useAuth();
  const reconciledRef = useRef(false);

  const prefsQuery = trpc.user.getPreferences.useQuery(undefined, {
    enabled: isLoaded && isSignedIn,
    staleTime: 5 * 60_000,
  });
  const { mutate: setPreferenceMutate } = trpc.user.setPreference.useMutation();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!prefsQuery.data) return;
    if (reconciledRef.current) return;
    reconciledRef.current = true;

    // Guard: LanguageSwitcher sets this flag just before navigating so we don't
    // redirect back while the setPreference mutation is still in-flight.
    try {
      if (sessionStorage.getItem('locale-switch-pending') === '1') {
        sessionStorage.removeItem('locale-switch-pending');
        return;
      }
    } catch {
      // Restricted iframe contexts — fall through to normal reconciliation.
    }

    const { preferredLocale: stored, hasPreference } = prefsQuery.data;
    if (stored === locale) return;

    if (!hasPreference) {
      // No row yet — first-ever sign-in. Seed with the current URL locale so
      // subsequent device logins land on this locale automatically.
      setPreferenceMutate({ locale });
      return;
    }

    router.replace(pathname, { locale: stored });
  }, [isLoaded, isSignedIn, locale, pathname, prefsQuery.data, router, setPreferenceMutate]);

  return null;
}
