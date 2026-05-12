import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SupportedLocale } from '@competition-platform/shared';

// --- Hoisted state (vi.hoisted so it's available inside vi.mock factories) ---
const { replaceMock, setPreferenceMutate, useAuthState, prefsQueryState, currentLocale } =
  vi.hoisted(() => ({
    replaceMock: vi.fn(),
    setPreferenceMutate: vi.fn(),
    useAuthState: { isLoaded: true, isSignedIn: true },
    prefsQueryState: {
      data: null as { preferredLocale: string; hasPreference: boolean } | null,
    },
    currentLocale: { value: 'en' as string },
  }));

vi.mock('next-intl', () => ({
  useLocale: () => currentLocale.value,
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/dashboard',
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: useAuthState.isLoaded,
    isSignedIn: useAuthState.isSignedIn,
  }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    user: {
      getPreferences: {
        useQuery: (_: undefined, opts: { enabled?: boolean; staleTime?: number }) => ({
          data: opts?.enabled !== false ? prefsQueryState.data : null,
        }),
      },
      setPreference: {
        useMutation: () => ({ mutate: setPreferenceMutate }),
      },
    },
  },
}));

import { OrganizerLocaleReconciler } from './organizer-locale-reconciler';

async function render(): Promise<{ root: Root; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(OrganizerLocaleReconciler));
  });
  return {
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('OrganizerLocaleReconciler', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    setPreferenceMutate.mockReset();
    useAuthState.isLoaded = true;
    useAuthState.isSignedIn = true;
    prefsQueryState.data = null;
    currentLocale.value = 'en';
    sessionStorage.clear();
  });

  it('redirects to stored locale when it differs from the URL locale', async () => {
    prefsQueryState.data = { preferredLocale: 'es', hasPreference: true };
    // URL locale = 'en' (default), stored = 'es' → redirect to 'es'
    const { unmount } = await render();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard', { locale: 'es' });
    unmount();
  });

  it('does nothing when stored locale matches the URL locale', async () => {
    prefsQueryState.data = { preferredLocale: 'en', hasPreference: true };
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setPreferenceMutate).not.toHaveBeenCalled();
    unmount();
  });

  it('seeds a row on first sign-in when no preference row exists yet', async () => {
    // URL locale = 'es', no row in DB (hasPreference:false) → seed with 'es'
    currentLocale.value = 'es';
    prefsQueryState.data = { preferredLocale: 'en', hasPreference: false };
    const { unmount } = await render();
    expect(setPreferenceMutate).toHaveBeenCalledTimes(1);
    expect(setPreferenceMutate).toHaveBeenCalledWith({ locale: 'es' as SupportedLocale });
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });

  it('redirects (does NOT seed) when row exists but stored locale differs', async () => {
    // URL locale = 'en', row exists with stored='es' → redirect, not seed
    prefsQueryState.data = { preferredLocale: 'es', hasPreference: true };
    const { unmount } = await render();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(setPreferenceMutate).not.toHaveBeenCalled();
    unmount();
  });

  it('skips reconciliation and clears the flag when locale-switch-pending is set (H1 guard)', async () => {
    sessionStorage.setItem('locale-switch-pending', '1');
    prefsQueryState.data = { preferredLocale: 'es', hasPreference: true };
    // Would normally redirect (stored='es', URL='en'), but flag prevents it
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('locale-switch-pending')).toBeNull();
    unmount();
  });

  it('fires redirect only once per mount (reconciledRef guard — AC #8e)', async () => {
    prefsQueryState.data = { preferredLocale: 'es', hasPreference: true };
    const { root, unmount } = await render();
    expect(replaceMock).toHaveBeenCalledTimes(1);

    // Force a re-render (e.g. parent re-render changing a sibling) — effect
    // must not fire again on the same mount.
    await act(async () => {
      root.render(createElement(OrganizerLocaleReconciler));
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does nothing when Clerk auth is still loading', async () => {
    useAuthState.isLoaded = false;
    prefsQueryState.data = { preferredLocale: 'es', hasPreference: true };
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });

  it('does nothing when user is not signed in', async () => {
    useAuthState.isSignedIn = false;
    prefsQueryState.data = { preferredLocale: 'es', hasPreference: true };
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });

  it('does nothing when query data has not loaded yet', async () => {
    prefsQueryState.data = null;
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setPreferenceMutate).not.toHaveBeenCalled();
    unmount();
  });
});
