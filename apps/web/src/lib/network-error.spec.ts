import { describe, it, expect, afterEach } from 'vitest';
import { isNetworkError } from './network-error';

const realOnline = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'onLine');

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

function restoreOnline(): void {
  if (realOnline) {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', realOnline);
  }
}

describe('isNetworkError', () => {
  afterEach(() => {
    restoreOnline();
  });

  it('returns true when navigator.onLine is false', () => {
    setOnline(false);
    expect(isNetworkError({ data: { code: 'BAD_REQUEST' } })).toBe(true);
  });

  it('returns true when error has no .data (tRPC never reached server)', () => {
    setOnline(true);
    const err = new Error('fetch failed');
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns false when online and error has structured tRPC .data', () => {
    setOnline(true);
    expect(isNetworkError({ data: { code: 'BAD_REQUEST', httpStatus: 400 } })).toBe(false);
  });

  it('returns true when err is null (defensive against `throw null`)', () => {
    setOnline(true);
    expect(isNetworkError(null)).toBe(true);
  });

  it('returns true when err is undefined', () => {
    setOnline(true);
    expect(isNetworkError(undefined)).toBe(true);
  });

  it('returns true when err is a primitive string', () => {
    setOnline(true);
    expect(isNetworkError('something broke')).toBe(true);
  });

  it('returns true when err.data is explicitly undefined', () => {
    setOnline(true);
    expect(isNetworkError({ data: undefined })).toBe(true);
  });
});
