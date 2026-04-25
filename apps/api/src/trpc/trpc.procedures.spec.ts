import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { t } from './trpc.init';
import { protectedProcedure } from './trpc.procedures';

const testRouter = t.router({
  protected: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
  })),
});

const caller = (userId: string | null) =>
  testRouter.createCaller({ userId, clientIp: '127.0.0.1' });

describe('protectedProcedure', () => {
  it('throws UNAUTHORIZED when userId is null', async () => {
    await expect(caller(null).protected()).rejects.toThrow(TRPCError);
    await expect(caller(null).protected()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('passes through when userId is present', async () => {
    const result = await caller('user_123').protected();
    expect(result).toEqual({ userId: 'user_123' });
  });
});
