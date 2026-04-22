import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { t } from '../trpc.init';
import { createTournamentRouter } from './tournament.router';

// Mock DB — should never be reached in validation/auth tests
const mockDb = {
  db: {
    transaction: () => {
      throw new Error('DB should not be called in validation tests');
    },
  },
} as any;

const router = createTournamentRouter(mockDb);
const appRouter = t.router({ tournament: router });

const caller = (userId: string | null) => appRouter.createCaller({ userId });

describe('tournament.create', () => {
  it('rejects empty name with Zod validation error', async () => {
    await expect(
      caller('user_123').tournament.create({
        name: '',
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects whitespace-only name with Zod validation error', async () => {
    await expect(
      caller('user_123').tournament.create({
        name: '   ',
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects name exceeding 200 characters', async () => {
    await expect(
      caller('user_123').tournament.create({
        name: 'a'.repeat(201),
        date: null,
        description: null,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    await expect(
      caller(null).tournament.create({
        name: 'Test Competition',
        date: null,
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
