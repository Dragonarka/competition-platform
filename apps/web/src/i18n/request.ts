import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale is supplied by middleware (or [locale] segment). Fall back to
  // the default locale on any mismatch to keep RSC rendering deterministic.
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Single source of truth for date/time formatting. Required by next-intl
    // when any component calls format.dateTime() — otherwise SSR and CSR
    // resolve different host timezones and the render aborts with
    // FORMATTING_ERROR. America/Bogota matches the project's primary audience.
    timeZone: 'America/Bogota',
    // Missing-key fallback: render the key path so the UI never crashes when
    // a string hasn't been translated yet. The console warning is logged by
    // the NextIntlClientProvider's onError prop (configured in [locale]/layout.tsx).
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
