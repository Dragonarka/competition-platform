# E2E Test Framework — Playwright

End-to-end Playwright test suite for the competition-platform monorepo. Tests the real-time competition flow across organizer, judge, and public roles.

---

## Quick Reference

| Command (from repo root)                                | Purpose                                          |
| ------------------------------------------------------- | ------------------------------------------------ |
| `pnpm test:e2e:install`                                 | Install Playwright browsers (one-time)           |
| `pnpm test:e2e`                                         | Run the full E2E suite headlessly                |
| `pnpm test:e2e:ui`                                      | Run with Playwright UI (watch / debug)           |
| `pnpm --filter @competition-platform/tests test:headed` | Run headed (visible browser)                     |
| `pnpm --filter @competition-platform/tests test:debug`  | Step through with Playwright Inspector           |
| `pnpm --filter @competition-platform/tests test:mobile` | Run only mobile-viewport specs (judge interface) |
| `pnpm --filter @competition-platform/tests report`      | Open the last HTML report                        |

---

## First-Time Setup

1. **Install dependencies** (from repo root):
   ```bash
   pnpm install
   pnpm test:e2e:install   # downloads Chromium, Firefox, WebKit
   ```
2. **Create your env file**:
   ```bash
   cp tests/.env.example tests/.env
   ```
   Fill in `TEST_DATABASE_URL`, `TEST_ORGANIZER_EMAIL`, `TEST_ORGANIZER_PASSWORD`, and `TEST_ORGANIZER_CLERK_USER_ID` (see below).
3. **Provision the test database** (separate from dev DB):
   ```bash
   psql -U postgres -c "CREATE DATABASE competition_platform_test;"
   pnpm --filter @competition-platform/db db:migrate
   ```
   Point `TEST_DATABASE_URL` at this DB. **Never** point it at the dev or prod DB — the suite truncates and seeds data per test.
4. **Create a test organizer in Clerk:** in Clerk dashboard, create a user explicitly for E2E (e.g., `e2e-organizer@example.com`). Capture the Clerk user ID and put it in `TEST_ORGANIZER_CLERK_USER_ID`.
5. **Run the suite:**
   ```bash
   pnpm test:e2e
   ```
   The default `webServer` block in `playwright.config.ts` will spin up the API and web dev servers locally before tests run. In CI, the servers should already be running.

---

## Directory Layout

```
tests/
├── .env.example             — Env vars template (never commit .env)
├── .gitignore               — Excludes test-results/, playwright-report/, .auth/, .env
├── package.json             — Workspace package @competition-platform/tests
├── tsconfig.json            — Strict TS for test code
├── playwright.config.ts     — Main Playwright config (projects, timeouts, reporters)
├── e2e/                     — Test specs (one file per user journey)
│   ├── organizer-create-competition.spec.ts
│   ├── judge-scoring.spec.ts
│   └── public-standings.spec.ts
└── support/
    ├── fixtures/
    │   ├── index.ts              — Merged fixtures (re-export via mergeTests)
    │   ├── auth.fixture.ts       — organizerPage / judgePage / publicPage fixtures
    │   └── test-data.fixture.ts  — Factories (competition, criterion, participant)
    ├── helpers/
    │   ├── api-client.ts         — Minimal tRPC HTTP client for test setup
    │   ├── db-client.ts          — Drizzle client with RLS-aware transaction helper
    │   └── network.ts            — Offline simulation, throttling, tRPC request waiters
    └── page-objects/
        ├── organizer-dashboard.po.ts
        └── judge-scoring.po.ts
```

---

## Fixture Architecture

Playwright fixtures are composed via `mergeTests` in `support/fixtures/index.ts`. Import `test` and `expect` from there — never from `@playwright/test` directly. This keeps custom fixtures (auth, seeded data) available in every spec without per-file imports.

### Auth fixtures

- `organizerPage` — authenticated as the test organizer via storageState (persisted at `tests/.auth/organizer.json`)
- `judgePage` — anonymous browser context (judge access happens via URL token, not session)
- `publicPage` — anonymous browser context for public standings

On the first run the test organizer needs to sign in once; the resulting storage state is cached in `tests/.auth/organizer.json` (gitignored) and reused across runs. If Clerk invalidates the session, delete `.auth/` and re-run.

### Data factories

`competitionFactory.build()`, `criterionFactory.buildMany(n)`, `participantFactory.buildMany(n)` return deterministic-ish seed data using `nanoid` for IDs. Override any field via `.build({ name: 'X' })`.

### DB helper

`withOrganizer(clerkUserId, fn)` wraps a transaction with `SET LOCAL session.current_organizer_id` — the same RLS pattern used by every tRPC protected procedure. Use this for direct DB seeding / cleanup in tests. Clean up per-test in `afterEach` or per-file in `afterAll`.

---

## Best Practices

1. **Selectors: prefer `getByRole` / `getByLabel` / `getByText`** over CSS or XPath. Fall back to `data-testid` (configured as the `testIdAttribute`) only when semantic locators don't reach the target. Do not rely on Tailwind class names — they change.
2. **One journey per spec file.** `organizer-create-competition.spec.ts` should not contain judge scoring logic. Cross-role journeys either (a) belong in their own file (e.g., `live-scoring-flow.spec.ts`) or (b) coordinate via multiple page-objects in one test.
3. **Isolation per test.** Every test creates its own competition via the factory; never share state across tests. Use unique `nanoid`-suffixed names to avoid collisions with parallel workers.
4. **Assert network calls when meaningful.** Use `waitForTrpcCall(page, 'tournament.create')` to sync on server round-trips rather than `waitForTimeout`. Never use `page.waitForTimeout(...)` in committed tests.
5. **NFR budgets matter.** The judge scoring cycle test asserts `<10s` (from the UX spec). Keep these thresholds in tests so regressions show up.
6. **Mobile-specific tests go in files matching `/.*judge.*\.spec\.ts/`.** The mobile projects in `playwright.config.ts` only pick up those files — other specs run desktop-only.
7. **Skip > fail** during framework bootstrap. All sample specs ship as `test.skip(...)` — replace `test.skip` with `test` when the referenced story is implemented and the setup is available.
8. **Never clean up by organizer in a shared-cloud DB.** `cleanupByOrganizer(TEST_ORGANIZER_CLERK_USER_ID)` nukes every competition for that user. Safe in a local test DB; destructive anywhere else.

---

## Running Against CI

In CI, do NOT rely on the local `webServer` block — it's disabled when `CI=true`. Instead:

1. Start the API and web servers in separate CI jobs or a compose file before running Playwright.
2. Ensure `BASE_URL` and `API_URL` env vars point at the running services.
3. Install browsers with `--with-deps` (handled by `pnpm test:e2e:install`).
4. The HTML + JUnit reporters produce both `playwright-report/` (for humans) and `test-results/junit.xml` (for CI test aggregation).

Add to `.github/workflows/*.yml` (example step — not yet wired up):

```yaml
- uses: pnpm/action-setup@v4
- run: pnpm install
- run: pnpm test:e2e:install
- run: pnpm --filter @competition-platform/api start:dev &
- run: pnpm --filter @competition-platform/web dev &
- run: pnpm test:e2e
  env:
    CI: 'true'
    BASE_URL: http://localhost:3000
    API_URL: http://localhost:3001
    TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
    TEST_ORGANIZER_EMAIL: ${{ secrets.TEST_ORGANIZER_EMAIL }}
    TEST_ORGANIZER_PASSWORD: ${{ secrets.TEST_ORGANIZER_PASSWORD }}
    TEST_ORGANIZER_CLERK_USER_ID: ${{ secrets.TEST_ORGANIZER_CLERK_USER_ID }}
```

---

## What's Scaffolded vs What's Pending

| Area                                                                        | Status                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Playwright config with timeouts, reporters, multi-browser + mobile projects | ✅                                                                |
| Fixture architecture (merged fixtures, auth, data factories)                | ✅                                                                |
| Page objects (organizer dashboard, judge scoring)                           | ✅ stubs                                                          |
| Helpers (DB client with RLS, API client, network utilities)                 | ✅                                                                |
| Sample specs for organizer / judge / public flows                           | ✅ skipped                                                        |
| Real-DB test database setup guide                                           | ✅                                                                |
| Auth storageState bootstrap (first-run sign-in script)                      | ⏸️ TODO — add `global.setup.ts` or a one-time manual-sign-in step |
| GitHub Actions E2E workflow                                                 | ⏸️ TODO — separate TEA workflow (`bmad-tea-testarch-ci`)          |
| Contract testing (Pact)                                                     | ⏸️ Deferred — not needed until there's an external API consumer   |
| Coverage reporter                                                           | ⏸️ Post-MVP                                                       |

---

## When to Convert `test.skip` → `test`

| Spec                                        | Unlocks with                                                       |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `organizer-create-competition.spec.ts`      | Story 2.1 complete (already done) — needs storageState setup first |
| `judge-scoring.spec.ts` — valid-link cases  | Story 3.3 complete (already done) + judge-token seeding helper     |
| `judge-scoring.spec.ts` — 10s cycle         | Story 3.4 complete (score aggregation)                             |
| `public-standings.spec.ts` — anonymous view | Story 3.4 complete                                                 |
| `public-standings.spec.ts` — 10s update     | Story 3.4 complete — assert WebSocket-driven update                |

---

## Knowledge References

- `_bmad-output/project-context.md` — rules every implementation must follow (RLS, testing discipline, Next.js 16 gotchas)
- `_bmad-output/planning-artifacts/architecture.md` — architecture decisions (NFR budgets are listed there)
- `_bmad-output/planning-artifacts/prd.md` — NFR1 (<500ms score round-trip), NFR3 (<10s leaderboard), NFR4 (<1s judge load on 4G)

---

_Generated by `/bmad-tea-testarch-framework` on 2026-04-24._
