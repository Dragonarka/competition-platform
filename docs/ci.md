# CI/CD Pipeline Guide

> Scaffolded by BMad TEA (testarch-ci workflow) on 2026-04-24.
> Stack: **fullstack** (Next.js 16 + NestJS 11 + tRPC + Socket.IO)
> Platform: **GitHub Actions**

---

## Workflows

| File                           | Trigger                                    | Purpose                                              |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| `.github/workflows/ci.yml`     | every push + PR                            | Fast-loop: lint + typecheck + unit + build           |
| `.github/workflows/test.yml`   | push main/develop, PR main/develop, weekly | Full test pipeline with sharding, burn-in, artifacts |
| `.github/workflows/deploy.yml` | push `main`                                | Fly.io deployment                                    |

The two test workflows are intentionally layered: `ci.yml` fails fast on trivial
mistakes; `test.yml` runs the heavier sharded E2E + burn-in only on the main
branches. Feel free to delete `ci.yml` once you're comfortable the checks in
`test.yml` are stable.

## `test.yml` stages

1. **Lint** (≈2 min) — `pnpm lint && pnpm typecheck`
2. **Unit** (≈5 min) — Vitest across all workspaces except `@competition-platform/tests`; verifies build.
3. **E2E** (≈20 min, 4 shards) — Playwright chromium with Postgres + Redis services. Gated by `vars.ENABLE_E2E == 'true'`.
4. **Burn-In** (≤60 min, 10 iterations) — Flaky detection. Runs only on PR + weekly cron. Also gated by `ENABLE_E2E`.
5. **Report** — Aggregates results, posts PR comment on failure, enforces quality gate (unit/E2E/burn-in must not be `failure`).

## Enabling E2E in CI

E2E is scaffolded but gated behind a repository variable so the pipeline is green
until the required Clerk test account and data seed are in place.

1. Provision the secrets in `docs/ci-secrets-checklist.md`.
2. In GitHub: **Settings → Secrets and variables → Actions → Variables** → add `ENABLE_E2E = true`.
3. Ensure `pnpm --filter @competition-platform/db exec drizzle-kit migrate` works against a
   fresh Postgres (the pipeline calls this before starting the API).
4. Re-run the workflow. The `e2e` and `burn-in` jobs will now execute.

## Local mirror

- `scripts/ci-local.sh` — runs lint + typecheck + unit + build exactly as `ci.yml` does.
- `scripts/burn-in.sh [N]` — local burn-in loop (defaults to 10 iterations). Requires Postgres + Redis + API + Web running.
- `scripts/test-changed.sh [base-ref]` — runs unit tests only for workspaces with changes since the base ref (default `origin/main`).

## Performance targets

| Stage     | Target   |
| --------- | -------- |
| Lint      | < 2 min  |
| Unit      | < 5 min  |
| E2E/shard | < 10 min |
| Burn-In   | < 30 min |
| Total     | < 45 min |

Playwright sharding is set to 4 workers (matches `playwright.config.ts` CI worker setting). Adjust the matrix + worker count together when changing parallelism.

## Caching

- **pnpm store** — cached via `actions/setup-node@v4 { cache: 'pnpm' }` keyed by `pnpm-lock.yaml`.
- **Playwright browsers** — `~/.cache/ms-playwright` keyed by `pnpm-lock.yaml`; falls back to `playwright install-deps` on cache hit, full install on miss.

## Artifacts

Uploaded on failure only (retention in parentheses):

- `unit-test-results` (14 d) — coverage output
- `playwright-report-shard-{N}` (30 d) — HTML + trace + video
- `junit-shard-{N}` (14 d) — JUnit XML, always uploaded
- `burn-in-failures` (30 d) — report + traces from the failing iteration

## Quality gates

- Unit tests must pass (`failure` ⇒ pipeline fail).
- If `ENABLE_E2E=true`, E2E + burn-in must not fail.
- `forbidOnly: IS_CI` in `playwright.config.ts` blocks `.only` sneaking into CI.
- `retries: IS_CI ? 2 : 0` absorbs transient flakes during regular E2E; burn-in runs with retries disabled by iteration logic (any failure exits 1).

## Troubleshooting

**Tests pass locally, fail in CI**
Run `./scripts/ci-local.sh` — it mirrors the install + lint + unit sequence.

**Playwright browser install is slow**
Check the cache-hit line in the `Cache Playwright browsers` step. Cache key depends on `pnpm-lock.yaml`; cache is reset automatically when dependencies change.

**Services don't start in E2E job**
The `wait-on` step polls `$API_URL/health` and `$BASE_URL` for 120s. If this times out, inspect the "Start API" / "Start Web" steps for background-process errors; you may need to pipe stdout/stderr to files and upload them as artifacts.

**Burn-in keeps failing intermittently**
The burn-in job's exit-1-on-failure is intentional — it's catching a real flake. Isolate with `scripts/burn-in.sh 30` locally and fix the test.

## Security

The pipeline follows the **inputs are DATA, not COMMANDS** rule — any future
`workflow_call` / `workflow_dispatch` / composite-action extensions must route
`${{ inputs.* }}` or `${{ github.event.* }}` user-controlled values through
`env:` intermediaries. See the comment block at the bottom of `test.yml` and
`docs/ci-secrets-checklist.md` for specifics.
