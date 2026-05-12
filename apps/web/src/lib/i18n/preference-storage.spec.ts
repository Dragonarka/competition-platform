import { describe, it, expect, beforeEach } from 'vitest';
import { PREFERRED_LOCALE_KEY, readStoredLocale, writeStoredLocale } from './preference-storage';

describe('preference-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a supported locale', () => {
    writeStoredLocale('es');
    expect(readStoredLocale()).toBe('es');
  });

  it('returns null when no value is stored', () => {
    expect(readStoredLocale()).toBeNull();
  });

  it('returns null when the stored value is not a supported locale', () => {
    window.localStorage.setItem(PREFERRED_LOCALE_KEY, 'fr');
    expect(readStoredLocale()).toBeNull();
  });

  it('exposes the storage key constant', () => {
    expect(PREFERRED_LOCALE_KEY).toBe('preferredLocale');
  });
});
