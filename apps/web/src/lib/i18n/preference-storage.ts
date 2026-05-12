// Story 8.2 — localStorage mirror of the active locale. The NEXT_LOCALE
// cookie that next-intl manages is the primary persistence path; this is the
// safety net for Safari ITP / private-mode contexts where cookies don't
// survive across sessions but localStorage might.

import type { SupportedLocale } from '@competition-platform/shared';
import { SUPPORTED_LOCALES } from '@competition-platform/shared';

export const PREFERRED_LOCALE_KEY = 'preferredLocale';

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function readStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFERRED_LOCALE_KEY);
    if (!raw) return null;
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFERRED_LOCALE_KEY, locale);
  } catch {
    // Private mode / quota errors fall through silently — the cookie path
    // keeps the UI behaviour correct.
  }
}
