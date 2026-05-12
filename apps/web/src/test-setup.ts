import { vi } from 'vitest';
import enMessages from '../messages/en.json';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Default global mocks: resolve `useTranslations(namespace).t(key, params)`
// against the real apps/web/messages/en.json so component specs assert
// real English text without needing a wrapping NextIntlClientProvider.
// Specs that need the real next-intl runtime (the missing-key-fallback test)
// call vi.unmock('next-intl') and vi.importActual.

type MessagesNode = Record<string, unknown>;

function resolveByPath(root: MessagesNode, dottedKey: string): unknown {
  let cursor: unknown = root;
  for (const segment of dottedKey.split('.')) {
    if (cursor && typeof cursor === 'object' && segment in (cursor as MessagesNode)) {
      cursor = (cursor as MessagesNode)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function applyParams(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

function translate(
  namespace: string | undefined,
  key: string,
  params?: Record<string, unknown>,
): string {
  const fullPath = namespace ? `${namespace}.${key}` : key;
  const value = resolveByPath(enMessages as unknown as MessagesNode, fullPath);
  if (typeof value === 'string') return applyParams(value, params);
  // Mirror next-intl's getMessageFallback: render the key path on miss.
  return fullPath;
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) =>
    Object.assign(
      (key: string, params?: Record<string, unknown>) => translate(namespace, key, params),
      {
        rich: (key: string, params?: Record<string, unknown>) => translate(namespace, key, params),
      },
    ),
  useFormatter: () => ({
    dateTime: (date: Date | number) => new Date(date).toISOString(),
    number: (n: number) => String(n),
    relativeTime: (date: Date | number) => new Date(date).toISOString(),
  }),
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  hasLocale: (locales: readonly string[], value: unknown) =>
    typeof value === 'string' && locales.includes(value),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  const Link = ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href, ...rest }, children);
  return {
    Link,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => '/',
    redirect: vi.fn(),
    getPathname: (p: { href: string }) => p.href,
  };
});
