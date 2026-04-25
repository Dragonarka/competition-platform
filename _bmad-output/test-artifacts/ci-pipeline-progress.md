---
stepsCompleted:
  - 'step-01-preflight'
  - 'step-02-generate-pipeline'
  - 'step-03-configure-quality-gates'
  - 'step-04-validate-and-summary'
lastStep: 'step-04-validate-and-summary'
lastSaved: '2026-04-24'
---

# CI/CD Pipeline Setup — Progress Document

## Step 1: Preflight Checks

### 1. Git Repository

- ✅ `.git/` exists
- ⚠️ No git remote configured (local-only). User must add a remote before CI can run on pushes.

### 2. Test Stack Type — `fullstack`

Detected both frontend and backend indicators:

- **Frontend**: `apps/web/` (Next.js 16, React 19, TanStack Query, tRPC client, Socket.IO client, shadcn)
- **Backend**: `apps/api/` (NestJS 11, tRPC server, Socket.IO gateway, Drizzle ORM + postgres)
- **E2E**: `tests/` (Playwright)

Monorepo with pnpm workspaces + Turborepo.

### 3. Test Framework — `vitest` (unit) + `playwright` (E2E)

- Unit: Vitest (`apps/api`, `apps/web`, `packages/*`) — invoked via `turbo run test`.
- E2E: Playwright configured at `tests/playwright.config.ts` with 5 projects (chromium, firefox, webkit, mobile-chrome, mobile-safari) and JUnit + HTML + list reporters.
- Dependencies installed via `pnpm install --frozen-lockfile`.

### 4. Tests Pass Locally

- ✅ Per Apr 24 16:03 session verification: full CI suite (lint, typecheck, build, test) passed with `turbo run` across all workspaces (72 unit tests pass including 5 new `getStandings` tests).
- Note: E2E test workspace `@competition-platform/tests` currently has pre-existing infrastructure gaps (needs DB seed + browser install in CI); the E2E job will be scaffolded but run conditionally.

### 5. CI Platform — `github-actions`

- Existing configuration found:
  - `.github/workflows/ci.yml` — minimal lint/typecheck/test/build
  - `.github/workflows/deploy.yml` — Fly.io deployment on `main`
- **Action**: Upgrade existing `ci.yml` in place (add caching, sharding, E2E, burn-in, artifacts). Leave `deploy.yml` untouched.

### 6. Environment Context

- `.nvmrc` → Node **24** (current ci.yml uses Node 20 — will correct to 24 for parity)
- Package manager: `pnpm@9.15.9`
- Engines: `node >=20`, `pnpm >=9`
- Turborepo tasks: `build`, `lint`, `typecheck`, `test`, `dev`
- Test command: `pnpm test` → `turbo run test` (workspace-level vitest runs)
- E2E command: `pnpm test:e2e` → `pnpm --filter @competition-platform/tests test` → `playwright test`

### Resolved Variables

| Variable          | Value                                                |
| ----------------- | ---------------------------------------------------- |
| `ci_platform`     | `github-actions`                                     |
| `test_stack_type` | `fullstack`                                          |
| `test_framework`  | `vitest + playwright`                                |
| `node_version`    | `24`                                                 |
| `package_manager` | `pnpm@9`                                             |
| `test_dir`        | `tests/`                                             |
| Output file       | `.github/workflows/test.yml` (new) + update `ci.yml` |

### Preflight Result: ✅ Ready to proceed to Step 2

---

## Step 2: Generate CI Pipeline

**Output**: `.github/workflows/test.yml` (new, 16.7 KB) + minor fix in `.github/workflows/ci.yml`.

### Design decisions

- Layered workflows: existing `ci.yml` = fast-loop (lint/typecheck/unit/build on every push); new `test.yml` = full pipeline (sharded E2E + burn-in on main/develop + weekly cron).
- Updated `ci.yml` to use `node-version-file: '.nvmrc'` (was hard-coded to Node 20; `.nvmrc` says 24).
- pnpm 9 + Turborepo preserved; no `npm ci` usage introduced.

### Stages wired in `test.yml`

| #   | Job     | Timeout | Trigger                             | Notes                                                                       |
| --- | ------- | ------- | ----------------------------------- | --------------------------------------------------------------------------- |
| 1   | lint    | 5 min   | every push/PR (main/develop)        | `pnpm lint && pnpm typecheck`                                               |
| 2   | unit    | 10 min  | ↑ + `needs: lint`                   | Vitest via turbo, excludes `@competition-platform/tests`, then `pnpm build` |
| 3   | e2e     | 30 min  | `vars.ENABLE_E2E == 'true'` OR cron | 4-shard Playwright chromium + Postgres + Redis services                     |
| 4   | burn-in | 60 min  | PR/schedule AND `ENABLE_E2E`        | 10 full iterations, any flake fails job                                     |
| 5   | report  | —       | `always()`                          | Step summary + PR comment on failure + quality gate                         |

### Caching

- **pnpm store** via `actions/setup-node@v4 { cache: 'pnpm' }`.
- **Playwright browsers** via `actions/cache@v4` keyed by `pnpm-lock.yaml`; `install-deps` on hit, full install on miss.

### Security notes

- `run:` blocks consume safe contexts only (`matrix.*`, `runner.*`, `github.sha`, `github.ref`, `secrets.*`).
- PR-comment job uses env-intermediaries (`UNIT_RESULT`, `E2E_RESULT`, etc.) for all `needs.*.result` values; no direct `${{ inputs.* }}` interpolation.
- Script-injection-prevention guidance embedded as trailing comment block in `test.yml` for future `workflow_call` / `workflow_dispatch` extensions.

---

## Step 3: Quality Gates & Notifications

### Burn-in

- Enabled (fullstack stack per config). 10 iterations. Any failure ⇒ job fails ⇒ pipeline fails.
- Scoped to PRs + weekly cron to preserve CI minutes.

### Quality gate

- Dedicated `Enforce quality gate` step in the `report` job — fails the workflow if any of `unit`, `e2e`, or `burn-in` returned `failure` (skipped/cancelled are tolerated so the gate doesn't trip when E2E is intentionally disabled).
- `forbidOnly: IS_CI` in `playwright.config.ts` prevents `.only` leakage.
- Playwright `retries: 2` on non-burn-in runs absorbs transient flakes; burn-in runs with retries disabled by loop structure.

### Notifications

- PR-comment via `actions/github-script@v7` on any failure (uses `GITHUB_TOKEN`; no external secret required).
- Slack/email webhook slot documented in `docs/ci-secrets-checklist.md` under "Optional".

### Contract testing

- `tea_use_pactjs_utils` is `true` in config but `@pact-foundation/*` is not installed in this repo — pact stage intentionally skipped. Re-run workflow if contract testing is introduced.

---

## Step 4: Validate & Summary

### Validation results

| Check                               | Result                   |
| ----------------------------------- | ------------------------ |
| `test.yml` YAML parse               | ✅                       |
| `ci.yml` YAML parse                 | ✅                       |
| `deploy.yml` YAML parse (unchanged) | ✅                       |
| `scripts/*.sh` bash syntax          | ✅                       |
| Scripts executable (`chmod +x`)     | ✅                       |
| Output paths match platform         | ✅                       |
| Stack-conditional burn-in applied   | ✅ (fullstack → enabled) |
| No secrets in config files          | ✅                       |
| No direct `${{ inputs.* }}` usage   | ✅                       |

### Files created / modified

| Path                           | Status   | Purpose                                |
| ------------------------------ | -------- | -------------------------------------- |
| `.github/workflows/test.yml`   | created  | Comprehensive test pipeline            |
| `.github/workflows/ci.yml`     | modified | Node version now sourced from `.nvmrc` |
| `scripts/ci-local.sh`          | created  | Mirror CI locally                      |
| `scripts/burn-in.sh`           | created  | Local burn-in loop                     |
| `scripts/test-changed.sh`      | created  | Changed-workspace unit tests           |
| `docs/ci.md`                   | created  | Pipeline guide                         |
| `docs/ci-secrets-checklist.md` | created  | Required secrets + variables           |

### Next steps for the user

1. Configure the 5 Clerk-related secrets and `ENABLE_E2E=true` variable per `docs/ci-secrets-checklist.md`.
2. Add a git remote (currently none configured) and push to trigger the first CI run.
3. Monitor the first full run; confirm performance targets from `docs/ci.md`.
4. (Optional) Delete `ci.yml` once `test.yml`'s `lint` + `unit` stages prove stable — they're intentionally overlapping during the transition.
5. (Optional) Proceed to `bmad-tea-testarch-atdd` for test generation, `-automate` for coverage expansion, or `-trace` for traceability matrix.

### Workflow Result: ✅ Complete
