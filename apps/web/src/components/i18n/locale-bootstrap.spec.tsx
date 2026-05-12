import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { replaceMock, useAuthState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useAuthState: { isLoaded: true, isSignedIn: false },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/dashboard',
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: useAuthState.isLoaded,
    isSignedIn: useAuthState.isSignedIn,
  }),
}));

import { LocaleBootstrap } from './locale-bootstrap';
import { PREFERRED_LOCALE_KEY } from '@/lib/i18n/preference-storage';

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(LocaleBootstrap));
  });
  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('LocaleBootstrap', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    window.localStorage.clear();
    useAuthState.isLoaded = true;
    useAuthState.isSignedIn = false;
  });

  it('redirects when stored locale differs and user is unauthenticated', async () => {
    window.localStorage.setItem(PREFERRED_LOCALE_KEY, 'es');
    const { unmount } = await render();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard', { locale: 'es' });
    unmount();
  });

  it('does nothing when stored locale matches current locale', async () => {
    window.localStorage.setItem(PREFERRED_LOCALE_KEY, 'en');
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });

  it('does nothing when no locale is stored', async () => {
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });

  it('defers to server-side reconciliation when user is signed in', async () => {
    useAuthState.isSignedIn = true;
    window.localStorage.setItem(PREFERRED_LOCALE_KEY, 'es');
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });

  it('does nothing while Clerk auth is still loading', async () => {
    useAuthState.isLoaded = false;
    window.localStorage.setItem(PREFERRED_LOCALE_KEY, 'es');
    const { unmount } = await render();
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
  });
});
