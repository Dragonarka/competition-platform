import { describe, it, expect } from 'vitest';
import { ErrorCodes } from '@competition-platform/shared';
import { errorCodeToI18nKey } from '@competition-platform/shared';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

type Json = Record<string, unknown>;

function flatten(obj: Json, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const child of flatten(v as Json, path)) out.add(child);
    } else {
      out.add(path);
    }
  }
  return out;
}

describe('errorCodeToI18nKey', () => {
  it('returns Errors.<CODE>', () => {
    expect(errorCodeToI18nKey(ErrorCodes.PHASE_NOT_ACTIVE)).toBe('Errors.PHASE_NOT_ACTIVE');
    expect(errorCodeToI18nKey(ErrorCodes.SCORE_OUTSIDE_RANGE)).toBe('Errors.SCORE_OUTSIDE_RANGE');
  });
});

describe('translation files', () => {
  it('have identical key structure between en and es (parity)', () => {
    const enKeys = [...flatten(en as unknown as Json)].sort();
    const esKeys = [...flatten(es as unknown as Json)].sort();
    expect(esKeys).toEqual(enKeys);
  });

  it('en.json Errors namespace covers every ErrorCode', () => {
    const errorKeys = new Set(Object.keys((en as { Errors: Json }).Errors));
    for (const code of Object.values(ErrorCodes)) {
      expect(errorKeys.has(code), `Errors.${code} missing from en.json`).toBe(true);
    }
  });

  it('es.json Errors namespace covers every ErrorCode', () => {
    const errorKeys = new Set(Object.keys((es as { Errors: Json }).Errors));
    for (const code of Object.values(ErrorCodes)) {
      expect(errorKeys.has(code), `Errors.${code} missing from es.json`).toBe(true);
    }
  });
});
