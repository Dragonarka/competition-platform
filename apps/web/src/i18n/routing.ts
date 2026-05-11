import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  // `as-needed` strips the prefix from the default locale (/dashboard for `en`,
  // /es/dashboard for Spanish). Cleaner URLs for the majority case; explicit
  // when users select a non-default language.
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
