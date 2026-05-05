'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enqueue as enqueueToStorage,
  readQueue,
  removeFirst,
  removeByIdempotencyKey,
  type QueuedSubmission,
} from '@/lib/offline-queue';

interface UseOfflineQueueOptions {
  judgeSessionId: string;
  submitFn: (s: QueuedSubmission) => Promise<{ idempotent: boolean }>;
  onSuccess?: (s: QueuedSubmission) => void;
  onPermanentFailure?: (s: QueuedSubmission, err: unknown) => void;
  onQueueSizeChanged?: (size: number) => void;
}

function isPermanentError(err: unknown): boolean {
  // tRPC structured errors have .data.code. Network errors do not.
  // Permanent: 4xx server errors that will not succeed on retry.
  if (err == null || typeof err !== 'object') return false;
  const e = err as { data?: unknown };
  if (e.data == null || typeof e.data !== 'object') return false;
  const data = e.data as { code?: unknown };
  if (typeof data.code !== 'string') return false;
  const PERMANENT_CODES = [
    'BAD_REQUEST',
    'NOT_FOUND',
    'CONFLICT',
    'FORBIDDEN',
    'UNPROCESSABLE_CONTENT',
  ];
  return PERMANENT_CODES.includes(data.code);
}

export function useOfflineQueue({
  judgeSessionId,
  submitFn,
  onSuccess,
  onPermanentFailure,
  onQueueSizeChanged,
}: UseOfflineQueueOptions) {
  const [queueSize, setQueueSize] = useState(0);
  const [isDraining, setIsDraining] = useState(false);
  const drainLockRef = useRef(false);

  // Stable refs so the drain effect doesn't re-bind on every render.
  const submitFnRef = useRef(submitFn);
  const onSuccessRef = useRef(onSuccess);
  const onPermanentFailureRef = useRef(onPermanentFailure);
  const onQueueSizeChangedRef = useRef(onQueueSizeChanged);
  useEffect(() => {
    submitFnRef.current = submitFn;
    onSuccessRef.current = onSuccess;
    onPermanentFailureRef.current = onPermanentFailure;
    onQueueSizeChangedRef.current = onQueueSizeChanged;
  });

  const refreshSize = useCallback(() => {
    const size = readQueue(judgeSessionId).length;
    setQueueSize(size);
    onQueueSizeChangedRef.current?.(size);
  }, [judgeSessionId]);

  const drainNow = useCallback(async () => {
    if (drainLockRef.current) return;
    drainLockRef.current = true;
    setIsDraining(true);
    try {
      while (true) {
        const queue = readQueue(judgeSessionId);
        if (queue.length === 0) break;
        const head = queue[0]!;
        try {
          await submitFnRef.current(head);
          removeFirst(judgeSessionId);
          onSuccessRef.current?.(head);
        } catch (err) {
          if (isPermanentError(err)) {
            removeByIdempotencyKey(judgeSessionId, head.idempotencyKey);
            onPermanentFailureRef.current?.(head, err);
            continue; // try next item
          }
          // Retriable error — stop draining; next online event retries.
          break;
        }
        const remaining = readQueue(judgeSessionId).length;
        setQueueSize(remaining);
        onQueueSizeChangedRef.current?.(remaining);
      }
    } finally {
      drainLockRef.current = false;
      setIsDraining(false);
      refreshSize();
    }
  }, [judgeSessionId, refreshSize]);

  const enqueue = useCallback(
    (submission: QueuedSubmission) => {
      enqueueToStorage(judgeSessionId, submission);
      refreshSize();
    },
    [judgeSessionId, refreshSize],
  );

  // Drain on mount (recover from prior session) + on reconnect.
  // Gate on a non-empty judgeSessionId — the page hook is initialised with
  // `tokenData?.judgeSessionId ?? ''` and we don't want to operate on the
  // global empty-prefix key while the token is still loading.
  useEffect(() => {
    if (!judgeSessionId) return;
    refreshSize();
    void drainNow();
    const handleOnline = () => void drainNow();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [drainNow, refreshSize, judgeSessionId]);

  return { enqueue, queueSize, isDraining, drainNow };
}
