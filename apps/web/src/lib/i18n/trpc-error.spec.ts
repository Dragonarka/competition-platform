import { describe, it, expect } from 'vitest';
import { ErrorCodes } from '@competition-platform/shared';
import { getTrpcErrorCode, getTrpcErrorI18nKey } from './trpc-error';

describe('getTrpcErrorCode', () => {
  it('extracts a known error code from tRPC error.data.cause', () => {
    const error = { data: { cause: { errorCode: ErrorCodes.PHASE_NOT_ACTIVE } } };
    expect(getTrpcErrorCode(error)).toBe(ErrorCodes.PHASE_NOT_ACTIVE);
  });

  it('returns null for unknown error codes', () => {
    const error = { data: { cause: { errorCode: 'NOT_A_REAL_CODE' } } };
    expect(getTrpcErrorCode(error)).toBeNull();
  });

  it('returns null when no cause is present', () => {
    expect(getTrpcErrorCode({ data: { code: 'BAD_REQUEST' } })).toBeNull();
    expect(getTrpcErrorCode({})).toBeNull();
    expect(getTrpcErrorCode(null)).toBeNull();
    expect(getTrpcErrorCode(undefined)).toBeNull();
    expect(getTrpcErrorCode('string error')).toBeNull();
  });
});

describe('getTrpcErrorI18nKey', () => {
  it('returns a fully-namespaced Errors.<CODE> key for known codes', () => {
    const error = { data: { cause: { errorCode: ErrorCodes.SCORE_OUTSIDE_RANGE } } };
    expect(getTrpcErrorI18nKey(error)).toBe('Errors.SCORE_OUTSIDE_RANGE');
  });

  it('returns null when no recognised code is present', () => {
    expect(getTrpcErrorI18nKey(new Error('plain'))).toBeNull();
  });
});
