# i18n (Internationalization)

`next-intl` powers all user-facing strings. See `_bmad-output/planning-artifacts/i18n-framework-decision-2026-05-11.md` for the framework choice rationale.

## Adding a new string

1. Pick a namespace by feature area (`Competitions`, `Dashboard`, `Judge`, `Errors`, …). Reuse one if it exists; only invent new namespaces for new feature areas.
2. Add the key to **both** `apps/web/messages/en.json` and `apps/web/messages/es.json`. The CI parity check (`tsx scripts/check-i18n-parity.ts`) fails if you forget one.
3. Reference the key from the component.

## `useTranslations` vs. `getTranslations`

- **Server components** (no `'use client'` directive) → `import { getTranslations } from 'next-intl/server'; const t = await getTranslations('Namespace');`
- **Client components** (with `'use client'`) → `import { useTranslations } from 'next-intl'; const t = useTranslations('Namespace');`
- For multiple namespaces, call `useTranslations('A')` and `useTranslations('B')` side-by-side, or use the root namespace `useTranslations()` and reference full dotted paths.

Placeholders use ICU MessageFormat: `t('createdOn', { date: '2026-05-11' })` resolves `"Created {date}"`.

## Links and navigation

Import from `@/i18n/navigation` instead of `next/link` and `next/navigation` — those wrappers automatically prefix the current locale (English uses no prefix; Spanish uses `/es/...`). Direct `next/navigation` imports for `useSearchParams`, `notFound`, etc. are fine because those don't deal with locale paths.

## Errors

Backend tRPC errors carry a structured `errorCode` under `error.data.cause.errorCode`. Use `getTrpcErrorI18nKey(error)` from `@/lib/i18n/trpc-error` to map that to a translation key:

```tsx
const t = useTranslations();
const errorKey = getTrpcErrorI18nKey(mutation.error);
return errorKey ? t(errorKey) : (mutation.error?.message ?? t('Errors.UNKNOWN'));
```

Every code in `packages/shared/errors/error-codes.ts` MUST have a matching `Errors.<CODE>` entry in both translation files. The CI coverage check (`tsx scripts/check-error-code-coverage.ts`) fails if any code is missing.

## Date and time formatting

Use `useFormatter()` (client) or `getFormatter()` (server) from `next-intl`:

```tsx
const format = useFormatter();
format.dateTime(new Date(iso), { dateStyle: 'medium' });
format.dateTime(new Date(iso), { timeStyle: 'medium' });
```

The "noon-UTC" trick for date-only inputs (`${dateStr}T12:00:00.000Z`) still applies — locale-aware formatting doesn't change underlying timezone handling.

## Locale routing

Routes nest under `app/[locale]/...`. Locale detection runs in `apps/web/src/proxy.ts` (Next 16 auth proxy, not `middleware.ts`) before Clerk auth so login redirects keep the locale prefix.

- Default locale `en` is unprefixed: `/dashboard`
- Spanish is prefixed: `/es/dashboard`

`routing.ts` defines locales and prefix strategy; `request.ts` is the RSC config loader.

## Missing-key behavior

`getMessageFallback` returns the key path (`Errors.UNKNOWN_THING`) instead of crashing. `onError` logs a `[i18n] Missing translation: …` console warning. Verify with `pnpm test src/lib/i18n/missing-key-fallback.spec.tsx`.

## Format-plugin string ownership

Format plugins (e.g. `packages/formats/cypher-battles`) are domain-agnostic libraries — they MUST NOT own translation files. The host platform passes translated strings via a `labels` prop. Plugin contracts expose typed `Labels` interfaces; host wires them with `useTranslations(...)` results.

## Running the CI checks locally

```bash
cd apps/web
pnpm exec tsx scripts/check-i18n-parity.ts
pnpm exec tsx scripts/check-error-code-coverage.ts
```

Both run automatically as part of `pnpm lint`.
