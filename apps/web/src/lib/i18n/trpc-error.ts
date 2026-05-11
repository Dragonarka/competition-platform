import { errorCodeToI18nKey, isKnownErrorCode, type ErrorCode } from '@competition-platform/shared';

// Extract the structured error code out of a tRPC mutation/query error.
// Backend convention (see apps/api/src/trpc/routers/*): TRPCError instances
// carry `cause: { errorCode: ErrorCodes.X }`. Anything else falls through.
export function getTrpcErrorCode(error: unknown): ErrorCode | null {
  if (!error || typeof error !== 'object') return null;
  const data = (error as { data?: { cause?: { errorCode?: unknown } } }).data;
  const code = data?.cause?.errorCode;
  return isKnownErrorCode(code) ? code : null;
}

// Convenience: tRPC error → i18n key under the `Errors` namespace, or null if
// the error has no recognised structured code (callers can fall back to UNKNOWN
// or to the raw `.message` if they prefer not to swallow detail).
export function getTrpcErrorI18nKey(error: unknown): string | null {
  const code = getTrpcErrorCode(error);
  return code ? errorCodeToI18nKey(code) : null;
}
