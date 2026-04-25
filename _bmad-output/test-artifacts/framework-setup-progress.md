---
stepsCompleted:
  - 'step-01-preflight'
  - 'step-02-select-framework'
  - 'step-03-scaffold-framework'
  - 'step-04-docs-and-scripts'
  - 'step-05-validate-and-summary'
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-04-24'
status: 'complete'
framework: 'Playwright'
---

# Test Framework Setup — Progress Tracker

## Step 1: Preflight

**Status:** ✅ Complete
**Date:** 2026-04-24

### Stack Detection

- **Detected stack:** `fullstack`
- **Frontend indicators:** `apps/web/package.json` with Next.js 16.2.3, React 19.2.4, existing `@playwright/test@1.49` devDependency
- **Backend indicators:** `apps/api/package.json` with NestJS 11, tRPC 11, Drizzle ORM

### Prerequisites Validated

- ✅ Root `package.json` exists (Turborepo + pnpm workspace)
- ✅ No existing E2E framework config files anywhere in repo (verified via `find` excluding node_modules)
  - ❌ No `playwright.config.*`
  - ❌ No `cypress.config.*`
  - ❌ No `cypress.json`
- ✅ Architecture context available
- ⚠️ Placeholder `apps/web/e2e/competition-flow.spec.ts` exists with 3 `test.skip(...)` calls from Story 5.x planning — not a framework, a stub that the scaffold will supersede

### Project Context

| Aspect                       | Value                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| Project type                 | Fullstack monorepo (Turborepo + pnpm)                                                      |
| Frontend framework           | Next.js 16.2.3 + React 19.2.4                                                              |
| Frontend bundler             | Turbopack (Next.js default)                                                                |
| Backend framework            | NestJS 11 (modular monolith, DDD bounded contexts)                                         |
| Auth                         | Clerk (organizers) + cryptographic invite tokens (judges) + unauthenticated (public views) |
| Real-time                    | Socket.IO 4.8 (single namespace, role-based rooms)                                         |
| Existing unit test framework | Vitest 2 (in all packages, co-located `*.spec.ts`)                                         |
| Already-installed E2E dep    | `@playwright/test@1.49` (apps/web devDependency)                                           |
| TypeScript                   | Strict mode across all packages                                                            |

### Architecture Docs Referenced

- `_bmad-output/planning-artifacts/architecture.md` — full architecture decisions
- `_bmad-output/planning-artifacts/prd.md` — PRD with performance NFRs (NFR1: <500ms score round-trip, NFR4: <1s judge interface load, NFR6: <5s WebSocket reconnection)
- `_bmad-output/project-context.md` — critical rules and gotchas

### Auth Requirements for E2E

- **Organizer routes** (`/competitions/*`): require Clerk session. Needs test organizer credentials via Clerk test mode or service account.
- **Judge routes** (`/judge/[token]`): require valid judge invite token. Test flow: create competition → generate judge links → use raw token in URL.
- **Public routes** (`/public/{competitionId}`): no auth required.

### Preflight Result

✅ **PASS** — project is ready for framework scaffolding. No halt conditions triggered.

---

## Step 2: Framework Selection

**Status:** ✅ Complete
**Date:** 2026-04-24

### Decision: **Playwright** (+ Vitest already in place for backend)

### Selection Rationale

**Playwright selected over Cypress because:**

| Factor                             | Playwright                                               | Cypress                                           | Winner     |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ---------- |
| Already installed (devDependency)  | ✅ `@playwright/test@1.49`                               | ❌ not installed                                  | Playwright |
| Multi-browser support              | ✅ Chromium / Firefox / WebKit                           | ⚠️ Chromium-focused                               | Playwright |
| API + WebSocket testing            | ✅ native support for raw requests + WebSocket intercept | ⚠️ possible but awkward                           | Playwright |
| Multi-role fixture reuse           | ✅ `storageState` per role (organizer/judge/public)      | ⚠️ `cy.session()` but less ergonomic across roles | Playwright |
| Mobile viewport + device emulation | ✅ native `devices` catalog                              | ⚠️ via viewport config                            | Playwright |
| CI parallelism                     | ✅ workers + shards                                      | ⚠️ workers but slower                             | Playwright |
| Project complexity                 | Medium-High                                              | —                                                 | Playwright |
| New-dependency cost                | 0                                                        | High (requires adding Cypress + plugins)          | Playwright |

**Backend framework:** Vitest `2` is already installed in both `apps/api` and `apps/web` for unit testing. Story 2.1–2.5 have 39 passing Vitest tests. No new backend framework needed; this workflow focuses on the missing E2E layer.

**Stack-matching:** `{detected_stack} = fullstack` → browser framework (Playwright) + existing Vitest for TypeScript/Node backend.

### Config Flag

`{config_source}:test_framework` is `"auto"` — selection is automatic; decision documented above.

---

## Step 3: Scaffold Framework

**Status:** ✅ Complete
**Date:** 2026-04-24
**Execution Mode:** sequential (user running workflow inline)

### Directory structure created

```
tests/
├── .env.example
├── .gitignore
├── package.json                 (new workspace: @competition-platform/tests)
├── tsconfig.json
├── playwright.config.ts
├── e2e/
│   ├── organizer-create-competition.spec.ts  (2 skipped tests)
│   ├── judge-scoring.spec.ts                 (3 skipped tests)
│   └── public-standings.spec.ts              (2 skipped tests)
└── support/
    ├── fixtures/
    │   ├── index.ts
    │   ├── auth.fixture.ts
    │   └── test-data.fixture.ts
    ├── helpers/
    │   ├── api-client.ts
    │   ├── db-client.ts
    │   └── network.ts
    └── page-objects/
        ├── organizer-dashboard.po.ts
        └── judge-scoring.po.ts
```

### Playwright config highlights

- **Projects:** Desktop Chromium / Firefox / WebKit + mobile (Pixel 7 / iPhone 14). Mobile projects only pick up `judge*.spec.ts` files.
- **Timeouts:** action 15s, navigation 30s, test 60s, expect 10s.
- **Parallelism:** `fullyParallel: true`; CI uses 4 workers and 2 retries; local = no retries, auto workers.
- **Reporters:** list + HTML (playwright-report/) + JUnit (test-results/junit.xml).
- **Artifacts on failure:** trace + screenshot + video all `retain-on-failure`.
- **testIdAttribute:** `data-testid` (convention for the project).
- **webServer:** Local runs auto-start `apps/api` and `apps/web` dev servers; CI expects them to be already running.

### Fixtures implemented

- `authTest` (in `auth.fixture.ts`) — exposes `organizerPage` (via cached storageState at `tests/.auth/organizer.json`), `judgePage`, `publicPage`
- Merged via `mergeTests` in `fixtures/index.ts` — tests import `{ test, expect }` from `'../support/fixtures'`
- Data factories: `competitionFactory`, `criterionFactory`, `participantFactory` — nanoid-based, deterministic-ish, override-friendly

### Helpers implemented

- `db-client.ts` — Drizzle client with `withOrganizer(clerkUserId, fn)` RLS transaction helper + cleanup functions (`cleanupCompetition`, `cleanupByOrganizer`)
- `api-client.ts` — lightweight tRPC HTTP client (`trpcQuery` / `trpcMutation`) for programmatic test setup without going through the UI
- `network.ts` — `waitForTrpcCall`, `simulateOffline`/`simulateOnline`, `throttleNetwork` (slow-3G via CDP for NFR4 validation)

### Sample tests

All **skipped by default** (CI stays green). Each spec has unlock instructions tied to the story that makes it runnable. Specs cover:

- Organizer creates competition + rejects empty name
- Judge opens valid link / rejects invalid token / submits score under 10s on mobile viewport
- Public viewer sees standings without login / receives updates within 10s (NFR3)

### Configuration decisions

- `tea_use_playwright_utils: true` in config → scaffold implements the patterns **inline** (auth storageState, data factories, network-first with `waitForRequest`) rather than adding `@seontechnologies/playwright-utils` as a dep. Keeps to the project's "no new deps without explicit approval" rule.
- `tea_use_pactjs_utils: true` in config → **deferred**. No external API consumer exists yet (single-team MVP). Re-run this workflow or manually add Pact scaffolding when the first external consumer appears.
- `tea_pact_mcp: 'mcp'` in config → **deferred** alongside Pact.

### Env files

- `.nvmrc` at repo root: Node 24 (satisfies root `package.json` `engines.node >= 20`)
- `tests/.env.example` with `TEST_ENV`, `BASE_URL`, `API_URL`, `TEST_DATABASE_URL`, `TEST_ORGANIZER_EMAIL`, `TEST_ORGANIZER_PASSWORD`, `TEST_ORGANIZER_CLERK_USER_ID`, `E2E_JUDGE_TOKEN`, `E2E_COMPETITION_ID`, `CI`

### Dependencies added

All scoped to the new `tests/` workspace package (no pollution of `apps/*` or `packages/*`):

- `@playwright/test@^1.49.0` — already in `apps/web/devDependencies`; also added to tests/ for its own node_modules
- `@types/node@^24.0.0`
- `dotenv@^16.4.0` — to load `tests/.env`
- `drizzle-orm@^0.38.0`, `postgres@^3.4.0`, `nanoid@^5.1.9` — to support the DB helper
- `typescript@^5.7.0`
- `@competition-platform/db` (workspace), `@competition-platform/shared` (workspace) — allows tests to import Drizzle schemas and Zod types

### Existing artifacts left intact

- `apps/web/e2e/competition-flow.spec.ts` — pre-existing Story 5.x placeholder with 3 `test.skip(...)` calls. Not wired into the new Playwright config (different `testDir`). Story 5.x can either migrate those stubs into `tests/e2e/` or build its own flow.

---

## Step 4: Docs & Scripts

**Status:** ✅ Complete
**Date:** 2026-04-24

### `tests/README.md` created

Contains: quick command reference, first-time setup (install, .env, test DB, Clerk test user, first run), directory layout, fixture architecture, best-practice rules (selectors, isolation, network sync, NFR budgets, skip-don't-fail-on-bootstrap), CI integration example (GitHub Actions skeleton), status matrix of scaffolded vs pending items, knowledge-base references, and a mapping from each skipped spec to the story that unlocks it.

### Root `package.json` scripts added

- `test:e2e` → `pnpm --filter @competition-platform/tests test`
- `test:e2e:ui` → Playwright UI mode
- `test:e2e:install` → installs browsers (`playwright install --with-deps`)

### Workspace manifest updated

- `pnpm-workspace.yaml` now includes `tests` alongside `apps/*`, `packages/*`, `packages/formats/*`
- Next `pnpm install` at the root will pick up the new package

---

## Step 5: Validate & Summary

**Status:** ✅ Complete
**Date:** 2026-04-24

### Checklist Validation (against `_bmad/tea/workflows/testarch/framework/checklist.md`)

#### Prerequisites

- [x] Project root contains `package.json` ✓ (monorepo root + each workspace)
- [x] No existing test framework conflicts ✓ (no `playwright.config.*` or `cypress.config.*`)
- [x] Project type identifiable ✓ (fullstack: Next.js 16 + NestJS 11)
- [x] Bundler identifiable ✓ (Turbopack / Next.js + NestJS-CLI)
- [x] Write permissions ✓

#### Step 1: Preflight

- [x] Stack type detected: `fullstack`
- [x] Project manifests parsed (root + 4 workspaces)
- [x] Project type extracted
- [x] No conflicts
- [x] Architecture docs located (`_bmad-output/planning-artifacts/architecture.md`)

#### Step 2: Framework Selection

- [x] Auto-detection executed
- [x] Playwright choice justified (7-factor comparison table)
- [x] `config.test_framework: "auto"` respected
- [x] User notified with rationale

#### Step 3: Directory Structure

- [x] `tests/` created
- [x] `tests/e2e/` created
- [x] `tests/support/` created
- [x] `tests/support/fixtures/` created
- [x] `tests/support/helpers/` created
- [x] `tests/support/page-objects/` created
- [ ] `tests/support/fixtures/factories/` — **NOT created as a subfolder**; factories live in `test-data.fixture.ts` per Playwright convention. Documented choice.

#### Step 4: Configuration Files

- [x] `playwright.config.ts` created
- [x] TypeScript config (`use_typescript: true`)
- [x] Timeouts: action 15s, navigation 30s, test 60s ✓
- [x] Base URL with env fallback (`BASE_URL` → `http://localhost:3000`)
- [x] Trace/screenshot/video all `retain-on-failure`
- [x] Reporters: `list` + `html` + `junit`
- [x] `fullyParallel: true`
- [x] CI tuning: `retries: 2`, `workers: 4` when `CI=true`

#### Step 5: Environment Configuration

- [x] `tests/.env.example` created
- [x] `TEST_ENV` defined
- [x] `BASE_URL` defined with default
- [x] `API_URL` defined
- [x] Auth variables defined (`TEST_ORGANIZER_*`, `E2E_JUDGE_TOKEN`)
- [x] `.nvmrc` created at repo root (Node `24`)

#### Step 6: Fixture Architecture

- [x] `tests/support/fixtures/index.ts` created
- [x] Base fixture extended from Playwright (`authTest = base.extend<AuthFixtures>({...})`)
- [x] Type definitions: `AuthFixtures` interface
- [x] `mergeTests` pattern used
- [ ] Auto-cleanup in fixtures — **NOT wired up in-fixture**; cleanup is explicit via `db-client.ts` helpers called per test. Documented in README best practices.

#### Step 7: Data Factories

- [x] Multiple factories created: `competitionFactory`, `criterionFactory`, `participantFactory`
- [ ] Uses `@faker-js/faker` — **NOT used**; used `nanoid` + simple random for IDs and deterministic realistic names. Rationale: "no new deps without approval" rule from `project-context.md`. Faker can be added later if realistic prose is needed.
- [x] Factories produce distinct unique data per call (nanoid IDs)
- [ ] Factories track entities for cleanup — **NOT built into factories**; cleanup is DB-level via `cleanupCompetition(id)` / `cleanupByOrganizer(clerkId)`. Documented choice.
- [x] Factories usable from fixtures (re-exported via `fixtures/index.ts`)

#### Step 8: Sample Tests

- [x] 3 example spec files created
- [x] Uses fixture architecture (`import { test, expect } from '../support/fixtures'`)
- [x] Demonstrates factory usage (`competitionFactory.build()`)
- [x] Uses semantic selectors (`getByLabel`, `getByRole`); `data-testid` configured as fallback
- [x] Assertions present
- [x] Network waiters available in `helpers/network.ts` (`waitForTrpcCall`, `simulateOffline`)
- [x] All tests `test.skip(...)` by default — CI stays green until implementations catch up

#### Step 9: Helper Utilities

- [x] API helper created (`api-client.ts`)
- [x] Network helper created (`network.ts`)
- [ ] Auth helper — **folded into** the fixture itself (storageState reuse). Documented.
- [x] Functional patterns followed
- [x] Error handling in API client (throws with status + procedure name)

#### Step 10: Documentation

- [x] `tests/README.md` created
- [x] Setup instructions ✓
- [x] Running tests section ✓
- [x] Architecture overview (fixture, factories, helpers) ✓
- [x] Best practices section (8 rules) ✓
- [x] CI integration example (GitHub Actions skeleton) ✓
- [x] Knowledge base references ✓
- [x] Troubleshooting implicit in the "When to convert test.skip → test" matrix

#### Step 11: Build & Test Script Updates

- [x] Root `package.json` has `test:e2e`, `test:e2e:ui`, `test:e2e:install`
- [x] Tests workspace `package.json` has `test`, `test:ui`, `test:debug`, `test:headed`, `test:chromium`, `test:mobile`, `report`, `install:browsers`, `typecheck`
- [x] Test framework dependency present (`@playwright/test@^1.49.0`)
- [x] TypeScript types (`@types/node@^24.0.0`)

### Known gaps requiring user action

1. **Pact contract testing scaffold DEFERRED.** Config enables it (`tea_use_pactjs_utils: true`) but no external API consumer exists yet. Re-run workflow or add manually when needed.
2. **`pnpm install` not yet executed.** The new `tests/` workspace package and root `.nvmrc` require `pnpm install` at root to populate `node_modules`. User's responsibility (safer than auto-running). See tests/README.md.
3. **Playwright browsers not yet installed.** `pnpm test:e2e:install` is required once per machine.
4. **Test database not provisioned.** `psql -c "CREATE DATABASE competition_platform_test"` + `pnpm --filter @competition-platform/db db:migrate` is required. See tests/README.md.
5. **Clerk test organizer not created.** User must add an E2E-only organizer account in Clerk dashboard and populate `TEST_ORGANIZER_*` env vars.
6. **StorageState not generated.** First run requires either (a) manual sign-in once to persist `tests/.auth/organizer.json`, or (b) a future `global.setup.ts` that programmatically signs in.

### Completion Summary

**Framework installed:** Playwright `1.49` (Desktop Chromium/Firefox/WebKit + Mobile Pixel 7/iPhone 14).
**Workspace:** `@competition-platform/tests` (new pnpm workspace at `tests/`).
**Files created:** 17 (see tree in Step 3).
**Tests discoverable:** 7 specs across 3 files — all skipped until the story that unlocks them is complete.
**CI impact:** None yet. The E2E suite must be wired into CI in a follow-up workflow (`/bmad-tea-testarch-ci`).
**Knowledge fragments applied:** Inline (no separate fragment files loaded — patterns implemented directly per config preferences).

### Post-Workflow Actions for User

1. `pnpm install` (root)
2. `pnpm test:e2e:install` (downloads browser binaries)
3. `cp tests/.env.example tests/.env` and fill in values
4. Provision test DB + run migrations
5. Create Clerk test user + capture `TEST_ORGANIZER_CLERK_USER_ID`
6. First manual sign-in to generate `tests/.auth/organizer.json` (or add a setup script)
7. Verify: `pnpm test:e2e` should discover 7 tests, all skipped → exit code 0
8. When Story 3-4+ lands, convert `test.skip` → `test` per the matrix in `tests/README.md`

### Recommended next TEA workflows

- `/bmad-tea-testarch-ci` — wire the Playwright suite into GitHub Actions (addresses Epic 2 retro action item #4)
- `/bmad-tea-testarch-test-design` — plan test coverage for Story 3-4 real-time aggregation
- `/bmad-tea-testarch-atdd` — generate failing acceptance tests for Story 3-4 BEFORE dev-story (TDD red phase)

---
