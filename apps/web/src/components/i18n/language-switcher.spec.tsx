import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { replaceMock, setPreferenceMutate, useAuthState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  setPreferenceMutate: vi.fn(),
  useAuthState: { isLoaded: true, isSignedIn: false },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    createElement('a', { href }, children),
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
      setPreference: {
        useMutation: () => ({ mutate: setPreferenceMutate }),
      },
    },
  },
}));

import { LanguageSwitcher } from './language-switcher';
import { PREFERRED_LOCALE_KEY } from '@/lib/i18n/preference-storage';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(props: Parameters<typeof LanguageSwitcher>[0] = {}): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(LanguageSwitcher, props));
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function selectOption(container: HTMLElement, value: string) {
  const select = container.querySelector('[data-testid="language-switcher"]') as HTMLSelectElement;
  expect(select).not.toBeNull();
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    setPreferenceMutate.mockReset();
    window.localStorage.clear();
    useAuthState.isLoaded = true;
    useAuthState.isSignedIn = false;
  });

  it('renders both locale options', async () => {
    const { container, unmount } = await render();
    const select = container.querySelector(
      '[data-testid="language-switcher"]',
    ) as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[0].value).toBe('en');
    expect(select.options[1].value).toBe('es');
    unmount();
  });

  it('calls router.replace with the chosen locale', async () => {
    const { container, unmount } = await render();
    selectOption(container, 'es');
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard', { locale: 'es' });
    unmount();
  });

  it('writes the new locale to localStorage', async () => {
    const { container, unmount } = await render();
    selectOption(container, 'es');
    expect(window.localStorage.getItem(PREFERRED_LOCALE_KEY)).toBe('es');
    unmount();
  });

  it('does not call setPreference when the user is unauthenticated', async () => {
    useAuthState.isSignedIn = false;
    const { container, unmount } = await render();
    selectOption(container, 'es');
    expect(setPreferenceMutate).not.toHaveBeenCalled();
    unmount();
  });

  it('calls setPreference when the user is signed in', async () => {
    useAuthState.isSignedIn = true;
    const { container, unmount } = await render();
    selectOption(container, 'es');
    expect(setPreferenceMutate).toHaveBeenCalledTimes(1);
    expect(setPreferenceMutate).toHaveBeenCalledWith({ locale: 'es' }, expect.any(Object));
    unmount();
  });

  it('does nothing when the chosen locale matches the current locale', async () => {
    const { container, unmount } = await render();
    selectOption(container, 'en');
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setPreferenceMutate).not.toHaveBeenCalled();
    unmount();
  });

  it('renders the compact variant with short labels', async () => {
    const { container, unmount } = await render({ variant: 'compact' });
    const select = container.querySelector(
      '[data-testid="language-switcher"]',
    ) as HTMLSelectElement;
    expect(select.options[0].textContent).toBe('EN');
    expect(select.options[1].textContent).toBe('ES');
    unmount();
  });
});
