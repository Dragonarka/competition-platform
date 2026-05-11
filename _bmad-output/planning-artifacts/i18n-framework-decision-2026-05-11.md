# i18n Framework Decision — Epic 8 Prep

**Date:** 2026-05-11
**Author:** Dragonarka (with Architect agent input)
**Scope:** Choice of i18n framework for Epic 8 (Stories 8-1, 8-2)
**Status:** Decided — `next-intl`

---

## TL;DR

**Use `next-intl` v3 (or v4 if released and stable by Story 8-1 start).** It is the only i18n library actively maintained for Next.js 16's App Router + React 19, integrates cleanly with our `@base-ui/react` shadcn-style components, supports runtime language switching without a page reload (Story 8-2 AC), and provides server-side translation rendering compatible with our SSR + client-island pattern (project-context.md "Recurring Patterns").

This is the **first new runtime dependency** in 7 epics. It is a deliberate, planned exception (per Epic 7 retro team agreement). Documenting it here so the precedent is intentional, not accidental.

---

## Constraints

From the project + Epic 8 ACs:

1. **Next.js 16.2.3 App Router.** Many older i18n guides target the Pages Router or Next 13/14 App Router with different conventions. We need a current option.
2. **React 19.2.4.** Must support React Server Components and not collide with React 19's concurrent features.
3. **TypeScript strict mode.** Translation keys should be type-safe (catch typos at compile time, not runtime).
4. **Runtime language switching without page reload** (Story 8-2 AC #1).
5. **Persistent language preference** — localStorage for unauthenticated users, user profile for authenticated organizers (Story 8-2 AC).
6. **All error codes from `packages/shared/errors` must resolve through i18n keys** (Story 8-1 AC).
7. **CI key-parity check** between `en.json` and `es.json` (Story 8-1 AC).
8. **Compatible with `@base-ui/react`** (our shadcn-style component layer — NOT Radix).
9. **Compatible with Tremor charts** on the admin dashboard (Tremor 3.x has its own i18n surface for chart legends).
10. **Cross-app usage** — strings live across `apps/web` (judge, admin, presenter, public views) AND `packages/formats/cypher-battles` (judge vote input, score input components).

---

## Options Considered

### Option 1: `next-intl` ✅ (CHOSEN)

**Maintainer:** Jan Amann (single-maintainer, but with strong commercial backing via Sponsorware/Open Collective and active GitHub presence).

**Versioning:** v3 stable for Next 13+/14/15. v4 in active development with Next 16 App Router support as a stated priority. Verify v4 stability or use v3 in Next 16 compat mode at Story 8-1 start.

**Pros:**

- **First-class Next.js App Router + RSC support.** Server components can use `getTranslations()` synchronously (well, with `await`). Client components use `useTranslations()` hook. Same import surface, different runtime — exactly fits our SSR + client-island pattern.
- **Type-safe translation keys** via the `messages` namespace declaration. Typos are compile errors.
- **`NextIntlClientProvider`** wraps the client tree with the active locale. Story 8-2's runtime switching is a one-line setLocale call followed by a router refresh — no full page reload, but tree re-renders.
- **Active maintenance.** GitHub release cadence is ~biweekly. Documentation is thorough.
- **MIT licensed.** No commercial gotchas.
- **Server-side message loading.** Messages don't ship to the client unless used in client components — bundle size stays sane.

**Cons:**

- **Single maintainer.** Risk of bus factor. Mitigation: the library is mature enough that forking is feasible if the maintainer disappears.
- **Some Next.js features (parallel routes, intercepting routes) have known interaction quirks** — none of which we use today, but worth noting.
- **`@base-ui/react` integration is untested for us.** The library is component-agnostic so it should "just work" — translations are strings, components consume strings. Verify during Story 8-1 setup.

**Rough integration sketch:**

```tsx
// app/[locale]/layout.tsx — locale segment for the App Router.
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
```

```tsx
// In a server component
import { getTranslations } from 'next-intl/server';
const t = await getTranslations('Common');
return <h1>{t('competitions')}</h1>;

// In a client component
('use client');
import { useTranslations } from 'next-intl';
const t = useTranslations('Common');
return <h1>{t('competitions')}</h1>;
```

### Option 2: `next-i18next`

**Pros:** Once the default for Next.js + i18n. Mature.

**Cons:** **Pages-Router-first.** App Router support is officially "deprecated, use `next-intl` or `react-i18next`" per the maintainer's README. Rejected on maintenance grounds alone.

### Option 3: `react-i18next` (raw)

**Pros:** Universal. Works in any React app. Largest user base. Stable API. Multi-maintainer.

**Cons:**

- **No Next.js App Router story out of the box.** Have to manually wire RSC support, server-side message loading, locale routing — essentially reinventing `next-intl`.
- **More boilerplate per component.** No type-safe keys without additional tooling (`typesafe-i18n` or `@formatjs/intl`).
- **Larger bundle if not carefully tree-shaken.**

Rejected as the maintenance / boilerplate cost is meaningfully higher than `next-intl` for the same end state.

### Option 4: `@formatjs/intl` (Format.js)

**Pros:** ICU MessageFormat support (powerful plural/select rules). Used by Discord, Coursera. Type-safe with `babel-plugin-formatjs`.

**Cons:**

- **Heavier API surface.** ICU MessageFormat is great for complex linguistic features (Spanish has irregular plural forms; ICU handles them). But the project's actual content is mostly static labels — overkill.
- **No App Router integration beyond what you build.** Same problem as `react-i18next`.

Rejected as overkill for the project's actual translation complexity (~200-400 keys, mostly static labels).

### Option 5: Build our own minimal lookup

A naive `t(key)` function reading from JSON files via dynamic import.

**Pros:** Zero dependency. Full control.

**Cons:** Have to reimplement: locale routing, RSC support, runtime switching, type-safe keys, missing-key warnings, ICU plural rules (eventually needed), CI key-parity check. By the time you've built it well, you've reinvented `next-intl` with fewer tests and one maintainer (you).

Rejected. The no-new-deps streak is valuable but not THAT valuable.

---

## Decision

**`next-intl`** for the reasons in Option 1.

---

## Implementation Implications for Story 8-1

This decision unlocks the following Story 8-1 specifics:

1. **Locale routing strategy.** `next-intl` recommends `app/[locale]/...` routing, which means EVERY existing route nests under a new `[locale]` segment. This is a structural change. Alternative: keep current routes flat and use `NextIntlClientProvider` with the locale derived from a cookie / localStorage. Choose during story creation — the cookie/localStorage approach is less disruptive but requires manual locale detection. **Recommendation:** use the `[locale]` segment approach for cleanliness; the migration is mechanical.

2. **Error code → translation key mapping.** `packages/shared/errors/error-codes.ts` defines the codes. Story 8-1 adds a `packages/shared/errors/error-messages.ts` (or the i18n JSON itself) that maps each code to a translation key like `errors.PHASE_NOT_ACTIVE`. tRPC error handling on the client looks up the key.

3. **CI key-parity check.** Story 8-1's tasks must include a CI script that compares `en.json` and `es.json` key sets, exits non-zero if they diverge. Can be a 20-line Node script in `apps/web/scripts/check-i18n-parity.ts` or use `next-intl`'s built-in `lint` if v4 ships with it.

4. **Format-plugin string ownership.** Open question from Epic 7 retro. **Recommendation:** format plugins (`packages/formats/cypher-battles`) should receive their strings via **props** from the platform, not own translation files themselves. This keeps the format-plugin architecture domain-agnostic (Day-1 decision, per memory). The platform's i18n files are the single source of truth. Story 8-1 must expose the right props on `JudgeScoreInput`, `JudgeVoteInput`, etc.

5. **Tremor chart legends.** Pass formatted strings via Tremor's `valueFormatter` and `categoryFormatter` props. No special integration needed — `next-intl`'s `useTranslations()` just returns strings.

6. **`@base-ui/react` confirmation.** No special integration expected. Verify by translating one component in Story 8-1 (e.g., the `Button` doesn't show text itself — text is always a child).

7. **Bundle impact.** Approx +30KB gzip for `next-intl` v3. The 7-epic no-new-deps streak ends with one ~30KB addition. Acceptable.

## Implementation Implications for Story 8-2

1. **Language switcher placement.** Per Story 8-2 AC, available in all views (admin, judge, presenter, public). Build as a small component (`<LanguageSwitcher />`) that calls `next-intl`'s router with the new locale. Place in:
   - Admin: header next to UserButton.
   - Judge: top-right near the connection dot.
   - Presenter: settings menu (mobile, tucked away to preserve teleprompter focus).
   - Public: footer or top-right of standings/bracket pages.

2. **Persistence:**
   - **Authenticated users (organizers):** new `language` column on `users` schema. Requires verifying the table structure. If it doesn't exist as a proper table yet, may need a migration or `user_preferences` table.
   - **Unauthenticated (judges via token, public spectators):** localStorage. `next-intl` can read locale from a cookie (set on switch) — combine with a localStorage fallback for clients that block cookies.

3. **Tradeoffs to flag at story creation:**
   - **Cookie-based locale** is server-readable, which means RSC renders in the right locale on first load. localStorage-only is client-readable, which means a flash of English content while JS bootstraps. The cookie approach is preferred.

---

## Validation Plan

Story 8-1 should ship with these proofs:

- One server component using `getTranslations()` correctly renders in both locales.
- One client component using `useTranslations()` updates without page reload when locale changes.
- One error path (e.g., `PHASE_NOT_ACTIVE`) renders the translated message, not the raw error code.
- CI key-parity check fails when keys diverge (write a test that proves the check works).
- Format-plugin component (`JudgeScoreInput`) receives strings via props, not from its own translation file.

If any of these can't be proven, the framework choice gets revisited.

---

## Risks

1. **`next-intl` v4 not ready by Story 8-1 start.** Mitigation: use v3, plan a v4 migration as a future cleanup.
2. **Locale segment migration is bigger than expected.** Mitigation: time-box; if it blocks, fall back to the cookie/localStorage approach (less clean but works).
3. **Tremor integration surprises.** Low risk; `next-intl` just returns strings. Verified by inspection of Tremor's API surface.
4. **Bus factor on `next-intl`.** Low-to-medium risk. Mitigation: the library is small enough to fork if needed; we're not betting the project on it being maintained for years, just for the current epic.

---

## Open Questions to Resolve at Story 8-1 Creation

1. Locale segment routing (`app/[locale]/...`) vs. flat routes with cookie-based detection?
2. Translation file structure — one big JSON per locale or per-namespace files (`auth.json`, `competitions.json`, `errors.json`)?
3. Does the existing `users` table have a `language` column or do we need a migration?
4. Should Spanish translations be machine-generated initially (DeepL/Claude) and human-reviewed, or human-authored from the start?
5. Are there any string-formatting requirements (date/time/number formats) that vary between en-US and es-ES/es-MX/es-AR? Pick a Spanish locale variant explicitly.

These go into Story 8-1's "Open Questions for Implementation" section.

---

## Conclusion

**`next-intl`** is the right framework for Epic 8 given Next.js 16 + React 19 + our SSR + client-island architecture. It is the first new runtime dependency in 7 epics and is a deliberate, scoped exception. Story 8-1 should begin with this decision documented in its Dev Notes.
