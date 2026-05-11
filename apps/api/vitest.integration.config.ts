import { defineConfig } from 'vitest/config';

// Real-DB integration tests. Separate from the unit config because:
// - These require a running Postgres at TEST_DATABASE_URL.
// - They are slow (per-test transaction setup) and should not run in the
//   default `pnpm test` loop.
// - They mock NOTHING — they exercise RLS, Drizzle transactions, postgres-js
//   driver behaviour, and event-store sequence constraints against real SQL.
//
// Run with: pnpm --filter @competition-platform/api test:integration
// Prereq:   docker compose --profile test up -d postgres_test && pnpm db:migrate
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    passWithNoTests: true,
    include: ['src/**/*.int.spec.ts'],
    // Integration tests share a single test DB; serialise to avoid cross-test
    // pollution from in-flight transactions and advisory locks.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Real DB connections can be slow on cold start. Give a generous budget.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
