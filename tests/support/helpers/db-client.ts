import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL (preferred) or DATABASE_URL is required for E2E tests. See tests/README.md.',
  );
}

const queryClient = postgres(DATABASE_URL, { max: 2 });
export const db = drizzle(queryClient);

export async function withOrganizer<T>(organizerClerkId: string, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session.current_organizer_id = ${organizerClerkId}`);
    return fn();
  });
}

export async function cleanupCompetition(competitionId: string): Promise<void> {
  await db.execute(sql`DELETE FROM competitions WHERE id = ${competitionId}`);
}

export async function cleanupByOrganizer(organizerClerkId: string): Promise<void> {
  await db.execute(sql`DELETE FROM competitions WHERE organizer_clerk_id = ${organizerClerkId}`);
}

export async function closeDb(): Promise<void> {
  await queryClient.end({ timeout: 5 });
}
