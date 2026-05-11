'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

interface IntlProviderClientProps {
  children: ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}

// Client-side wrapper for NextIntlClientProvider that adds onError + a
// readable getMessageFallback. Messages and locale must be passed explicitly
// because NextIntlClientProvider only auto-inherits server context when
// rendered directly in a Server Component; once wrapped in another Client
// Component the server forwarding is bypassed.
//
// AC #3: when a key is missing, the UI must not crash; the key path renders
// as fallback and a console warning identifies it.
export function IntlProviderClient({ children, locale, messages }: IntlProviderClientProps) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={(error) => {
        if (error.code === 'MISSING_MESSAGE') {
          console.warn(`[i18n] Missing translation: ${error.message}`);
          return;
        }
        throw error;
      }}
      getMessageFallback={({ namespace, key }) => (namespace ? `${namespace}.${key}` : key)}
    >
      {children}
    </NextIntlClientProvider>
  );
}
