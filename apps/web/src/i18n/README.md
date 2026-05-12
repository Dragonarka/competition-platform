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

## Switching language

The shared `<LanguageSwitcher>` from `@/components/i18n/language-switcher` is mounted in every surface layout (admin header, judge page header, public-page layout, presenter-page layout, auth-page layout). Don't roll your own — the component handles cookie + localStorage + server-side persistence in one place.

Two variants:

- `variant="default"` (full label) — used in admin and auth headers.
- `variant="compact"` — short `EN`/`ES` toggle for projector / public chrome.

## Persistence precedence

When the platform decides which locale to render, it consults sources in this order:

1. **Authenticated `users.preferred_locale`** (organizers only) — read by the admin layout's `<OrganizerLocaleReconciler />`. If it differs from the URL locale, the layout redirects to the matching path.
2. **`NEXT_LOCALE` cookie** — set by `next-intl`'s middleware on every locale change (via `useRouter().replace(...)` from `@/i18n/navigation`).
3. **`localStorage.preferredLocale`** — written by `<LanguageSwitcher>` on every switch. Read by `<LocaleBootstrap />` as a fallback when the cookie is missing (Safari ITP / private-mode contexts) AND the user is unauthenticated.
4. **Default `en`** — applied by `next-intl` routing config when nothing else is set.

## First-time organizer flow

When an organizer signs in for the first time, no row exists in `users`. The reconciler reads `getPreferences()` which returns the `en` default. If the URL the user landed on is `/es/...`, the reconciler treats that as deliberate intent and seeds the `users` row with `'es'` via `setPreference({ locale: 'es' })` — it does NOT redirect away. Otherwise the URL wins and no write happens until the user uses the switcher.

## Cross-device sync

Cross-device propagation is **next-page-load semantics**, not real-time. Organizer A switches to Spanish on phone → next time A opens any admin page on laptop, the reconciler reads the stored preference and redirects. There is no Clerk webhook → Socket.IO broadcast pushing the change to existing open sessions. This is by design; if real-time sync is needed, design a separate story.

## Adding a new locale

1. Add the locale code to `apps/web/src/i18n/routing.ts` (`locales` array).
2. Create `apps/web/messages/<code>.json` with the same key structure as `en.json` (CI parity check enforces).
3. Update the Zod enum in `packages/shared/validation/user.schema.ts` (`SUPPORTED_LOCALES`).
4. Update the DB CHECK constraint:
   ```sql
   ALTER TABLE users DROP CONSTRAINT users_locale_check;
   ALTER TABLE users ADD CONSTRAINT users_locale_check
     CHECK (preferred_locale IN ('en', 'es', '<new>'));
   ```
5. Add a third `<option>` to `<LanguageSwitcher>` (or refactor to render `SUPPORTED_LOCALES.map(...)` if not already).

The CI parity script catches missing JSON keys. Nothing catches Zod/CHECK drift automatically — review carefully.

## Running the CI checks locally

```bash
cd apps/web
pnpm exec tsx scripts/check-i18n-parity.ts
pnpm exec tsx scripts/check-error-code-coverage.ts
```

Both run automatically as part of `pnpm lint`.
