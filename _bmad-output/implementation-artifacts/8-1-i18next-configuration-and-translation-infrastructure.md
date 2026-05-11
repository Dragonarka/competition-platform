# Story 8.1: i18n Configuration & Translation Infrastructure

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a fully configured `next-intl` setup with all existing UI strings externalized into translation files,
so that the platform has a single, maintainable source of truth for all user-facing text in both Spanish and English.

## Acceptance Criteria

1. **Given** any user-facing string in the platform (button labels, error messages, status indicators, page titles), **when** it is rendered, **then** it is served from an i18n translation key — no hardcoded strings exist anywhere in `apps/web/src` (FR64).

2. **Given** the `en.json` and `es.json` translation files, **when** a new key is added to one but not the other, **then** a CI check (`pnpm exec turbo run lint`) fails with a clear message identifying the divergent keys.

3. **Given** an i18n key exists in code but has no translation entry, **when** the app renders that key, **then** the key name itself is displayed as a safe fallback (no crash) AND a console warning identifies the missing translation.

4. **Given** all structured error codes from `packages/shared/errors/error-codes.ts`, **when** they surface to users (via tRPC error responses), **then** they resolve through i18n keys (`errors.<CODE>`) — raw error code strings never appear in user-facing UI.

5. **Given** the i18n configuration, **when** the locale is changed at runtime (without a full page reload), **then** all currently rendered translation keys re-render in the new locale. (Story 8-2 builds the switcher UI; 8-1 must prove the runtime swap is possible with a minimal test harness.)

## Prerequisites

- **Epic 7 done** ✓ — all stories shipped, retro complete, working tree committed and pushed.
- **`(admin)/layout.tsx` Clerk async fix done** ✓ — applied as part of Epic 8 prep on 2026-05-11.
- **Real-DB integration test framework in place** ✓ — `apps/api/src/trpc/routers/__integration__/`. Not exercised by this story but available going forward.
- **`project-context.md` updated with deferred patterns** ✓ — recurring-patterns section added 2026-05-11.
- **i18n framework decision recorded** ✓ — see `_bmad-output/planning-artifacts/i18n-framework-decision-2026-05-11.md`. **Decision: `next-intl` v3 (or v4 if released and stable at story start).**

## Tasks / Subtasks

- [ ] Task 1: Install `next-intl` and verify Next 16 / React 19 compatibility (AC: #1, #5)
  - [ ] In `apps/web`: `pnpm add next-intl`. Pin to a specific minor version in `package.json` so future installs are reproducible.
  - [ ] Verify the package picks the right Next 16 entry point. Run `pnpm --filter @competition-platform/web dev` and load any page. Console should be clean.
  - [ ] **First new runtime dependency in 7 epics.** Per Epic 7 retro, this is the documented exception. Add a comment in `apps/web/package.json`'s dependency entry referencing the decision doc — or document inline in the PR description.
  - [ ] Verify `next-intl` works alongside `@clerk/nextjs@^7.3.2`. They are both Next App Router middleware contributors — load order matters.

- [ ] Task 2: Locale routing — choose strategy and apply (AC: #1, #5)
  - [ ] **Decision:** Use the `app/[locale]/...` segment approach (per decision doc Recommendation #1). This is the cleaner long-term option. Alternative (cookie-only) is faster to start but harder to reverse.
  - [ ] Restructure `apps/web/src/app/`:
    - Move `(admin)/`, `(judge)/`, `(presenter)/`, `(public)/`, `(auth)/` under `apps/web/src/app/[locale]/`.
    - Update `app/[locale]/layout.tsx` to consume `params: Promise<{ locale: string }>` and wrap children in `<NextIntlClientProvider locale={locale} messages={messages}>` after `await getMessages()`.
    - Add `apps/web/src/app/[locale]/page.tsx` redirect to `/[locale]/dashboard` if `dashboard` is the current default landing page.
    - **All existing `<Link href="...">` calls need locale-prefixed paths.** `next-intl` ships a `<Link>` shim that handles this automatically — replace `next/link` imports with `next-intl/link` (or whatever the v3/v4 API names it; verify on install).
  - [ ] Add `apps/web/src/i18n/routing.ts` (per `next-intl` convention):
    ```typescript
    import { defineRouting } from 'next-intl/routing';
    export const routing = defineRouting({
      locales: ['en', 'es'],
      defaultLocale: 'en',
      localePrefix: 'as-needed', // /en/... shown only if user explicitly visits it
    });
    ```
  - [ ] Update `apps/web/src/proxy.ts` (the Next.js 16 auth proxy — NOT `middleware.ts`) to:
    1. Detect locale from URL or cookie.
    2. Call Clerk auth on the resulting protected paths.
    3. Set the locale cookie if missing (default `en`).
  - [ ] **Big risk:** `proxy.ts` ordering. Verify that locale detection happens BEFORE Clerk redirects. Otherwise login redirects lose the locale prefix.

- [ ] Task 3: Translation file structure (AC: #1, #2)
  - [ ] **New folder** `apps/web/messages/` with:
    - `en.json` — initial English translations.
    - `es.json` — initial Spanish translations (machine-generated first pass acceptable; flag for human review in next story).
  - [ ] Choose namespace structure: **flat-nested by feature**. Top-level keys = feature area, second-level keys = specific string. Example:
    ```json
    {
      "Common": {
        "save": "Save",
        "cancel": "Cancel",
        "loading": "Loading..."
      },
      "Competitions": {
        "createNew": "New Competition",
        "createSimulation": "New Simulation",
        "list.title": "Competitions"
      },
      "Errors": {
        "PHASE_NOT_ACTIVE": "The competition is not in an active phase.",
        "SCORE_OUTSIDE_RANGE": "Score is outside the allowed range.",
        "ORGANIZER_SCORING_NOT_ENABLED": "Organizer scoring requires solo mode or simulation mode."
      }
    }
    ```
  - [ ] **Why flat-nested by feature, not per-file:** keeps the JSON files manageable while still scoping namespaces. `next-intl` supports nested keys via dot notation; the `Errors` namespace maps 1:1 to error codes.
  - [ ] **Story 8-1 scope: externalize EXISTING strings only.** Do not invent new strings. The Spanish file may have stubs (`"TODO: translate"` or English fallback) — flag clearly. Quality of Spanish translation is Story 8-2's review concern.
  - [ ] Configure `apps/web/src/i18n/request.ts` (per `next-intl` convention) to load `messages/${locale}.json` based on the resolved locale.

- [ ] Task 4: Externalize strings across `apps/web/src` (AC: #1)
  - [ ] **This is the biggest task by volume.** Systematic sweep of every `.tsx` file in `apps/web/src/`.
  - [ ] Pattern: replace `<span>Save</span>` with `<span>{t('Common.save')}</span>` (or `useTranslations('Common')` and `t('save')`).
  - [ ] **Server components** use `getTranslations()` — must be `async` if not already. Most of our server components already are.
  - [ ] **Client components** use `useTranslations()` hook.
  - [ ] **String inventory order** (largest-impact-first):
    1. Admin layout + nav (`apps/web/src/app/[locale]/(admin)/layout.tsx`).
    2. Competition card (`competition-card.tsx`) — repeated across dashboard.
    3. Create-competition form + simulation form variant.
    4. Dashboard panels (`dashboard-*.tsx`).
    5. Simulation panels (`simulation-*.tsx`) — including the PRACTICE MODE / SIMULATION badges.
    6. Score/vote panels (admin + judge).
    7. Public standings / bracket / presenter views.
    8. Auth pages (`(auth)/sign-in`, `(auth)/sign-up`).
    9. Error/loading/empty states across all of the above.
    10. Tooltip text, `aria-label` strings, placeholders.
  - [ ] **`alt=""`, `placeholder=""`, `aria-label=""`** all count as user-facing strings. Don't miss them.
  - [ ] **Date/time formatting** — wherever code uses `new Date(...).toLocaleString()` or `.toLocaleDateString()`, switch to `next-intl`'s `useFormatter()` hook for locale-aware formatting.

- [ ] Task 5: Error code mapping (AC: #4)
  - [ ] **New file** `packages/shared/errors/error-i18n-keys.ts`:
    ```typescript
    import { ErrorCodes } from './error-codes';
    export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
    export function errorCodeToI18nKey(code: ErrorCode): string {
      return `Errors.${code}`;
    }
    ```
  - [ ] On the client, the tRPC error handler reads `error.data?.cause?.errorCode` (existing convention from `error-codes.ts`) and renders `t(errorCodeToI18nKey(errorCode))`.
  - [ ] **`messages/en.json` Errors namespace** must contain a key for EVERY code in `ErrorCodes`. Stub: a script `apps/web/scripts/check-error-code-coverage.ts` that imports `ErrorCodes`, compares to `messages/en.json` Errors keys, exits non-zero if any are missing.
  - [ ] **Why a shared mapping helper, not inline string concat:** ensures one canonical place to look when an error code is renamed.

- [ ] Task 6: CI key-parity check (AC: #2)
  - [ ] **New file** `apps/web/scripts/check-i18n-parity.ts`:
    - Load `messages/en.json` and `messages/es.json`.
    - Flatten to dot-notation key sets.
    - Compare: keys present in en but not es → log + non-zero exit. Same for es → en.
    - Run via `tsx`: `pnpm tsx scripts/check-i18n-parity.ts`.
  - [ ] **Wire into `apps/web/package.json` `lint` script** so the existing `pnpm exec turbo run lint` command catches it: `"lint": "eslint && tsx scripts/check-i18n-parity.ts && tsx scripts/check-error-code-coverage.ts"`.
  - [ ] **Test that the check works.** Add a temporary key to `en.json` only, run lint, confirm it fails. Remove the key, confirm it passes. Document in the PR description.

- [ ] Task 7: Missing-key fallback + warning (AC: #3)
  - [ ] Configure `next-intl`'s `onError` and `getMessageFallback` in the provider:
    - `onError(error)`: if `error.code === 'MISSING_MESSAGE'`, `console.warn` with the key path. Otherwise rethrow.
    - `getMessageFallback({ namespace, key })`: return `${namespace}.${key}` (the key itself) as the fallback string.
  - [ ] Verify by removing one key from `es.json`, switching locale to `es`, rendering that component, and confirming both the warning fires AND the key string renders without crashing.

- [ ] Task 8: Format-plugin string ownership (AC: #1)
  - [ ] **Audit `packages/formats/cypher-battles/src/` for user-facing strings.** Components: `JudgeScoreInput`, `JudgeVoteInput`, etc.
  - [ ] **Refactor format-plugin components to receive ALL strings via props.** Example:
    ```tsx
    // BEFORE
    <button>Vote {playerName}</button>
    // AFTER
    <button>{labels.voteFor.replace('{name}', playerName)}</button>
    // Or use a prop function for ICU-style substitution.
    ```
  - [ ] **Why:** format plugins are pluggable, domain-agnostic, open-source modules (Day-1 architectural decision). They must not own translation files; the host platform supplies strings.
  - [ ] Update all call sites in `apps/web/src/` to pass the labels via translated props. Example: `<JudgeVoteInput labels={{ voteFor: t('Judge.voteFor'), tie: t('Judge.tie'), ... }} ... />`.
  - [ ] **Story 8-1 scope:** only Cypher-Battles format plugin. Future format plugins follow the established prop API.

- [ ] Task 9: Runtime switching proof-of-concept (AC: #5)
  - [ ] Story 8-2 builds the language switcher UI. Story 8-1 must prove the swap WORKS via a minimal test harness.
  - [ ] **New file** `apps/web/src/components/dev/i18n-switch-poc.tsx` (`'use client'`, NOT a production component):
    - Two buttons: "EN" and "ES".
    - Calls `useRouter` and `useLocale` from `next-intl` (or `next/navigation` with locale prefix swap).
    - Switches locale, verifies all currently visible strings re-render without page reload.
  - [ ] Render this component temporarily in the dashboard during development. **Remove before merge.** Acceptance: confirmed working, then deleted.
  - [ ] If runtime switching does NOT work cleanly (e.g., requires a full reload), this is a HARD STOP — `next-intl` decision needs revisiting. Document the failure mode and surface to the user before continuing.

- [ ] Task 10: Tests (AC: #1, #2, #3, #4)
  - [ ] **Unit tests** in `apps/web/src/lib/i18n/*.spec.ts`:
    1. `errorCodeToI18nKey('PHASE_NOT_ACTIVE')` returns `'Errors.PHASE_NOT_ACTIVE'`.
    2. Every `ErrorCode` has a corresponding key in `messages/en.json` Errors namespace.
    3. `messages/en.json` and `messages/es.json` have identical key structures.
  - [ ] **Component tests** for at least 3 representative components verifying:
    - Translation lookup works (mock `next-intl` provider with a test message set).
    - Missing-key fallback renders the key path, not a crash.
  - [ ] **No new E2E tests** — locale switching is exercised manually via the POC component and via Story 8-2's switcher.

- [ ] Task 11: Documentation
  - [ ] Add an `apps/web/src/i18n/README.md` covering:
    - Where to add new strings (which JSON file, which namespace).
    - How `useTranslations()` vs. `getTranslations()` differ.
    - How to run the parity check.
    - How to test missing-key fallback.
  - [ ] Update `project-context.md` "Frontend Rules" section with one line about i18n key conventions (do not hardcode strings; use the established namespace structure; route through `Errors.<CODE>` for error codes).

- [ ] Task 12: CI gate verification
  - [ ] `pnpm exec turbo run lint typecheck test build --filter='!@competition-platform/tests'` — must be green.
  - [ ] Specifically verify `lint` catches the key-parity check by adding a deliberately diverging key in a separate commit, confirming CI fails, then removing it.
  - [ ] Verify `build` produces a working production bundle that includes both locales' messages.

## Dev Notes

### Why `next-intl` (not `next-i18next`, not raw `react-i18next`)

See `_bmad-output/planning-artifacts/i18n-framework-decision-2026-05-11.md` for the full rationale. TL;DR: `next-intl` is the only library actively maintained for Next.js 16 App Router + React 19, with first-class RSC support, type-safe keys, and runtime switching. `next-i18next` is officially deprecated for App Router. `react-i18next` raw works but requires reinventing the Next.js integration.

### Locale Routing — Why `app/[locale]/...` Over Cookie-Only

Three options were considered (see decision doc):

1. **`app/[locale]/...` segment** ✓ — every route nests under `[locale]`. Clean, explicit, server-readable on first paint. **Chosen.**
2. **Flat routes with cookie** — keep current structure, derive locale from a cookie. Less disruptive but RSC must read the cookie to pick the right locale; one extra source of truth.
3. **`Accept-Language` header** — auto-detect from browser. Bad UX (users in non-English locales often prefer English UIs); rejected.

The segment approach has a one-time migration cost (move all routes under `[locale]`, update all `<Link>` imports). Mechanical work; well-suited to a dev agent.

### Error Code Mapping Discipline

Every code in `ErrorCodes` MUST have a translation key. The CI check (`check-error-code-coverage.ts`) enforces this. When Story 8-N adds a new error code:

1. Add to `packages/shared/errors/error-codes.ts`.
2. Add `Errors.<NEW_CODE>` to BOTH `en.json` AND `es.json`.
3. CI fails until both are present.

This makes new error codes a tiny extra ceremony, prevents the "raw code leaks to the user" class of bug forever.

### Format Plugin String Ownership Resolution

The format-plugin architecture from Day 1 says: "Competition formats are pluggable, domain-agnostic, open-source modules with custom UI." (See user memory.) This story finally answers the implicit question of "where do their strings come from?"

**Answer: from the host platform, via props.**

Format plugins are libraries. Libraries don't own user-facing strings — applications do. The cypher-battles plugin exports React components with a `labels` prop (or per-string props); the host passes translated strings. This keeps the plugin domain-agnostic and lets the host control voice/tone consistently.

Story 8-1 retrofits this for the one existing plugin (`cypher-battles`). Future plugins follow the established prop API.

### Translation Quality Strategy

Story 8-1 ships translations that are "good enough to ship to a non-Spanish-speaking team for review." That means:

- Machine-translated (DeepL or Claude) first pass for `es.json`.
- Explicit `// TODO: human-review` comments in code where the translation feels uncertain (e.g., domain-specific terms like "cypher," "battles," "advancement threshold" may not have idiomatic Spanish equivalents).
- Story 8-2 (or a follow-up story) handles human review by a Spanish speaker. Do NOT block 8-1 on translation quality — block on infrastructure correctness.

Spanish locale variant choice: **use `es` generically for now.** Don't pick `es-ES` / `es-MX` / `es-AR` unless there's a specific reason — the differences are mostly idiomatic and the project's audience isn't yet defined. Revisit when there's actual user feedback.

### Date/Time Formatting

Project-context.md flags the date-timezone footgun (Story 2-1 fix). Story 8-1 must preserve that fix when migrating to `next-intl`'s formatter. The `noon-UTC` trick (`${date}T12:00:00.000Z`) still applies. `next-intl`'s `useFormatter()` is locale-aware but doesn't change the underlying timezone handling.

### Translation File Size Estimate

Rough count of user-facing strings in `apps/web/src/` based on inspection:

- Admin layout + nav: ~10
- Competition card / list / forms: ~40
- Dashboard panels: ~30
- Simulation panels: ~25 (Epic 7 added these)
- Score/vote panels: ~20
- Public views: ~15
- Presenter view: ~10
- Auth pages: ~5
- Errors (all `ErrorCodes`): ~30
- Status messages, tooltips, aria-labels: ~30

Total estimate: ~215 keys. Each file probably 5-8KB minified. Bundle impact negligible.

### Project Structure Notes

**New files:**

```
apps/web/src/app/[locale]/                                  (NEW — wraps all existing routes)
apps/web/src/i18n/routing.ts                                (locale routing config)
apps/web/src/i18n/request.ts                                (server-side message loader)
apps/web/src/i18n/README.md                                 (developer docs)
apps/web/messages/en.json                                   (English translations)
apps/web/messages/es.json                                   (Spanish translations)
apps/web/scripts/check-i18n-parity.ts                       (CI key-parity check)
apps/web/scripts/check-error-code-coverage.ts               (error code → key coverage check)
packages/shared/errors/error-i18n-keys.ts                   (error code → i18n key mapper)
apps/web/src/lib/i18n/error-mapping.spec.ts                 (unit test for error mapping)
apps/web/src/lib/i18n/parity.spec.ts                        (test that the parity check works)
```

**Modified files (high-impact, NOT exhaustive — full sweep in Task 4):**

```
apps/web/package.json                                       (add next-intl dependency)
apps/web/src/app/layout.tsx                                 (NextIntlClientProvider wrapper)
apps/web/src/app/(admin)/*                                  (moved under [locale]/)
apps/web/src/app/(judge)/*                                  (moved under [locale]/)
apps/web/src/app/(presenter)/*                              (moved under [locale]/)
apps/web/src/app/(public)/*                                 (moved under [locale]/)
apps/web/src/app/(auth)/*                                   (moved under [locale]/)
apps/web/src/proxy.ts                                       (locale detection added before Clerk)
apps/web/src/components/**/*.tsx                            (all components with hardcoded strings)
packages/shared/errors/error-codes.ts                       (no change — but every code must have an i18n key)
packages/shared/index.ts                                    (re-export error-i18n-keys)
packages/formats/cypher-battles/src/**/*.tsx                (accept labels via props)
_bmad-output/project-context.md                             (add i18n rules to Frontend Rules section)
_bmad-output/implementation-artifacts/sprint-status.yaml    (story status flow)
```

**Alignment with unified project structure:**

- The `[locale]` segment is a Next.js App Router convention — fits naturally.
- The `messages/` folder at `apps/web/messages/` is the `next-intl` default location.
- Scripts go in `apps/web/scripts/` (existing pattern from CI work).
- Shared error mappings stay in `packages/shared/errors/` next to `error-codes.ts`.

**Detected variances:** None.

### CRITICAL Gotchas (From project-context.md — Apply, Don't Re-Discover)

1. **`proxy.ts` not `middleware.ts`** — Next 16 convention. Locale detection MUST go here, BEFORE Clerk auth runs. If locale-prefix routing breaks Clerk redirects, that's the bug.
2. **Server params are Promise** — Next 16. `params: Promise<{ locale: string }>; const { locale } = await params;`.
3. **`@base-ui/react` (NOT Radix)** — `next-intl` is component-agnostic, should "just work." Verify by translating one component in Task 4.
4. **No `setState` in render** — split-component pattern if needed when query data drives state. Unlikely to be hit by i18n work, but worth keeping in mind for the language switcher (Story 8-2).
5. **TanStack Query v5 query data invalidation** — locale change should NOT require invalidating server queries; messages are loaded fresh on the next render cycle by `next-intl`.
6. **Adversarial review gate must run** — Story 8-1 is the first story after Epic 7 retro's commitment to reinstate the review gate. Plan for `/bmad-bmm-code-review` after `dev-story`.

### Previous Story Intelligence

**Epic 7 retro (2026-05-11):**

- 5 of 9 Epic 6 retro commitments were broken. The adversarial review gate was held for only 1 of 3 Epic 7 stories. **Story 8-1 must restore the gate** — no `done` without `/bmad-bmm-code-review`.
- Real-DB integration test framework was built as Epic 8 prep (2026-05-11). Story 8-1 doesn't directly use it but the framework is available.
- Project-context.md was updated with recurring patterns (idempotency stack, socket-event checklist, SSR pattern, split-component pattern, etc.) on 2026-05-11. Story 8-1 should reference these rather than re-derive.

**Story 7-3 (done 2026-05-11):**

- Inline two-step confirm pattern for destructive UX — referenced in the Recurring Patterns section. Apply if Story 8-1 needs any destructive flows (it shouldn't — i18n is purely additive).
- Append-only events held under destruction — referenced. Doesn't apply directly to 8-1.

**Story 7-1 H1 fix (split-component pattern):**

- Apply if Story 8-1 needs query-data-driven `useState`. Language switcher in Story 8-2 might hit this.

### Git Intelligence (Recent Commits)

```
4d09253 chore: checkpoint Stories 7.2-7.3 + Epic 7 retro
bf69cb8 chore: checkpoint Story 7.1 simulation competitions + Epic 6 retro
f98b56c chore: checkpoint Epic 6 — public standings, bracket view, presenter mode
```

Epic 7 is committed and pushed. Working tree is clean. Story 8-1 starts from a known-good state.

### Testing Standards

- **Component tests:** Vitest + jsdom. Mock `NextIntlClientProvider` with a test message set; render the component; assert translated strings appear.
- **Unit tests:** Pure functions in `error-mapping.spec.ts` and `parity.spec.ts` — no Next.js runtime needed.
- **CI gate:** lint (now includes parity check + error-code coverage check), typecheck, test, build. All must be green.
- **Manual verification:** Switch locale in the dev environment via the POC component (Task 9). Confirm every page renders correctly in both locales. **REMOVE the POC component before merge.**

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L1049-1077 — Story 8.1 ACs and FR mapping]
- [Source: `_bmad-output/planning-artifacts/epics.md` L73-77 — FR62-FR64 i18n requirements]
- [Source: `_bmad-output/planning-artifacts/i18n-framework-decision-2026-05-11.md` — full framework rationale]
- [Source: `_bmad-output/implementation-artifacts/epic-7-retro-2026-05-11.md` — review gate commitment]
- [Source: `_bmad-output/project-context.md` — Recurring Patterns (added 2026-05-11)]
- [Source: `packages/shared/errors/error-codes.ts` — all codes that need translations]
- [Source: `apps/web/src/app/(admin)/layout.tsx` — Clerk async fix landed 2026-05-11 as prep]
- [Source: `apps/web/src/proxy.ts` — current proxy structure to extend]

### Open Questions for Implementation

1. **`next-intl` v3 vs v4?** v4 may be in beta or stable depending on timing. Default to v3 stable unless v4 has a clear-cut advantage (e.g., simpler API for runtime switching).
2. **Spanish locale variant** — defaulting to plain `es`. Confirm acceptable, or switch to `es-419` (Latin America), `es-MX`, or `es-ES` based on actual user geography. **No-op for Story 8-1** if defaulting; revisit for Story 8-2 review.
3. **POC component for runtime switching** — delete before merge. Confirm during code review that it's gone.
4. **Tremor charts** — not currently installed (verified 2026-05-11). The decision doc mentions Tremor as a future concern. **Skip for 8-1.**
5. **Authenticated user language preference table** — there is currently NO `users` table in `packages/db/schema/users.ts` (empty file). Story 8-2 needs to add one (or a separate `user_preferences` table) for organizer language storage. **Out of scope for 8-1**, but flag in 8-2 spec.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
