import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@competition-platform/db';
import type { DatabaseService } from '../../../modules/database/database.service';

// Default to the docker-compose `postgres_test` service. Override via env for
// CI or a different local setup.
const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgres://postgres:postgres@localhost:5433/competition_platform_test';

type IntegrationDb = ReturnType<typeof drizzle<typeof schema>>;

let cachedClient: ReturnType<typeof postgres> | null = null;
let cachedDb: IntegrationDb | null = null;

function getClient(): {
  client: ReturnType<typeof postgres>;
  db: IntegrationDb;
} {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
  cachedClient = postgres(TEST_DATABASE_URL, { max: 5, idle_timeout: 5 });
  cachedDb = drizzle(cachedClient, { schema });
  return { client: cachedClient, db: cachedDb };
}

export async function closeIntegrationDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end();
    cachedClient = null;
    cachedDb = null;
  }
}

// Truncate every domain table between tests. CASCADE handles FK chains.
// We TRUNCATE rather than DELETE so identity columns (none used here, but
// safe default) and triggers reset cleanly. Application-managed nanoid PKs
// are unaffected.
const TABLES_TO_TRUNCATE = [
  'events',
  'votes',
  'scores',
  'battle_matchups',
  'competitor_group_assignments',
  'judge_sessions',
  'competitors',
  'evaluation_criteria',
  'competitions',
] as const;

export async function truncateAll(db: IntegrationDb): Promise<void> {
  // Single TRUNCATE statement with CASCADE — atomic, no FK ordering required.
  const tableList = TABLES_TO_TRUNCATE.join(', ');
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`),
  );
}

export interface IntegrationContext {
  db: IntegrationDb;
  dbService: Pick<DatabaseService, 'db'>;
}

// Returns the shared connection + a `DatabaseService`-shaped wrapper so router
// factories (`createTournamentRouter(dbService, gateway)`) work unchanged.
export function getIntegrationContext(): IntegrationContext {
  const { db } = getClient();
  return { db, dbService: { db } };
}

// Convenience: assert the test DB is actually reachable. Use in
// `beforeAll` to fail fast with a useful message when docker isn't running.
export async function assertTestDbReachable(): Promise<void> {
  try {
    const { db } = getClient();
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    throw new Error(
      `Integration test DB unreachable at ${TEST_DATABASE_URL}. ` +
        `Start it with: docker compose --profile test up -d postgres_test && ` +
        `DATABASE_URL=${TEST_DATABASE_URL} pnpm --filter @competition-platform/db db:migrate. ` +
        `Underlying error: ${(err as Error).message}`,
    );
  }
}
