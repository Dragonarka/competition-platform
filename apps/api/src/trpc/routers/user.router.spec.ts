import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { t } from '../trpc.init';
import { createUserRouter } from './user.router';

type CapturedTx = {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

interface MockState {
  selectRow: { preferredLocale: string } | null;
  insertReturnLocale: string;
  capturedSetLocale: string | null;
  capturedSetSessionUserId: string | null;
  insertCalls: number;
  selectCalls: number;
}

function makeMockDb() {
  const state: MockState = {
    selectRow: null,
    insertReturnLocale: 'en',
    capturedSetLocale: null,
    capturedSetSessionUserId: null,
    insertCalls: 0,
    selectCalls: 0,
  };

  const mockTx: CapturedTx = {
    execute: vi.fn(async (query: unknown) => {
      const stringified = JSON.stringify(query);
      const match = stringified.match(/user_[A-Za-z0-9_]+/);
      if (match) state.capturedSetSessionUserId = match[0];
      return { rows: [] };
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          state.selectCalls += 1;
          return state.selectRow ? [state.selectRow] : [];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: { preferredLocale: string }) => {
        state.capturedSetLocale = vals.preferredLocale;
        return {
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => {
              state.insertCalls += 1;
              return [{ preferredLocale: state.insertReturnLocale }];
            }),
          })),
        };
      }),
    })),
  };

  const db = {
    db: {
      transaction: vi.fn(async (fn: (tx: CapturedTx) => Promise<unknown>) => {
        return fn(mockTx);
      }),
    },
  } as never;

  const router = createUserRouter(db);
  const appRouter = t.router({ user: router });
  const caller = (userId: string | null) =>
    appRouter.createCaller({ userId, clientIp: '127.0.0.1' });

  return { state, mockTx, caller };
}

describe('user.getPreferences', () => {
  it('returns en default and hasPreference:false when no row exists', async () => {
    const { state, caller } = makeMockDb();
    state.selectRow = null;
    const result = await caller('user_org_1').user.getPreferences();
    expect(result).toEqual({ preferredLocale: 'en', hasPreference: false });
    expect(state.selectCalls).toBe(1);
  });

  it('returns the stored locale and hasPreference:true when a row exists', async () => {
    const { state, caller } = makeMockDb();
    state.selectRow = { preferredLocale: 'es' };
    const result = await caller('user_org_1').user.getPreferences();
    expect(result).toEqual({ preferredLocale: 'es', hasPreference: true });
  });

  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    const { caller } = makeMockDb();
    await expect(caller(null).user.getPreferences()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('does not write on read (lazy creation)', async () => {
    const { state, caller } = makeMockDb();
    state.selectRow = null;
    await caller('user_org_1').user.getPreferences();
    expect(state.insertCalls).toBe(0);
  });

  it('sets the RLS session variable inside the transaction', async () => {
    const { state, mockTx, caller } = makeMockDb();
    state.selectRow = null;
    await caller('user_org_xyz').user.getPreferences();
    expect(mockTx.execute).toHaveBeenCalled();
    expect(state.capturedSetSessionUserId).toBe('user_org_xyz');
  });
});

describe('user.setPreference', () => {
  it('upserts the chosen locale and returns it', async () => {
    const { state, caller } = makeMockDb();
    state.insertReturnLocale = 'es';
    const result = await caller('user_org_1').user.setPreference({
      locale: 'es',
    });
    expect(result).toEqual({ preferredLocale: 'es' });
    expect(state.insertCalls).toBe(1);
    expect(state.capturedSetLocale).toBe('es');
  });

  it('rejects unknown locales via Zod', async () => {
    const { caller } = makeMockDb();
    await expect(
      caller('user_org_1').user.setPreference({
        locale: 'fr' as never,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects when userId is null (UNAUTHORIZED)', async () => {
    const { caller } = makeMockDb();
    await expect(
      caller(null).user.setPreference({ locale: 'en' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('sets the RLS session variable inside the transaction', async () => {
    const { state, caller } = makeMockDb();
    state.insertReturnLocale = 'en';
    await caller('user_org_abc').user.setPreference({ locale: 'en' });
    expect(state.capturedSetSessionUserId).toBe('user_org_abc');
  });
});
