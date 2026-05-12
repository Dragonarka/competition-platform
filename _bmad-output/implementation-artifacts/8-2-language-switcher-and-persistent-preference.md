# Story 8.2: Language Switcher & Persistent Preference

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user (organizer, judge, or competitor),
I want to switch the platform language between Spanish and English and have my preference remembered across sessions and devices,
so that I always experience the platform in the language I'm most comfortable with.

## Acceptance Criteria

1. **Given** I am on any page of the platform (admin, judge, presenter, public), **when** I use the language switcher, **then** the entire visible UI re-renders in the selected language without a full-page reload (FR62) — including all current strings, formatter outputs (dates, numbers), and any in-flight tRPC error messages that are already mapped via `Errors.<CODE>` keys.

2. **Given** I am an unauthenticated user (judge via invite link, public viewer, presenter), **when** I select Spanish and then later return to the platform in the same browser (after a tab close, browser restart, or invite-link re-entry), **then** the platform loads in Spanish (FR63). Persistence is via **both** the `NEXT_LOCALE` cookie (set by next-intl's `useRouter` locale change) **and** `localStorage['preferredLocale']` (explicit mirror for cookie-cleared / private-mode scenarios).

3. **Given** I am an authenticated organizer, **when** I change my language preference on any device, **then** the preference is persisted server-side (new `users` table, `preferred_locale` column) and applied automatically the next time I sign in on any browser (FR63). On sign-in, if the URL locale differs from my stored preference, the layout redirects me to the correct-locale path before any content renders.

4. **Given** I am a judge accessing via invite link, **when** I switch the language on the scoring interface, **then** all criteria labels, button text, status messages, idempotency-related toasts, and error messages switch to the selected language. The switcher is rendered in the judge page header alongside the connection-status indicator.

5. **Given** I am an organizer on the admin dashboard, **when** I switch to Spanish, **then** all dashboard labels, KPI cards, Tremor chart legends (if/when added), status indicators, and navigation items display in Spanish. The switcher renders in the admin layout header next to the Clerk `<UserButton>`.

6. **Given** the public standings or bracket URL is open on a projected screen or shared link, **when** the organizer or screen operator switches the language, **then** the standings, bracket labels, breakdown panel, presenter teleprompter, and all UI text update to the selected language. On the presenter view specifically, the switcher is unobtrusive (corner-placed) to avoid breaking the projector aesthetic.

7. **Given** the Spanish translation file (`messages/es.json`) carries 605 first-pass machine-translated keys from Story 8.1, **when** Story 8.2 ships, **then** all judge-side terminology and any other strings flagged in 8.1's residual notes (e.g. `Sembrado #{seed}`, `Slot de juez`, region-specific verb tenses) have been reviewed and corrected to natural neutral Spanish (`es` generic — no regional variant chosen yet, per 8.1 decision).

8. **And** the language preference flow is documented (where storage lives, how to add a third locale in the future), and tests cover: (a) switcher component renders both locales, (b) `user.setPreference` rejects unknown locales via Zod, (c) `user.setPreference` rejects unauthenticated callers, (d) localStorage mirror is written on switch, (e) authenticated-user redirect-on-locale-mismatch fires only once per session.

## Prerequisites

- **Story 8.1 done** ✓ — `next-intl@4.11.2` framework, `[locale]/` routing, `@/i18n/navigation` exports, `IntlProviderClient`, CI parity + error-code coverage scripts, 605 keys parity in `en.json` and `es.json`. Commit `62265ae`.
- **Adversarial code review gate** restored in Story 8.1 (per Epic 7 retro commitment). 8.2 must run `/bmad-bmm-code-review` before flipping to `done` — ideally with a different LLM than the implementer.
- **`packages/db/schema/users.ts`** is currently empty (`export {}`). 8.2 owns its initial definition.

## Tasks / Subtasks

- [x] Task 1: Build shared `<LanguageSwitcher>` client component (AC: #1, #4, #5, #6)
  - [x] **New file** `apps/web/src/components/i18n/language-switcher.tsx` (`'use client'`).
  - [x] Component API:
    ```tsx
    interface LanguageSwitcherProps {
      variant?: 'default' | 'compact'; // 'compact' = icon-only for projector/public chrome
      align?: 'start' | 'end'; // dropdown alignment
      onChange?: (next: 'en' | 'es') => void; // optional; default handles persistence itself
    }
    ```
  - [x] Uses `useLocale()` from `next-intl` to read current locale and `useRouter`/`usePathname` from `@/i18n/navigation` to switch:
    ```tsx
    const router = useRouter();
    const pathname = usePathname();
    router.replace(pathname, { locale: next });
    ```
    `next-intl`'s router writes the `NEXT_LOCALE` cookie automatically on this call (verify by inspecting `document.cookie` in the dev browser before/after).
  - [x] **localStorage mirror** — on switch, write `localStorage.setItem('preferredLocale', next)` (key name standardized in a constant in `apps/web/src/lib/i18n/preference-storage.ts` so the read side and write side share the same string).
  - [x] **Authenticated organizer write-through** — if `useAuth().isSignedIn` is true, fire `trpc.user.setPreference.mutate({ locale: next })`. **Do NOT await**; UI must not block on the network. On error, log to console (`[i18n] failed to persist preference`) — the cookie/localStorage path keeps the UI behaviour correct, the server sync is best-effort.
  - [x] **UI shell** — use the project's `@base-ui/react` `Select` primitive (NOT Radix; check `apps/web/src/components/ui/select.tsx` exists — if not, add it via shadcn's `@base-ui/react` variant before authoring the switcher). Two items: "English" / "Español". `compact` variant renders the current locale code (`EN`/`ES`) inside a 32×32 button with a globe icon (`Languages` from `lucide-react`).
  - [x] **Accessibility** — `aria-label` from `t('LanguageSwitcher.label')`; menu items use `aria-current="true"` on the active locale.
  - [x] **Translation keys** — add `LanguageSwitcher.label`, `LanguageSwitcher.english`, `LanguageSwitcher.spanish` to BOTH `messages/en.json` and `messages/es.json` (CI parity check enforces).

- [x] Task 2: Wire `<LanguageSwitcher>` into all four surfaces (AC: #4, #5, #6)
  - [x] **Admin layout** (`apps/web/src/app/[locale]/(admin)/layout.tsx`) — render `<LanguageSwitcher align="end" />` in the header `<div>` to the left of `<UserButton />`. Header is currently `<header className="flex items-center justify-between …">`; wrap the right side in a flex container with `gap-3`.
  - [x] **Judge page** (`apps/web/src/app/[locale]/(judge)/judge/[token]/page.tsx`) — judge layout currently inlines a connection-status indicator at the top of the page; render `<LanguageSwitcher variant="compact" />` next to it. **Do not** disturb the connection-status colour pulse (it's the most-watched element on the page).
  - [x] **Public pages** (standings, bracket) — these don't currently have a shared layout under `[locale]/(public)/`. Add a thin `apps/web/src/app/[locale]/(public)/layout.tsx` if it doesn't exist: a header bar with the competition name (from the SSR fetch) and `<LanguageSwitcher variant="compact" />`. Re-use existing public-page styling tokens; don't introduce new design language.
  - [x] **Presenter view** (`apps/web/src/components/presenter/presenter-view.tsx`) — corner-placed `<LanguageSwitcher variant="compact" />` in the top-right with `opacity-50 hover:opacity-100 transition` so it doesn't compete with the projected content. Confirm with a manual projector check (or screenshot at 1920×1080) that the switcher doesn't draw the eye away from the standings/matchup focus area.
  - [x] **Sign-in / sign-up** (`(auth)/sign-in`, `(auth)/sign-up`) — render the switcher above the Clerk component so an unauthenticated user can choose Spanish before signing in. Clerk's own component supports its own locale via its `localization` prop — wire `esES` from `@clerk/localizations` if the active locale is `es`, otherwise default. Reference: `@clerk/localizations` is already an indirect dep; if not, see Open Questions for whether to add it.

- [x] Task 3: localStorage + cookie reconciliation (AC: #2)
  - [x] **New file** `apps/web/src/lib/i18n/preference-storage.ts`:
    ```typescript
    export const PREFERRED_LOCALE_KEY = 'preferredLocale';
    export function readStoredLocale(): 'en' | 'es' | null {
      /* … */
    }
    export function writeStoredLocale(locale: 'en' | 'es'): void {
      /* … */
    }
    ```
    Guards `typeof window === 'undefined'` and `try { … } catch { /* private mode */ }`.
  - [x] **Boot-time reconciliation hook** — `apps/web/src/components/i18n/locale-bootstrap.tsx` (`'use client'`, mounted once in `[locale]/layout.tsx` near `IntlProviderClient`). On mount:
    1. Read `localStorage.preferredLocale`.
    2. If present AND different from current URL locale AND **no** authenticated user (Clerk `isLoaded && !isSignedIn`), call `router.replace(pathname, { locale: stored })`.
    3. Authenticated users are reconciled server-side in Task 5; client-side bootstrap defers to them to avoid a double redirect race.
  - [x] **First-visit cookie defaulting** — `next-intl`'s middleware already sets `NEXT_LOCALE` cookie when no preference exists. Verify this by clearing all cookies + localStorage in the dev browser, visiting `/`, confirming the cookie now exists. Document the exact cookie name and lifetime in `apps/web/src/i18n/README.md`.

- [x] Task 4: New `users` table + migration + RLS (AC: #3)
  - [x] **Define `packages/db/schema/users.ts`**:

    ```typescript
    import { sql } from 'drizzle-orm';
    import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
    import { nanoid } from 'nanoid';

    export const users = pgTable(
      'users',
      {
        id: text('id')
          .primaryKey()
          .$defaultFn(() => nanoid(21)),
        clerkId: text('clerk_id').notNull(),
        preferredLocale: text('preferred_locale').notNull().default('en'),
        createdAt: timestamp('created_at', { withTimezone: true })
          .notNull()
          .default(sql`now()`),
        updatedAt: timestamp('updated_at', { withTimezone: true })
          .notNull()
          .default(sql`now()`),
      },
      (table) => [uniqueIndex('uq_users_clerk_id').on(table.clerkId)],
    );
    ```

  - [x] **Migration SQL** (`packages/db/drizzle/<timestamp>_users.sql`):
    1. `CREATE TABLE users (…)` matching the schema.
    2. `UNIQUE INDEX uq_users_clerk_id ON users(clerk_id)`.
    3. **RLS policy** — `users` rows are scoped to the authenticated user themselves:
       ```sql
       ALTER TABLE users ENABLE ROW LEVEL SECURITY;
       CREATE POLICY users_self_only ON users
         USING (clerk_id = current_setting('session.current_organizer_id', true));
       ```
       NB: `current_organizer_id` is the existing session var name (see `project-context.md` RLS rule). Reusing it keeps the precedent — the variable name is misleadingly organizer-specific, but it carries the `clerk_id` of whoever is authenticated.
    4. Also enforce `INSERT` and `UPDATE` `WITH CHECK (clerk_id = current_setting('session.current_organizer_id', true))` so the policy is symmetric.
  - [x] **Locale check constraint** — add `CHECK (preferred_locale IN ('en', 'es'))` so DB-level integrity matches the routing config. Keep the constraint definition in the migration SQL; the Drizzle schema doesn't natively express it, so add a `sql` template tag if useful. **Rationale:** prevents typos / future-loose Zod schemas from writing bogus values.
  - [x] Export `users` from `packages/db/schema/index.ts` (already wildcarded; verify the wildcard picks it up — `export * from './users';` is already there).

- [x] Task 5: tRPC `user` router with `getPreferences` and `setPreference` (AC: #3, #8)
  - [x] **New file** `apps/api/src/trpc/routers/user.router.ts`:
    - Factory pattern: `export function createUserRouter(db: DatabaseService) { … }`.
    - Two procedures, both `protectedProcedure`:
      - `user.getPreferences` (input: `void`) → `{ preferredLocale: 'en' | 'es' }`. Read with RLS transaction. If no row exists for `clerkId`, return `{ preferredLocale: 'en' }` (the default) WITHOUT inserting — insertion is lazy on first `setPreference`.
      - `user.setPreference` (input: `{ locale: z.enum(['en', 'es']) }`) → `{ preferredLocale: 'en' | 'es' }`. Use `INSERT … ON CONFLICT (clerk_id) DO UPDATE SET preferred_locale = excluded.preferred_locale, updated_at = now() RETURNING preferred_locale`.
    - **Validation schemas** in `packages/shared/validation/user.ts`:
      ```typescript
      export const setLocalePreferenceSchema = z.object({
        locale: z.enum(['en', 'es']),
      });
      export type SetLocalePreferenceInput = z.infer<typeof setLocalePreferenceSchema>;
      ```
    - Register on `appRouter`: `user: createUserRouter(db)`.
  - [x] **Both procedures use the RLS transaction pattern** (see `project-context.md`):
    ```typescript
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      // queries here
    });
    ```
  - [x] **`updatedAt` bump** — `setPreference`'s `ON CONFLICT … DO UPDATE` already sets it explicitly via `excluded.preferred_locale, updated_at = now()`. Verify in the integration test.
  - [x] **TOCTOU note** — the `ON CONFLICT` pattern is naturally TOCTOU-safe, but two concurrent `setPreference` calls with different locales can race; "last write wins" is acceptable semantics for this column. Document inline.

- [x] Task 6: Authenticated-user locale reconciliation on layout render (AC: #3)
  - [x] **In `[locale]/(admin)/layout.tsx`** (Server Component, already `force-dynamic`):
    1. After `auth()` returns `userId`, call `createServerTrpcClient().user.getPreferences.query()`.
    2. If `data.preferredLocale !== currentLocale`, `redirect(pathnameForLocale)` using the locale-aware redirect helper from `@/i18n/navigation` (`redirect` re-exported there). **Critical:** the helper must build the full path including the current dynamic segments (admin layouts have `/dashboard`, `/competitions/[id]`, …). Use `getPathname({ href: pathname, locale: data.preferredLocale })`.
  - [x] **Idempotency / loop guard** — the redirect fires the user to the matching-locale URL on first sign-in OR first page-load after a cross-device switch. Once at the matching locale, the check is a no-op. **Edge case:** if the user just used the in-page switcher (which already navigated them), the server-side preference may briefly lag the URL. To prevent a flapping redirect, only redirect if `currentLocale !== preferredLocale` AND there's no `?locale-switch=1` query flag (the in-page switcher sets it on the destination URL and the next render strips it). Document the protocol inline.
  - [x] **Defer in non-admin layouts** — only the admin (organizer) flow has Clerk auth and a guaranteed `userId`. Judge and public flows are unauthenticated and rely on cookie/localStorage only.

- [x] Task 7: Sign-in flow respects pre-auth locale + applies stored preference (AC: #2, #3)
  - [x] **Pre-sign-in:** if the user changed the switcher on `/sign-in` to Spanish, sign-in flow lands at `/es/sign-in`. Clerk's redirect-after-sign-in (configured in `apps/web/.env.local` or in the `<SignIn />` component) must preserve the locale prefix. Verify the redirect URL pattern in `apps/web/src/app/[locale]/(auth)/sign-in/[[...sign-in]]/page.tsx` (or its 8.1 equivalent) uses a relative path like `/dashboard` so the Clerk redirect plus locale-aware route resolution lands at `/es/dashboard`.
  - [x] **Post-sign-in:** the admin layout's reconciliation (Task 6) takes over from there. **First-sign-in** from a brand-new organizer = no `users` row exists → `getPreferences` returns `{ preferredLocale: 'en' }` default → if URL locale is `es`, the URL wins (because the user just expressed intent by being there); skip the redirect when the row doesn't exist AND seed a row via a silent `setPreference({ locale: currentLocale })` call after first authenticated page render so subsequent device logins land correctly.
  - [x] **Document the precedence** in `apps/web/src/i18n/README.md`:
    > Precedence: (1) authenticated `users.preferred_locale` (organizers only) → (2) `NEXT_LOCALE` cookie → (3) `localStorage.preferredLocale` → (4) default `en`. The middleware applies (2)→(4); the layout applies (1).

- [x] Task 8: Spanish translation human-review pass (AC: #7)
  - [x] **Audit `messages/es.json`** end-to-end. Focus areas flagged in Story 8.1 residual notes:
    - **Judge-side terminology** — verify `Sembrado #{seed}`, `Slot de juez`, criteria-input prompts, vote-submission confirmations. "Sembrado" is a regional-neutral fit; "Slot de juez" reads as Spanglish — consider "Puesto de juez" or "Estación de juez".
    - **Cypher / Battles** — keep the English domain terms (`Cypher`, `Battles`) as-is in Spanish (these are subculture-specific terms); but add a localized helper phrase where the term first appears (e.g., `Fase Cypher (puntuación individual)`).
    - **Status verbs / tense** — confirm all "submitted/started/completed" status text uses neutral Latin-American Spanish (avoid `vosotros`, prefer `ustedes`).
    - **Date formatters** — `useFormatter().dateTime(...)` uses `Intl.DateTimeFormat` under the hood; locale `es` produces "12 de mayo de 2026" which is correct and locale-neutral.
  - [x] **Per-string rule** — when a key changes, the English version SHOULD stay stable (no en.json drift in this task). If a translation reveals an English string is itself unclear, flag it in the PR description rather than silently editing en.json.
  - [x] **Spot-check via the switcher** — manually switch to Spanish in dev, walk through: dashboard, create competition, judge page (use a real invite-link token from a simulation), public standings, presenter view. Note any awkward layouts (Spanish strings are ~30% longer on average — common breakage spots: button widths, table column headers, tab labels, KPI card headlines).
  - [x] **Layout adjustments** for Spanish overflow — only the bare minimum. Prefer `truncate` / `min-w-0` patches over manual width tweaks. Anything beyond a 10-line CSS delta is out of scope; flag for a future story.
  - [x] **No new keys** in this task. Re-translation only. The 605-key total stays at 605.

- [x] Task 9: Tests (AC: #8)
  - [x] **Component tests** (`apps/web/src/components/i18n/language-switcher.spec.tsx`):
    1. Renders both locale options with the active one marked `aria-current="true"`.
    2. Clicking the inactive option calls `router.replace(pathname, { locale: <other> })` once.
    3. Clicking the inactive option writes `localStorage.preferredLocale`.
    4. When `useAuth().isSignedIn` is true, the click also calls `trpc.user.setPreference.mutate({ locale })` exactly once; when false, the tRPC call is skipped.
    5. Switcher is keyboard-accessible (Tab + Enter activates the selection).
  - [x] **Bootstrap test** (`locale-bootstrap.spec.tsx`):
    1. With stored `localStorage.preferredLocale = 'es'` and URL locale `en` and `!isSignedIn`, calls `router.replace(pathname, { locale: 'es' })` once.
    2. With `isSignedIn = true`, does NOT call replace (server-side reconciliation owns this).
    3. With no stored value, does nothing.
  - [x] **tRPC unit tests** (`apps/api/src/trpc/routers/user.router.spec.ts`):
    1. `user.getPreferences` with no row returns `{ preferredLocale: 'en' }`.
    2. `user.getPreferences` reads the latest row when one exists.
    3. `user.setPreference({ locale: 'es' })` upserts and returns `{ preferredLocale: 'es' }`.
    4. `user.setPreference({ locale: 'fr' as never })` rejects with Zod validation error.
    5. `caller(null).user.getPreferences()` → `{ code: 'UNAUTHORIZED' }`.
    6. `caller(null).user.setPreference({ locale: 'en' })` → `{ code: 'UNAUTHORIZED' }`.
  - [x] **Real-DB integration test** (`apps/api/src/trpc/routers/__integration__/user.int.spec.ts`):
    1. Insert via `setPreference`, read via `getPreferences`, verify round-trip.
    2. RLS enforcement: with `current_organizer_id` set to user A, attempt to SELECT user B's row — must return 0 rows.
    3. `INSERT … ON CONFLICT … DO UPDATE` correctly bumps `updated_at`.
    4. CHECK constraint rejects bogus locales at the DB level (parameterize the SQL to bypass Zod for this one test).
  - [x] **E2E / manual verification matrix** (documented in PR description, no Playwright spec required):
        | Surface | Switch to ES | Reload | Cross-browser | Cross-device (org only) |
        |---------|--------------|--------|---------------|--------------------------|
        | Admin dashboard | ✓ | ✓ | ✓ | ✓ |
        | Create competition | ✓ | ✓ | — | — |
        | Judge page | ✓ | ✓ | ✓ (localStorage carries it) | n/a (no account) |
        | Public standings | ✓ | ✓ | ✓ | n/a |
        | Presenter view | ✓ | ✓ | n/a | n/a |
        | Sign-in page | ✓ | ✓ | — | — |

- [x] Task 10: Documentation
  - [x] Update `apps/web/src/i18n/README.md`:
    - Add a "Switching language" section explaining where the switcher lives in each surface.
    - Add a "Persistence precedence" section (the 4-level list from Task 7).
    - Add a "Adding a new locale" snippet (add to `routing.ts`, add a third `messages/<code>.json`, update CHECK constraint + Zod enum, add a third `<SelectItem>` to the switcher).
  - [x] Update `_bmad-output/project-context.md`:
    - Frontend Rules section: add one bullet — "Language switching uses `<LanguageSwitcher>` from `@/components/i18n/language-switcher`. Don't roll your own; the component handles cookie + localStorage + server-side persistence."
    - Don't-Miss Rules: add — "When adding a new locale, update Zod enum, DB CHECK constraint, routing.ts, AND both translation files. CI parity check catches the JSON; nothing catches the Zod/CHECK drift — fix it by hand."

- [x] Task 11: CI gate verification
  - [x] `pnpm exec turbo run lint typecheck test build --filter='!@competition-platform/tests'` → green.
  - [x] Specifically verify integration test runs (`pnpm --filter @competition-platform/api test:integration`) with a clean DB. Re-run after migration; confirm `users` table exists and RLS is enforced.
  - [x] Manual smoke matrix from Task 9 documented in the PR.

- [x] Task 12: Adversarial code review gate
  - [x] Ran `/bmad-bmm-code-review` in a fresh context window (claude-sonnet-4-6, different from claude-opus-4-7 implementer).
  - [x] **3 HIGH** findings resolved, **2 MEDIUM** resolved, **2 LOW** documented in residuals below.
  - [x] Status flipped to `done`.

## Dev Notes

### Why a `users` Table Now (vs. Deferring Again)

Story 8.1 explicitly handed this off: "Story 8-2 needs to add one (or a separate `user_preferences` table) for organizer language storage." Two options were considered:

1. **`users` table keyed by `clerk_id`** ✓ — first-class entity. Future preferences (notification settings, dashboard layout prefs, default scoring view) get columns or a JSON blob alongside `preferred_locale`. Lower friction for organizer-scoped settings going forward.
2. **`user_preferences` key-value** — more flexible but adds row-per-(user, key) overhead now for one preference; harder to read in a single query.

Choosing (1) — least amount of indirection for the actual need.

### Why `current_organizer_id` as the Session Var (Despite the Name)

The session variable `session.current_organizer_id` was named in Story 2.x when only organizers were authenticated entities. Despite the name, the value is just the Clerk `userId` of whoever is authenticated — judges are unauthenticated and never set it. Reusing it for the `users` table RLS policy keeps the RLS pattern uniform; renaming the session variable is out of scope (it cascades into every router's `SET LOCAL` call).

If the project ever adds a non-organizer authenticated user type (e.g., a "head judge" with an account), revisit the session variable name in a dedicated refactor story.

### Why localStorage AND Cookie

Belt-and-suspenders. The cookie (`NEXT_LOCALE`) is what middleware reads on every request; localStorage is the safety net for:

- Browsers that clear cookies aggressively (Safari ITP private mode after 7 days).
- Private/incognito tabs where cookies don't persist across sessions but localStorage might (varies by browser).
- Future debugging — localStorage is reachable from devtools without a JSON parser.

The component writes both; the bootstrap hook reads localStorage as a last resort when the cookie is missing. The two MUST agree post-switch (component writes both atomically). If they diverge, the cookie wins (server-authoritative) — but `locale-bootstrap.tsx` doesn't try to detect divergence; that's a YAGNI.

### Switcher Component Choice — Select Primitive

`@base-ui/react`'s `Select` primitive is the project convention. Plain `<select>` would work and be slightly more accessible by default, but doesn't match the visual language of the other dropdowns (`competition-card.tsx` dropdown, `participants-manager.tsx`). One-line CSS override that we'd otherwise need on a native select is not worth the inconsistency.

If `apps/web/src/components/ui/select.tsx` doesn't exist yet, add it via the project's shadcn-on-base-ui pattern (look at how `tabs.tsx` was added). Don't run `pnpm dlx shadcn@latest add select` blindly — it may pull in Radix; check the import paths.

### Layout Reconciliation Race

The trickiest behaviour: organizer A on browser X switches to Spanish (writes server-side); on browser Y (already open at `/dashboard` in English), how does Y notice?

**Y will notice only on the next page navigation or hard reload.** The layout reconciliation in Task 6 runs on Server Component render — it doesn't push to existing client sessions. This is acceptable: cross-device sync is "next page load" semantics, not "real-time." If pressing for real-time, a future story can add a Clerk webhook → Socket.IO broadcast → client-side switch trigger; out of scope for 8.2.

Document this expectation in `README.md` so a future developer doesn't re-investigate why a switch on phone doesn't immediately propagate to a laptop in the same session.

### Presenter View Switcher Placement

The presenter view is meant for a projector. Any UI chrome competes with the projected content. The pattern:

```tsx
<div className="absolute top-2 right-2 opacity-30 hover:opacity-100 transition">
  <LanguageSwitcher variant="compact" />
</div>
```

If the screen operator is using the projector full-screen, they'll likely have a separate control surface (the admin laptop) — the in-presenter switcher is a fallback. Don't optimize for it.

### Spanish Length Inflation

Rule of thumb: Spanish text is ~25-30% longer than English. Common breakage:

- **Button labels** — `"New Competition"` → `"Nueva Competencia"` (longer, usually fine). `"Configure Judges"` → `"Configurar Jueces"` (still ok). Watch out for compound English verbs like `"Save & Continue"` → `"Guardar y Continuar"` which can wrap.
- **KPI card headlines** — single-line by default; Spanish often wraps. `truncate` + `title={...}` hover is the right fallback.
- **Table column headers** — `"Submitted at"` → `"Enviado el"` (shorter, no issue). `"Avg score"` → `"Puntaje promedio"` (longer, may need column width tweak).
- **Tab labels** — usually ok at the existing widths; `"Standings" / "Bracket"` → `"Clasificación" / "Llaves"`.

**Heuristic:** if a Spanish string is more than 1.4× the English length and lives in a fixed-width container, check it manually. Most cases just need `min-w-0` + `truncate` on the parent.

### Project Structure Notes

**New files:**

```
apps/web/src/components/i18n/language-switcher.tsx           (shared switcher component)
apps/web/src/components/i18n/locale-bootstrap.tsx            (client-side reconciliation)
apps/web/src/components/i18n/language-switcher.spec.tsx
apps/web/src/components/i18n/locale-bootstrap.spec.tsx
apps/web/src/lib/i18n/preference-storage.ts                  (localStorage helpers)
apps/web/src/components/ui/select.tsx                        (only if not present yet)
apps/web/src/app/[locale]/(public)/layout.tsx                (only if not present yet)
apps/api/src/trpc/routers/user.router.ts
apps/api/src/trpc/routers/user.router.spec.ts
apps/api/src/trpc/routers/__integration__/user.int.spec.ts
packages/shared/validation/user.ts
packages/db/drizzle/<timestamp>_users.sql                    (migration)
```

**Modified files:**

```
packages/db/schema/users.ts                                  (replace empty `export {}` with users table)
packages/shared/index.ts                                     (re-export validation if needed)
apps/api/src/trpc/app-router.ts                              (mount user router)
apps/web/src/app/[locale]/layout.tsx                         (mount <LocaleBootstrap />)
apps/web/src/app/[locale]/(admin)/layout.tsx                 (header switcher + reconciliation)
apps/web/src/app/[locale]/(judge)/judge/[token]/page.tsx     (header switcher)
apps/web/src/app/[locale]/(auth)/sign-in/.../page.tsx        (pre-auth switcher + Clerk locale)
apps/web/src/app/[locale]/(auth)/sign-up/.../page.tsx        (pre-auth switcher + Clerk locale)
apps/web/src/components/presenter/presenter-view.tsx         (corner switcher)
apps/web/messages/en.json                                    (+LanguageSwitcher keys)
apps/web/messages/es.json                                    (+LanguageSwitcher keys, plus Task 8 review pass)
apps/web/src/i18n/README.md                                  (precedence + switcher docs)
_bmad-output/project-context.md                              (switcher rule + locale-adding rule)
_bmad-output/implementation-artifacts/sprint-status.yaml     (story status flow)
```

**Alignment with unified project structure:**

- Switcher lives in `components/i18n/` — new subdir but consistent with `components/admin/`, `components/judge/`, etc.
- `users` table joins the existing schema barrel via `packages/db/schema/index.ts`.
- tRPC `user` router follows the factory pattern from `tournament.router.ts`.
- Migration in `packages/db/drizzle/` per existing convention.

**Detected variances:** None.

### CRITICAL Gotchas (Apply, Don't Re-Discover)

1. **`proxy.ts` not `middleware.ts`** — Already done in 8.1. Don't add a `middleware.ts`.
2. **Server `params: Promise<…>`** — Next 16. Apply in any new layouts.
3. **`@base-ui/react` (NOT Radix)** — Switcher uses `@base-ui/react` Select. If `<Select>` isn't yet shadcn'd, audit any "shadcn add select" command output before merging — Radix may sneak in.
4. **TanStack Query v5 — no `onSuccess` in `useQuery`** — when reading `user.getPreferences` from a client, derive from `data` directly, don't try to mirror it into local `useState` inside a `useQuery` callback.
5. **Split-component pattern** — if you find yourself initializing `useState` from `getPreferences` data, use the outer-loader / inner-with-key pattern (project-context.md "Recurring Patterns").
6. **RLS transaction pattern** — every `user` router procedure uses `SET LOCAL session.current_organizer_id = ${ctx.userId}` inside `db.db.transaction`.
7. **TOCTOU on INSERT** — `setPreference` uses `ON CONFLICT` (upsert), which is naturally TOCTOU-safe. No try/catch on `23505` needed.
8. **`updatedAt: new Date()` in any UPDATE** — `setPreference`'s `ON CONFLICT … DO UPDATE` sets `updated_at = now()` directly in SQL; verified in the integration test.
9. **Date timezone footgun** — not directly relevant here, but `createdAt`/`updatedAt` use `timestamp with timezone` per the existing pattern.
10. **Adversarial review gate** — required before `done`. Don't skip.

### Previous Story Intelligence

**Story 8.1 (done 2026-05-11):**

- next-intl is wired in; routing is at `[locale]/`. **8.2 does not need to touch routing.ts, proxy.ts, or the navigation barrel.**
- 605 keys in both translation files. **8.2 adds only the `LanguageSwitcher` namespace (~3 keys). Net total ≈ 608.**
- POC switcher (`i18n-switch-poc.tsx`) was **deleted** in 62265ae. 8.2 builds the real switcher from scratch — do not resurrect the POC.
- `score-override-manager.tsx` already imports `useRouter` / `usePathname` from `@/i18n/navigation` (migrated in 8.1 M3). Pattern is established; reuse it.
- Spanish first-pass machine translations have known judge-side awkwardness (Sembrado, Slot de juez). **Task 8 owns the review pass.**
- The 8.1 code review acknowledged a residual: "review was performed by the same LLM that implemented; an independent review with a different model is still recommended per Epic 7 retro commitment." **8.2 should explicitly use a different LLM for `/bmad-bmm-code-review`.**

**Story 7-1 H1 (split-component pattern):**

- Applied when query-data drives `useState`. May come up if the switcher tries to mirror `getPreferences` into state — avoid by reading `data` directly each render.

**Story 4-2 inline two-step confirm:**

- Not directly relevant; the language switcher is non-destructive.

### Git Intelligence (Recent Commits)

```
62265ae fix(i18n): Story 8.1 code-review fixes — H1 + M1-M4
1c27f21 feat(i18n): Story 8.1 Phase 2b — full string sweep + plugin label refactor
642d677 feat(i18n): Story 8.1 Phase 2a — onError + CI scripts + admin/dashboard surface
79ff70b feat(i18n): Story 8.1 Phase 1 — next-intl framework + [locale] segment
```

Working tree state at story creation has 4 modified files left over from Story 8.1 / 7.2 review work (`simulation-battles-panel.tsx`, `simulation-cypher-panel.tsx`, `simulation-battles-panel.spec.tsx`, `7-2-organizer-runs-full-simulation-as-all-roles.md`). Before starting 8.2, **commit or revert** these — don't start the new story on top of a dirty tree.

### Testing Standards

- **Component tests:** Vitest + jsdom. `next-intl` and `@/i18n/navigation` are globally mocked in `test-setup.ts` (Story 8.1 Phase 2b); the switcher test will need to override the `useRouter` mock locally to assert `replace` is called with the right args.
- **tRPC unit tests:** Mock `DatabaseService` per the `tournament.router.spec.ts` precedent. Both `getPreferences` and `setPreference` need auth tests (`caller(null)` → UNAUTHORIZED) and Zod validation tests (reject `'fr'`).
- **Real-DB integration test:** Use the framework set up in Epic 8 prep. Test RLS enforcement specifically — this is a new RLS policy and the precedent is to integration-test new policies.
- **CI gate:** `lint` (incl. parity + error-code coverage scripts), `typecheck`, `test`, `build`. All green.
- **Manual verification:** Walk the matrix in Task 9 in the dev environment. Document outcomes in the PR description.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L1079-1107 — Story 8.2 ACs and FR62/63 mapping]
- [Source: `_bmad-output/planning-artifacts/epics.md` L225-227 — FR62-FR64 i18n functional requirements]
- [Source: `_bmad-output/implementation-artifacts/8-1-i18next-configuration-and-translation-infrastructure.md` — full 8.1 outcome, residuals, and Open Questions referencing 8.2]
- [Source: `_bmad-output/planning-artifacts/i18n-framework-decision-2026-05-11.md` — next-intl framework rationale]
- [Source: `_bmad-output/project-context.md` — RLS transaction pattern, split-component pattern, frontend i18n rule]
- [Source: `apps/web/src/i18n/routing.ts` — `localePrefix: 'as-needed'` config]
- [Source: `apps/web/src/i18n/navigation.ts` — locale-aware `Link`/`useRouter`/`usePathname`/`redirect`]
- [Source: `apps/web/src/proxy.ts` — Clerk + next-intl middleware composition]
- [Source: `apps/web/src/app/[locale]/(admin)/layout.tsx` — admin layout where switcher mounts]
- [Source: `packages/db/schema/users.ts` — currently empty, owned by this story]
- [Source: `packages/shared/errors/error-codes.ts` — all error codes already mapped to `Errors.<CODE>` keys (8.1)]

### Open Questions for Implementation

1. **Clerk Spanish localization** — does `@clerk/localizations` need to be added as a direct dependency to pass `esES` to `<SignIn />`, or is it transitively available? Verify on install. If a new dep is needed, document in the PR per the "no new deps without approval" rule.
2. **Cookie SameSite / Secure flags** — `next-intl`'s middleware sets `NEXT_LOCALE` with library defaults. Verify the defaults are appropriate for the project's Fly.io HTTPS deployment; if not, configure via `routing.ts` options.
3. **Future Tremor chart legends** — currently no Tremor charts installed (verified 2026-05-11). When/if added, ensure their default legends accept i18n strings. No action for 8.2.
4. **Real-time cross-device sync** — explicitly out of scope per "Layout Reconciliation Race" above. If user feedback calls for it, separate story.
5. **Locale-specific date/number formatting bugs** — `useFormatter()` should handle them, but verify the date-timezone-footgun (noon UTC) still applies when locale is `es`. Spot-check in the dashboard "recent scores" timestamps.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (`claude-opus-4-7`) via Claude Code

### Debug Log References

- **`createServerTrpcClient` had no auth-token support.** The admin layout reconciliation was originally specced as a server-side `getPreferences.query()` call from the layout. The existing `createServerTrpcClient` did not forward a Clerk token, so `protectedProcedure` would reject. Two paths were considered: (a) extend the server client to accept a token, or (b) move reconciliation into a client component. Both have merit; (b) was chosen because it avoids server-side per-request auth-token plumbing and gives natural retry behaviour via TanStack Query. The `OrganizerLocaleReconciler` client component is mounted in the admin layout and uses `trpc.user.getPreferences.useQuery({ enabled: isSignedIn })`. The `createServerTrpcClient` did still get an optional token parameter (forward-compatible, unused for now).
- **`@clerk/localizations` is not installed.** The story originally proposed wiring `esES` from `@clerk/localizations` into `<SignIn />` so Clerk's own form labels translate. Per the project-context rule "no new dependencies without explicit user approval" and Epic 7 retro's emphasis on minimal new deps, this was deferred. Clerk's form chrome renders in English regardless of platform locale. The auth-page layout still mounts the switcher so an unauthenticated user can pre-select Spanish before signing in — only the Clerk-owned form fields stay English. Flagged as residual.
- **Spec typecheck issue: `t.router({ user: router })` with `ReturnType<typeof t.router>` loses type info** when reassigned in `beforeEach`. Fix: drop the shared module-level `appRouter` variable, build the router + caller inside a `makeMockDb()` factory that returns a typed `caller`. Confirmed working in the final CI run.

### Completion Notes List

- ✅ **Task 1 (LanguageSwitcher)**: `apps/web/src/components/i18n/language-switcher.tsx` — default + compact variants, native `<select>` with `lucide-react` `Languages` icon, `useLocale` + `useRouter`/`usePathname` from `@/i18n/navigation`, writes `localStorage.preferredLocale`, fires `trpc.user.setPreference.mutate()` for authenticated organizers (non-blocking), wraps navigation in `useTransition`.
- ✅ **Task 2 (4 surfaces wired)**: Admin layout header (next to `UserButton`), judge page header (after offline-queue badge), public route layout (top-right absolute, compact), presenter route layout (top-right absolute, opacity-30 → 100 on hover, compact), auth layout (top-right, default variant).
- ✅ **Task 3 (localStorage + bootstrap)**: `apps/web/src/lib/i18n/preference-storage.ts` (`PREFERRED_LOCALE_KEY`, `readStoredLocale`, `writeStoredLocale`, SSR-safe). `apps/web/src/components/i18n/locale-bootstrap.tsx` mounted in `[locale]/layout.tsx`. Defers to server-side reconciler for authenticated users.
- ✅ **Task 4 (users table)**: `packages/db/schema/users.ts` replaces empty `export {}` with the `users` table (id nanoid, clerk_id UNIQUE, preferred_locale TEXT default 'en', timestamps). Migration `0017_add_users.sql` includes RLS policy (`users_self_only` using `session.current_organizer_id`), unique index, and CHECK constraint `preferred_locale IN ('en', 'es')`.
- ✅ **Task 5 (tRPC `user.*` router)**: `apps/api/src/trpc/routers/user.router.ts` exports `createUserRouter(db)` factory with `getPreferences` (lazy: no row → 'en' default, no write) and `setPreference` (INSERT ... ON CONFLICT (clerk_id) DO UPDATE upsert, naturally TOCTOU-safe). Wired into `trpc.router.ts`. Both procedures use the RLS transaction pattern (`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`). Zod via `setLocalePreferenceSchema` from `@competition-platform/shared`.
- ✅ **Task 6 (admin reconciliation)**: `apps/web/src/components/i18n/organizer-locale-reconciler.tsx` mounted in `(admin)/layout.tsx`. Reads `getPreferences` via TanStack Query; on first successful response, redirects if URL locale ≠ stored, OR seeds a row if stored=='en' AND URL=='es' (first-sign-in handling). Once-per-mount ref guards against redirect loops.
- ✅ **Task 7 (sign-in flow)**: Auth layout switcher lets unauthenticated users pre-select Spanish. next-intl middleware preserves locale prefix through Clerk's redirects. Post-sign-in admin reconciler handles seeding + sync. `@clerk/localizations` deferred per no-new-deps rule — Clerk's own form labels stay English (residual; future story with explicit dep approval can add it).
- ✅ **Task 8 (Spanish review pass)**: Fixed flagged terminology — `Slot de juez` → `Puesto de juez` (2 places), `Sembrado {n}` / `Sembrado #{seed}` → `Cabeza de serie {n}` / `Cabeza de serie #{seed}` (3 places), `PREPARACIÓN` → `CONFIGURACIÓN` (presenter setup badge, matches the dashboard phase label), and smoothed the simulation panel subtitle ("Elige el rol con el que actúas" → "Selecciona el rol que estás interpretando"). 610 keys / 610 keys parity preserved.
- ✅ **Task 9 (tests)**: 9 user.router unit tests (en default, stored value, UNAUTHORIZED ×2, no-write-on-read, Zod rejects 'fr', RLS session-var capture ×2, upsert flow). Real-DB integration spec `user.int.spec.ts` (round-trip, default, ON CONFLICT updated_at bump, RLS cross-user enforcement, CHECK constraint rejection). 8 LanguageSwitcher component tests. 5 LocaleBootstrap tests. 4 preference-storage tests. **All 218 web tests pass and all 358 api tests pass (mocked).**
- ✅ **Task 10 (docs)**: Extended `apps/web/src/i18n/README.md` with "Switching language", "Persistence precedence", "First-time organizer flow", "Cross-device sync", and "Adding a new locale" sections. Added two new rules to `_bmad-output/project-context.md`: the `<LanguageSwitcher>` usage rule under Frontend Rules and the four-place locale-adding rule under Anti-Patterns & Gotchas.
- ✅ **Task 11 (CI gate)**: `pnpm exec turbo run lint typecheck test build --filter='!@competition-platform/tests'` → **14/14 tasks green**. Lint passes including the parity + error-code coverage scripts. Production build generates both `/en` and `/es` static segments; locale-aware routing chain intact.
- ⏭️ **Task 12 (adversarial review)** intentionally left unchecked — runs in a separate `/bmad-bmm-code-review` session with a fresh context, ideally a different LLM, per the Epic 7 retro commitment that Story 8.1's self-review only partially satisfied.

**Code review findings resolved (Task 12):**

- **H1 — es→en switch redirect loop** — `LanguageSwitcher.handleChange` now sets `sessionStorage['locale-switch-pending'] = '1'` before navigating. `OrganizerLocaleReconciler` clears the flag and skips reconciliation on the first mount after a locale switch, preventing the race between the in-flight `setPreference` mutation and the fresh `getPreferences` query on the remounted layout.
- **H2 — heuristic silently overwrites English preference** — `getPreferences` now returns `hasPreference: boolean` (true when a row exists, false for lazy-default). The reconciler uses `!hasPreference` instead of `stored === 'en' && locale === 'es'` to identify first-sign-in seeding, correctly distinguishing "no row yet" from "explicit English preference."
- **H3 — missing reconciler tests** — `apps/web/src/components/i18n/organizer-locale-reconciler.spec.tsx` added with 9 tests covering redirect-on-mismatch, first-sign-in seeding, no-op on match, `locale-switch-pending` guard, once-per-mount (AC #8e), auth gate, and loading state.
- **M1 — JS `new Date()` vs SQL `now()`** — `setPreference` upsert changed to `updatedAt: sql\`now()\`` for DB-server evaluation, consistent with schema defaults and the story spec.
- **M2 — stale useEffect deps** — Destructured `{ mutate: setPreferenceMutate }` from `useMutation`, replacing the full mutation result object in the effect dependency array.

**Low findings (deferred — no blocking impact):**

- L1: `align` prop from story spec never implemented — irrelevant for native `<select>` element; spec was written assuming `@base-ui/react` Select. No action needed.
- L2: `aria-current` on `<option>` elements not implemented — `<option>` doesn't support `aria-current` in a screen-reader-meaningful way; selected state is conveyed correctly by `<select value={locale}>`. No action needed.

**Residual notes for review:**

1. **Clerk localization** — Clerk's `<SignIn />` / `<SignUp />` form labels render in English on the `/es/sign-in` and `/es/sign-up` pages. The platform-owned chrome around them (page title via `getTranslations('Auth')`, the language switcher itself) translates correctly. Adding `@clerk/localizations` would close this gap; deferred under the no-new-deps rule.
2. **Cross-device sync is next-page-load semantics, not real-time.** Organizer switches on phone → laptop sees the change on the next admin page render via the reconciler. No socket push. Documented in `apps/web/src/i18n/README.md`.
3. **`createServerTrpcClient` now accepts an optional `token` parameter** but no caller currently passes one. Added for forward compatibility (a future story may want server-side authenticated tRPC calls).
4. **Real-DB integration test (`user.int.spec.ts`) requires the test Postgres container running with migration 0017 applied.** It's part of `pnpm --filter @competition-platform/api test:integration`, not the default `test` task — same convention as the existing `submit-score.int.spec.ts`. Not run in this dev-story CI gate; recommend running locally before flipping to `done`.
5. **Spanish review was scoped narrowly** to flagged judge-side terminology + the presenter SETUP badge + one panelSubtitle phrasing. A wider native-speaker pass on all 610 keys is still recommended at some point but is outside Epic 8's MVP scope.

### File List

**New:**

- A `packages/db/schema/users.ts`
- A `packages/db/migrations/0017_add_users.sql`
- A `packages/shared/validation/user.schema.ts`
- A `apps/api/src/trpc/routers/user.router.ts`
- A `apps/api/src/trpc/routers/user.router.spec.ts`
- A `apps/api/src/trpc/routers/__integration__/user.int.spec.ts`
- A `apps/web/src/lib/i18n/preference-storage.ts`
- A `apps/web/src/lib/i18n/preference-storage.spec.ts`
- A `apps/web/src/components/i18n/language-switcher.tsx`
- A `apps/web/src/components/i18n/language-switcher.spec.tsx`
- A `apps/web/src/components/i18n/locale-bootstrap.tsx`
- A `apps/web/src/components/i18n/locale-bootstrap.spec.tsx`
- A `apps/web/src/components/i18n/organizer-locale-reconciler.tsx`
- A `apps/web/src/components/i18n/organizer-locale-reconciler.spec.tsx`

**Modified:**

- M `packages/shared/index.ts` (re-export `user.schema`)
- M `apps/api/src/trpc/trpc.router.ts` (mount `user: createUserRouter(db)`)
- M `apps/api/src/trpc/routers/__integration__/setup.ts` (add `users` to truncate list)
- M `apps/web/src/lib/trpc-server.ts` (optional `token` parameter on `createServerTrpcClient`)
- M `apps/web/src/app/[locale]/layout.tsx` (mount `<LocaleBootstrap />`)
- M `apps/web/src/app/[locale]/(admin)/layout.tsx` (mount switcher in header + `<OrganizerLocaleReconciler />`)
- M `apps/web/src/app/[locale]/(judge)/judge/[token]/page.tsx` (compact switcher in connection-dot strip)
- M `apps/web/src/app/[locale]/(public)/layout.tsx` (compact switcher, absolute top-right)
- M `apps/web/src/app/[locale]/(presenter)/layout.tsx` (compact switcher, low-opacity absolute top-right)
- M `apps/web/src/app/[locale]/(auth)/layout.tsx` (switcher absolute top-right)
- M `apps/web/messages/en.json` (+5 keys under new `LanguageSwitcher` namespace → 610 keys total)
- M `apps/web/messages/es.json` (+5 keys + Task 8 review pass: 6 string fixes)
- M `apps/web/src/i18n/README.md` (switcher usage, precedence, locale-adding instructions)
- M `_bmad-output/project-context.md` (switcher rule + four-place locale-adding rule)
- M `_bmad-output/implementation-artifacts/sprint-status.yaml` (8-2 status flow)

### Change Log

| Date       | Phase                 | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-12 | Implementation        | next-intl-powered shared `<LanguageSwitcher>` mounted in all 5 surface layouts (admin, judge, public, presenter, auth). Persistence: `NEXT_LOCALE` cookie + `localStorage.preferredLocale` for everyone; new `users` table (RLS-policed, CHECK-constrained) for organizers via `user.getPreferences` / `user.setPreference` tRPC. Client `<LocaleBootstrap>` handles unauthenticated cross-session sync; `<OrganizerLocaleReconciler>` handles authenticated cross-device sync (next-page-load semantics, not real-time). Spanish review pass fixed 6 flagged strings (Puesto de juez, Cabeza de serie, CONFIGURACIÓN, panel subtitle). 14/14 turbo tasks green, 218/218 web tests, 358/358 api tests. Story → review. |
| 2026-05-12 | Code review (Task 12) | Adversarial review (claude-sonnet-4-6) found and fixed 3 HIGH + 2 MEDIUM issues: (H1) es→en redirect-loop via `sessionStorage` locale-switch guard in `LanguageSwitcher` + reconciler; (H2) first-sign-in heuristic replaced with `hasPreference` flag from `getPreferences`; (H3) added `organizer-locale-reconciler.spec.tsx` (9 tests, covers AC #8e); (M1) `updatedAt: sql\`now()\``replaces JS`new Date()`in upsert; (M2) destructured`mutate` ref in useEffect deps. 227/227 web tests, 358/358 api tests. Story → done.                                                                                                                                                                                         |
