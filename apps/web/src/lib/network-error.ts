/**
 * Detects whether a thrown value represents a network-level failure
 * (the request never reached the server, or the browser is offline).
 *
 * Two complementary signals:
 *  1. `navigator.onLine === false` — synchronous browser API.
 *  2. Missing `.data` on the error object — tRPC client never received a server response.
 */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err == null || typeof err !== 'object') return true;
  const e = err as { data?: unknown };
  if (e.data === undefined) return true;
  return false;
}
