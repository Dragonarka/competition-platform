import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// This spec needs the REAL next-intl runtime (it's proving the missing-key
// fallback behavior end-to-end). The default test-setup mocks next-intl with
// a passthrough so most component specs don't need to wire a provider; unmock
// it here before importing the real symbols.
vi.unmock('next-intl');
const { NextIntlClientProvider, useTranslations } =
  await vi.importActual<typeof import('next-intl')>('next-intl');

// Component-level proof of AC #3: when a key is missing, the UI renders the
// key path as a safe fallback and a console warning fires — no crash.
function Greeting() {
  const t = useTranslations('Hello');
  return <span data-testid="greeting">{t('missingKey')}</span>;
}

describe('missing-key fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the key path and triggers onError when a key is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const onError = vi.fn((err: Error & { code?: string }) => {
      if (err.code === 'MISSING_MESSAGE') {
        console.warn(`[i18n] Missing translation: ${err.message}`);
        return;
      }
      throw err;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <NextIntlClientProvider
          locale="en"
          messages={{ Hello: { other: 'world' } }}
          onError={onError}
          getMessageFallback={({ namespace, key }) => (namespace ? `${namespace}.${key}` : key)}
        >
          <Greeting />
        </NextIntlClientProvider>,
      );
    });

    const greeting = container.querySelector('[data-testid="greeting"]');
    expect(greeting?.textContent).toBe('Hello.missingKey');
    expect(onError).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});
