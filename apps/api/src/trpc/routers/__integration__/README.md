# Real-DB Integration Tests

Tests in this folder hit a **real Postgres instance**. They are deliberately
separated from the unit tests (`*.spec.ts`) which use mocked `DatabaseService`
chain helpers.

## Why a separate suite

Unit tests give us fast feedback on procedure logic shape. They cannot validate:

- Real RLS policy behaviour (the `session.current_organizer_id` setting,
  per-table `USING` clauses, `current_setting('...', true)` with the NULL
  fallback).
- Real Drizzle transaction semantics (`SET LOCAL` scoping, advisory locks,
  rollback on thrown errors).
- Real `postgres-js` driver behaviour (error codes like `23505` for unique
  violations, sequence wraparound, etc.).
- Real UNIQUE constraint enforcement on composite keys
  (`uq_score_judge_idempotency`, `uq_battle_matchups_position`, etc.).
- Real concurrency hazards (advisory lock collisions, race conditions on
  event-store `(aggregate_id, sequence)`).

Mocked tests ship green when any of these silently break.

## Running

```bash
# 1. Start the test Postgres (separate from dev DB on port 5433, tmpfs storage).
docker compose --profile test up -d postgres_test

# 2. Apply migrations to the test DB.
DATABASE_URL=postgres://postgres:postgres@localhost:5433/competition_platform_test \
  pnpm --filter @competition-platform/db db:migrate

# 3. Run the integration suite.
pnpm --filter @competition-platform/api test:integration
```

Stop the test DB when done:

```bash
docker compose --profile test down
```

## File naming

`*.int.spec.ts` — matched by `vitest.integration.config.ts`, excluded from
the unit `vitest.config.ts` (`include: ['src/**/*.spec.ts']` does NOT pick
up `.int.spec.ts` because of the `.int.` infix).

## Conventions

- Each test starts with a clean DB (`beforeEach(truncateAll)`).
- Use `seed*` helpers within each file rather than fixtures — keeps each
  test self-documenting about what state it depends on.
- Mock the WebSocket gateway with `vi.fn()` — these tests are about DB
  behaviour, not socket fanout.
- Use the shared `getIntegrationContext()` to get a `DatabaseService`-shaped
  wrapper that routers' factory functions accept unchanged.
- Set `TEST_DATABASE_URL` env var to override the default URL (useful in CI
  where the Postgres service might be on a different host/port).

## What to add here

A test belongs in this folder when:

- The procedure under test relies on RLS policy behaviour we want to lock down.
- The procedure has TOCTOU-style guards (`23505` unique-violation retries,
  advisory locks) whose real behaviour the mock can't capture.
- Cross-procedure state mutation (e.g., `startCypherPhase` → `submitScore` →
  `completeCypherPhase` → `submitVote`) is under test.
- A bug surfaced in production or staging that the unit test missed —
  reproduce it here first, then fix.

A test does **not** belong here when:

- The logic is purely in-memory (group assigner, bracket generator,
  vote tallier — these have unit specs and don't need a DB round-trip).
- The procedure has thin DB interaction and the unit test fully describes it.

## CI integration

Not wired into CI yet — local-only as of Epic 8 prep. Adding it to CI
requires:

- A Postgres service container in the GH Actions workflow.
- A migrations step before the `test:integration` step.
- Optionally: split into a separate workflow that only runs on `main`
  branch and PRs touching `apps/api/**` or `packages/db/**`.

This is intentionally deferred — get the framework into developer hands
first, then promote to CI once the test suite has enough coverage to be
worth the gate.
