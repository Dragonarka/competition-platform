'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

interface IntlProviderClientProps {
  children: ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}

// Must match the timeZone set in `src/i18n/request.ts`. Single constant
// so server (RSC) and client formatters resolve identically — otherwise
// next-intl throws FORMATTING_ERROR: ENVIRONMENT_FALLBACK on the client
// the first time format.dateTime() is called.
const APP_TIME_ZONE = 'America/Bogota';

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
      timeZone={APP_TIME_ZONE}
      onError={(error) => {
        if (error.code === 'MISSING_MESSAGE') {
          console.warn(`[i18n] Missing translation: ${error.message}`);
          return;
        }
        // ENVIRONMENT_FALLBACK on the client is non-fatal; log and keep
        // rendering so a single bad date formatter call doesn't crash a list.
        if (error.code === 'ENVIRONMENT_FALLBACK') {
          console.warn(`[i18n] Formatter fell back to environment: ${error.message}`);
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
