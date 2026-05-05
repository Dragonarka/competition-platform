import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useOfflineQueue } from './use-offline-queue';
import {
  enqueue,
  readQueue,
  type QueuedScoreSubmission,
  type QueuedSubmission,
} from '@/lib/offline-queue';

const SESSION_ID = 'hook-test-session';

function makeSubmission(overrides?: Partial<QueuedScoreSubmission>): QueuedScoreSubmission {
  return {
    kind: 'score',
    token: 'tok-1',
    competitorId: 'comp-1',
    scores: [{ criterionId: 'crit-1', value: '8.50' }],
    idempotencyKey: 'key-1',
    queuedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface HookCallbacks {
  onSuccess?: (s: QueuedSubmission) => void;
  onPermanentFailure?: (s: QueuedSubmission, err: unknown) => void;
}

/**
 * Minimal renderHook that mounts useOfflineQueue in a real React tree.
 * Tests verify behaviour through localStorage state and callback spies,
 * so we don't need to capture the hook's return value.
 */
function buildHook(
  submitFn: (s: QueuedSubmission) => Promise<{ idempotent: boolean }>,
  callbacks: HookCallbacks = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const submitRef = { fn: submitFn };
  const callbacksRef = { value: callbacks };

  const HookWrapper: FC = () => {
    useOfflineQueue({
      judgeSessionId: SESSION_ID,
      submitFn: (s) => submitRef.fn(s),
      onSuccess: (s) => callbacksRef.value.onSuccess?.(s),
      onPermanentFailure: (s, err) => callbacksRef.value.onPermanentFailure?.(s, err),
    });
    return null;
  };

  const root = createRoot(container);

  return {
    async mount() {
      await act(async () => {
        root.render(createElement(HookWrapper, null));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useOfflineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drain triggered on mount when queue has pre-existing items', async () => {
    const onSuccess = vi.fn();
    const sub = makeSubmission({ idempotencyKey: 'pre-existing' });
    enqueue(SESSION_ID, sub);

    const submitFn = vi.fn().mockResolvedValue({ idempotent: false });
    const hook = buildHook(submitFn, { onSuccess });
    await hook.mount();

    expect(submitFn).toHaveBeenCalledWith(sub);
    expect(onSuccess).toHaveBeenCalledWith(sub);
    expect(readQueue(SESSION_ID)).toHaveLength(0);

    hook.unmount();
  });

  it('drain triggered on "online" event', async () => {
    const onSuccess = vi.fn();
    const submitFn = vi.fn().mockResolvedValue({ idempotent: false });
    const hook = buildHook(submitFn, { onSuccess });
    await hook.mount();

    const sub = makeSubmission({ idempotencyKey: 'online-trigger' });
    enqueue(SESSION_ID, sub);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(submitFn).toHaveBeenCalledWith(sub);
    expect(onSuccess).toHaveBeenCalledWith(sub);
    expect(readQueue(SESSION_ID)).toHaveLength(0);

    hook.unmount();
  });

  it('successful submission removes head and calls onSuccess', async () => {
    const onSuccess = vi.fn();
    const a = makeSubmission({ idempotencyKey: 'a', competitorId: 'comp-a' });
    const b = makeSubmission({ idempotencyKey: 'b', competitorId: 'comp-b' });
    enqueue(SESSION_ID, a);
    enqueue(SESSION_ID, b);

    const submitFn = vi.fn().mockResolvedValue({ idempotent: false });
    const hook = buildHook(submitFn, { onSuccess });
    await hook.mount();

    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(readQueue(SESSION_ID)).toHaveLength(0);

    hook.unmount();
  });

  it('network error during drain stops processing and leaves remaining items', async () => {
    const a = makeSubmission({ idempotencyKey: 'a', competitorId: 'comp-a' });
    const b = makeSubmission({ idempotencyKey: 'b', competitorId: 'comp-b' });
    enqueue(SESSION_ID, a);
    enqueue(SESSION_ID, b);

    // No .data property → retriable network error
    const networkError = new Error('fetch failed');
    const submitFn = vi.fn().mockRejectedValue(networkError);
    const hook = buildHook(submitFn);
    await hook.mount();

    // Drain stopped after first failure; only one attempt made.
    expect(submitFn).toHaveBeenCalledTimes(1);
    // Both items remain since drain stopped.
    expect(readQueue(SESSION_ID)).toHaveLength(2);

    hook.unmount();
  });

  it('permanent error calls onPermanentFailure and removes that item, continues to next', async () => {
    const onSuccess = vi.fn();
    const onPermanentFailure = vi.fn();
    const a = makeSubmission({ idempotencyKey: 'a', competitorId: 'comp-a' });
    const b = makeSubmission({ idempotencyKey: 'b', competitorId: 'comp-b' });
    enqueue(SESSION_ID, a);
    enqueue(SESSION_ID, b);

    const permanentError = { data: { code: 'BAD_REQUEST', httpStatus: 400 } };
    const submitFn = vi
      .fn()
      .mockRejectedValueOnce(permanentError) // 'a' → permanent failure
      .mockResolvedValueOnce({ idempotent: false }); // 'b' → success

    const hook = buildHook(submitFn, { onSuccess, onPermanentFailure });
    await hook.mount();

    expect(onPermanentFailure).toHaveBeenCalledWith(a, permanentError);
    expect(onSuccess).toHaveBeenCalledWith(b);
    // 'a' removed by removeByIdempotencyKey, 'b' removed by removeFirst
    expect(readQueue(SESSION_ID)).toHaveLength(0);

    hook.unmount();
  });

  it('re-entry guard prevents two simultaneous drainNow calls from overlapping', async () => {
    const sub = makeSubmission({ idempotencyKey: 'overlap' });
    enqueue(SESSION_ID, sub);

    let resolveSubmit!: (v: { idempotent: boolean }) => void;
    const submitFn = vi.fn().mockImplementation(
      () =>
        new Promise<{ idempotent: boolean }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const hook = buildHook(submitFn);
    await hook.mount();

    // While first drain is in-flight, trigger another via online event.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    // submitFn called only once despite two drain triggers.
    expect(submitFn).toHaveBeenCalledTimes(1);

    // Resolve the in-flight submission.
    await act(async () => {
      resolveSubmit({ idempotent: false });
    });

    expect(readQueue(SESSION_ID)).toHaveLength(0);

    hook.unmount();
  });

  it('cleanup removes the online event listener on unmount', async () => {
    const submitFn = vi.fn().mockResolvedValue({ idempotent: false });
    const hook = buildHook(submitFn);
    await hook.mount();

    hook.unmount();

    // Populate queue after unmount then fire online — should not trigger submitFn.
    const sub = makeSubmission({ idempotencyKey: 'after-unmount' });
    enqueue(SESSION_ID, sub);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(submitFn).not.toHaveBeenCalled();
  });
});
