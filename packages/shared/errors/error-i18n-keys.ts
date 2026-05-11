import { ErrorCodes, type ErrorCode } from './error-codes';

// Maps a structured error code to its i18n key under the `Errors` namespace.
// Used on the client to translate tRPC error responses, never raw codes.
//
// CI gate (apps/web/scripts/check-error-code-coverage.ts) enforces that every
// code in ErrorCodes has a corresponding entry in messages/en.json and
// messages/es.json under "Errors". A missing key falls back to the key path
// itself via next-intl's getMessageFallback — no crashes, just visibly wrong.
export function errorCodeToI18nKey(code: ErrorCode | string): string {
  return `Errors.${code}`;
}

// All recognised error codes. Iterate this list in the CI coverage check to
// detect codes that haven't been translated yet. Avoiding Object.values keeps
// this file compatible with the shared package's conservative TS lib target.
export const ALL_ERROR_CODES: readonly ErrorCode[] = Object.keys(ErrorCodes).map(
  (k) => ErrorCodes[k as keyof typeof ErrorCodes],
);

// Convenience guard for narrowing arbitrary strings (e.g., from tRPC cause
// objects) to known codes. Anything unknown falls through to "UNKNOWN".
export function isKnownErrorCode(value: unknown): value is ErrorCode {
  if (typeof value !== 'string') return false;
  return ALL_ERROR_CODES.some((c) => c === value);
}
