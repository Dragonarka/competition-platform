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
    // Missing-key fallback: render the key path so the UI never crashes when
    // a string hasn't been translated yet. The console warning is logged by
    // the NextIntlClientProvider's onError prop (configured in [locale]/layout.tsx).
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
