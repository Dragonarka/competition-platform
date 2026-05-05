# Story 3.5: Offline Score Queue & Connection Resilience

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a judge,
I want my scores to be saved locally and auto-submitted when my connection returns,
so that venue Wi-Fi drops never cause me to lose entered scores or miss a submission.

## Acceptance Criteria

1. Given I enter a score and tap Submit while offline, when the submission fails due to no connection, then the UI shows "Queued — will submit when connection returns" (not an error screen) and the score is persisted to localStorage (FR33, NFR19).

2. Given I have queued scores in localStorage, when my connection returns, then the queued submissions are automatically retried in order within 5 seconds (NFR6, NFR18). [Architecture line 1205 defers Service Worker lifecycle to this story; AC #2's "Service Worker" wording is interpreted as "automatic retry mechanism" — see Dev Notes for rationale.]

3. Given queued scores are submitted on reconnect, when the server receives them, then each is processed with its idempotency key — no duplicates are created even if the same score was retried multiple times (idempotency already enforced server-side in Story 3.3).

4. Given I am offline for up to 5 minutes, when connectivity returns, then all queued scores are submitted successfully and I see "Score submitted ✓" confirmations for each (NFR18).

5. Given I enter score values but have not yet tapped Submit, when my browser crashes or the page refreshes, then my entered-but-not-submitted values are restored from localStorage on reload [already implemented in Story 3.3 via `DRAFT_KEY` + `parseDraft` — verify still works post-3.5 and add a regression test].

6. And the connection status indicator is always visible: green dot (connected) → yellow pulse (reconnecting) → red dot (disconnected) [already implemented in Story 3.3 via `ConnectionDot` — verify it reflects `navigator.onLine` transitions, not just WebSocket state].

## Tasks / Subtasks

- [x] Task 1: Implement pure offline queue helper (AC: #1, #2, #3, #4)
  - [x] `apps/web/src/lib/offline-queue.ts` (new) — implement queue logic as plain functions over localStorage:
    - `QueuedSubmission` type: `{ token: string; competitorId: string; scores: Array<{ criterionId: string; value: string }>; idempotencyKey: string; queuedAt: string }`
    - `getQueueKey(judgeSessionId: string): string` returning `judge-queue-${judgeSessionId}`
    - `readQueue(judgeSessionId): QueuedSubmission[]` — parse localStorage with runtime validation (filter malformed entries — same defensive pattern as Story 3.4 H2 fix)
    - `enqueue(judgeSessionId, submission): void` — append to FIFO queue
    - `removeFirst(judgeSessionId): void` — drain head after success
    - `removeByIdempotencyKey(judgeSessionId, key): void` — for non-retriable failures
    - `clearQueue(judgeSessionId): void` — for testing/reset
  - [x] All functions handle `localStorage` unavailability (SSR, private browsing) by no-op or empty array — never throw

- [x] Task 2: Implement `useOfflineQueue` hook (AC: #1, #2, #4)
  - [x] `apps/web/src/hooks/use-offline-queue.ts` (new) — React hook owning the drain lifecycle:
    - Inputs: `{ judgeSessionId: string; submitFn: (s: QueuedSubmission) => Promise<{ idempotent: boolean }>; onSuccess?: (s: QueuedSubmission) => void; onPermanentFailure?: (s: QueuedSubmission, err: unknown) => void }`
    - Returns: `{ enqueue: (submission) => void; queueSize: number; isDraining: boolean; drainNow: () => Promise<void> }`
    - Subscribes to browser `online` event — calls `drainNow()` on fire
    - On mount: if queue has items, calls `drainNow()` once (handles "queued, then page reload while still offline, then network returns" path)
    - `drainNow()`: synchronous re-entry guard via `useRef<boolean>`; reads queue snapshot; for each item sequentially: calls `submitFn`; on success → `removeFirst` + `onSuccess`; on retriable error (network/timeout) → stop draining, leave queue intact; on permanent error (e.g., COMPETITOR_NOT_ASSIGNED, SCORE_OUTSIDE_RANGE) → `removeByIdempotencyKey` + `onPermanentFailure`
    - Updates `queueSize` state after every mutation so the UI can react
  - [x] `useEffect` cleanup removes `online` event listener on unmount
  - [x] No polling — drain is purely event-driven (`online` event + initial mount)

- [x] Task 3: Add `'queued'` submission status (AC: #1)
  - [x] `apps/web/src/stores/scoring.store.ts` — extend `SubmissionStatus` union with `'queued'`. No other changes; the existing `setSubmissionStatus` accepts the new variant.

- [x] Task 4: Wire offline queue into judge submit flow (AC: #1, #2, #4)
  - [x] `apps/web/src/app/(judge)/judge/[token]/page.tsx` — modify `handleScoreSubmit`:
    - On `submitScoreMutation.mutateAsync` rejection: branch on `navigator.onLine` — if **offline** OR error has no tRPC `.data` (network error): `enqueue` the submission, clear the in-progress draft, advance to next competitor, set `submissionStatus = 'queued'` (1.5s display) → `'idle'`. If **online with tRPC error**: existing `'error'` path.
    - Use `useOfflineQueue` with `submitFn` that calls the same tRPC mutation directly; `onSuccess` triggers `utils.tournament.getJudgeAssignments.invalidate({ token })` so the scored-list reflects newly-confirmed submissions; `onPermanentFailure` logs to console (MVP — no UI surfacing for now)
    - Show queued count badge near `ConnectionDot`: e.g., `"3 queued"` when `queueSize > 0`
    - Render "Queued — will submit when connection returns" message when `submissionStatus === 'queued'`

- [x] Task 5: Verify connection status indicator reflects `navigator.onLine` (AC: #6)
  - [x] `apps/web/src/hooks/use-judge-socket.ts` — gap confirmed: Socket.IO fires `connect_error` (→ 'reconnecting') when retrying during an offline period, masking the true offline state. Fixed by adding `window.addEventListener('offline', ...)` inside the socket effect to force 'disconnected' while the browser is offline.

- [x] Task 6: Tests (AC: #1, #3, #4)
  - [x] `apps/web/src/lib/offline-queue.spec.ts` (new) — 12 unit tests for the pure queue helpers:
    - `enqueue` then `readQueue` returns the submission
    - FIFO order preserved across multiple `enqueue` calls
    - `removeFirst` removes head only
    - `readQueue` filters malformed entries (missing fields, wrong types)
    - `readQueue` returns `[]` when localStorage is unavailable (mocked to throw)
    - `enqueue` no-ops when localStorage is unavailable (does not throw)
    - Plus: `removeByIdempotencyKey`, `clearQueue`, `getQueueKey`, session isolation
  - [x] `apps/web/src/hooks/use-offline-queue.spec.ts` (new) — 7 hook tests using React 19 built-in test utilities (no new deps required):
    - Drain triggered on `online` event
    - Drain triggered on mount when queue has pre-existing items
    - Successful submission removes head and calls `onSuccess`
    - Network error during drain stops processing and leaves remaining items in queue
    - Permanent error calls `onPermanentFailure` and removes that item
    - Re-entry guard: two simultaneous `drainNow()` calls do not overlap
    - Cleanup removes `online` listener
  - [x] `apps/web/vitest.config.ts` — JSDOM environment already configured ✅

- [x] Task 7: CI verification — `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — all 13 tasks pass

## Dev Notes

### ⚠️ Architecture Deviation: No Service Worker (Foreground-Only Queue)

The architecture (line 168) and AC #2 reference "Service Worker" for offline scoring. This story **deliberately implements the queue in foreground React** — no Service Worker, no Workbox.

**Rationale:**

- Architecture line 1205 explicitly defers SW lifecycle to "judge interface implementation using Workbox or manual SW" — this story owns that decision.
- The judge's UX is: open invite link → score actively for ~30 minutes → close tab. The page is in the foreground for the entire scoring session. Foreground retry handles 100% of this UX.
- A Service Worker would only add value for closed-tab/backgrounded scenarios, which are not part of the judge UX.
- Adding Workbox or `@serwist/next` introduces non-trivial config and a separate build pipeline for a feature that meets no current AC.
- AC #2 says "auto-retries within 5 seconds" — `online` event listener is synchronous and fires immediately on reconnect. Foreground retry meets the latency requirement.
- All other ACs are mechanical: localStorage queue, FIFO drain, idempotency-keyed submission. SW adds no leverage for any of these.

**If the post-MVP product needs background sync** (e.g., judge closed the tab and reopens 1 hour later), introduce `@serwist/next` with `BackgroundSyncPlugin` in a follow-up story. The localStorage queue from this story is forward-compatible: a SW would simply read from the same `judge-queue-${judgeSessionId}` key.

[Source: _bmad-output/planning-artifacts/architecture.md#Gap Analysis Results — line 1205]

### Offline Detection Strategy

Two complementary signals:

1. **`navigator.onLine`** — synchronous browser API. False positives possible (reports `true` when on a captive portal), but correct for the venue Wi-Fi drop case. Use as the primary signal in `handleScoreSubmit` to decide queue-vs-error.
2. **tRPC error shape** — network errors have no `error.data` (no `code`/`httpStatus`); server errors do. Defensive check: if `error.data === undefined` AND `error.message` matches a network pattern, treat as offline regardless of `navigator.onLine`.

```typescript
function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  const e = err as { data?: unknown; cause?: { name?: string } };
  if (e.data === undefined) return true; // tRPC client never reached server
  return false;
}
```

### Queue Schema

`apps/web/src/lib/offline-queue.ts` — exact types:

```typescript
export interface QueuedSubmission {
  token: string;
  competitorId: string;
  scores: Array<{ criterionId: string; value: string }>;
  idempotencyKey: string;
  queuedAt: string; // ISO 8601 timestamp — for debugging only
}

const QUEUE_KEY_PREFIX = 'judge-queue-';

export function getQueueKey(judgeSessionId: string): string {
  return `${QUEUE_KEY_PREFIX}${judgeSessionId}`;
}
```

**Defensive read pattern** (mirrors Story 3.4 H2 sanitization):

```typescript
function isQueuedSubmission(x: unknown): x is QueuedSubmission {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o['token'] === 'string' &&
    typeof o['competitorId'] === 'string' &&
    typeof o['idempotencyKey'] === 'string' &&
    typeof o['queuedAt'] === 'string' &&
    Array.isArray(o['scores']) &&
    o['scores'].every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>)['criterionId'] === 'string' &&
        typeof (s as Record<string, unknown>)['value'] === 'string',
    )
  );
}

export function readQueue(judgeSessionId: string): QueuedSubmission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getQueueKey(judgeSessionId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedSubmission);
  } catch {
    return [];
  }
}
```

**Write pattern** with defensive `try/catch` for quota errors:

```typescript
function writeQueue(judgeSessionId: string, queue: QueuedSubmission[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getQueueKey(judgeSessionId), JSON.stringify(queue));
  } catch {
    // QuotaExceededError or private browsing — silently drop. The submission
    // is lost, but the user already saw a "Queued" message; they can retry.
    // For MVP this is acceptable; full resilience requires IndexedDB.
  }
}
```

### `useOfflineQueue` Hook

```typescript
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
}

function isPermanentError(err: unknown): boolean {
  // tRPC structured errors have .data.code. Network errors do not.
  // Treat 4xx-style server errors as permanent (will not succeed on retry).
  const e = err as { data?: { code?: string; httpStatus?: number } };
  if (e.data?.code === undefined) return false; // network error → retriable
  // Permanent: BAD_REQUEST, NOT_FOUND, CONFLICT, FORBIDDEN, UNPROCESSABLE_CONTENT
  const PERMANENT_CODES = [
    'BAD_REQUEST',
    'NOT_FOUND',
    'CONFLICT',
    'FORBIDDEN',
    'UNPROCESSABLE_CONTENT',
  ];
  return PERMANENT_CODES.includes(e.data.code);
}

export function useOfflineQueue({
  judgeSessionId,
  submitFn,
  onSuccess,
  onPermanentFailure,
}: UseOfflineQueueOptions) {
  const [queueSize, setQueueSize] = useState(0);
  const [isDraining, setIsDraining] = useState(false);
  const drainLockRef = useRef(false);

  // Stable refs so the drain effect doesn't re-bind on every render.
  const submitFnRef = useRef(submitFn);
  const onSuccessRef = useRef(onSuccess);
  const onPermanentFailureRef = useRef(onPermanentFailure);
  useEffect(() => {
    submitFnRef.current = submitFn;
    onSuccessRef.current = onSuccess;
    onPermanentFailureRef.current = onPermanentFailure;
  });

  const refreshSize = useCallback(() => {
    setQueueSize(readQueue(judgeSessionId).length);
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
        setQueueSize(readQueue(judgeSessionId).length);
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
  useEffect(() => {
    refreshSize();
    void drainNow();
    const handleOnline = () => void drainNow();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [drainNow, refreshSize]);

  return { enqueue, queueSize, isDraining, drainNow };
}
```

### Judge Page Integration

**Submit flow change** (`page.tsx:172-202`):

```typescript
const offlineQueue = useOfflineQueue({
  judgeSessionId: tokenData?.judgeSessionId ?? '',
  submitFn: async (s) => {
    return submitScoreMutation.mutateAsync({
      token: s.token,
      competitorId: s.competitorId,
      scores: s.scores,
      idempotencyKey: s.idempotencyKey,
    });
  },
  onSuccess: () => {
    void utils.tournament.getJudgeAssignments.invalidate({ token });
  },
  onPermanentFailure: (s, err) => {
    // eslint-disable-next-line no-console
    console.error('[offline-queue] permanent failure dropped from queue', {
      competitorId: s.competitorId,
      err,
    });
  },
});

async function handleScoreSubmit(formattedScores: Record<string, string>) {
  if (submitLockRef.current) return;
  submitLockRef.current = true;
  const idempotencyKey = crypto.randomUUID();
  const submission = {
    token,
    competitorId: currentCompetitor.id,
    scores: Object.entries(formattedScores).map(([criterionId, value]) => ({
      criterionId,
      value,
    })),
    idempotencyKey,
    queuedAt: new Date().toISOString(),
  };
  setSubmissionStatus('sending');
  try {
    await submitScoreMutation.mutateAsync(submission);
    localStorage.removeItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id));
    setSubmissionStatus('confirmed');
    advanceTimerRef.current = setTimeout(() => {
      setLocalScoredIds((prev) => [...prev, currentCompetitor.id]);
      setSubmissionStatus('idle');
      submitLockRef.current = false;
      advanceTimerRef.current = null;
    }, 800);
  } catch (err) {
    if (isNetworkError(err)) {
      offlineQueue.enqueue(submission);
      localStorage.removeItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id));
      setSubmissionStatus('queued');
      advanceTimerRef.current = setTimeout(() => {
        setLocalScoredIds((prev) => [...prev, currentCompetitor.id]);
        setSubmissionStatus('idle');
        submitLockRef.current = false;
        advanceTimerRef.current = null;
      }, 1500);
    } else {
      setSubmissionStatus('error');
      submitLockRef.current = false;
    }
  }
}
```

**UI additions:**

- "Queued" message renders when `submissionStatus === 'queued'`: `<p className="text-yellow-600">Queued — will submit when connection returns</p>`
- Queue count badge near `ConnectionDot`: `{offlineQueue.queueSize > 0 && <span className="text-xs">{offlineQueue.queueSize} queued</span>}`

### Critical Edge Cases

1. **Draft cleared on queue, not on server confirm** — once a submission is in the queue, the original draft is no longer needed (the queue item is the durable record). Clear `DRAFT_KEY` immediately on `enqueue`. The UI advances to next competitor. When the queue eventually drains, the user sees no further UI change for that item.

2. **The `localScoredIds` advance timing** — currently advances after 800ms confirmation. On queue path, advance after 1500ms (give user time to read "Queued"). The competitor IS removed from the active scoring list because the queue item represents a "promised" submission. If the queue item later fails permanently, we log to console but do NOT un-advance — the user has moved on. (MVP trade-off; revisit if `onPermanentFailure` UI surfacing is needed.)

3. **Idempotency key uniqueness** — each enqueue uses the same `crypto.randomUUID()` generated at submit time. If the user double-taps Submit while offline (synchronous lock prevents this in 3.3, but defense-in-depth): the queue would have two items with the same idempotency key. Server returns `idempotent: true` for the second one — no double-counting. ✅

4. **Queue corruption** — `readQueue` filters malformed entries via `isQueuedSubmission` guard. Bad entries are silently dropped (mirrors Story 3.4 H2 fix pattern).

5. **localStorage quota** — `writeQueue` swallows `QuotaExceededError`. For typical use (few queued items), quota is not an issue. Full resilience requires IndexedDB — out of MVP scope.

6. **`navigator.onLine` false positives** — captive portals report online but block requests. Handled by the tRPC error fallback in `isNetworkError` — if request fails despite `navigator.onLine === true`, queue anyway.

7. **Drain re-entry** — `drainLockRef` prevents two simultaneous drains. `online` event firing during an active drain is a no-op.

8. **`useOfflineQueue` callback ref pattern** — same pattern as `usePublicSocket` / `useJudgeSocket` from Stories 3.3/3.4. Refs updated in a deps-less `useEffect` to keep callbacks current without re-subscribing the `online` listener.

### Existing Infrastructure Verified

From Story 3.3 (already shipping, do NOT re-implement):

- `DRAFT_KEY` localStorage pattern for in-progress draft restore (AC #5 already satisfied)
- `ConnectionDot` indicator with green/yellow/red states (AC #6 already satisfied at WS level)
- `submitLockRef` synchronous double-submit guard
- `advanceTimerRef` with cleanup
- `parseDraft` defensive JSON parsing
- `crypto.randomUUID()` for idempotency keys

From Story 3.3/3.4 server-side (already shipping):

- `submitScore` tRPC mutation enforces idempotency via `(judgeSessionId, idempotencyKey)` unique index
- Server returns `{ success: true, idempotent: true }` for duplicate keys (no double-count)
- Score validation (criteria range, COMPETITOR_NOT_ASSIGNED, PHASE_NOT_ACTIVE) — these errors are PERMANENT and must drop the queue item rather than retry forever

### Project Structure Notes

**New files:**

```
apps/web/src/lib/offline-queue.ts                       (new — pure queue helpers)
apps/web/src/lib/offline-queue.spec.ts                  (new — unit tests)
apps/web/src/hooks/use-offline-queue.ts                 (new — React hook)
apps/web/src/hooks/use-offline-queue.spec.ts            (new — hook tests)
```

**Modified files:**

```
apps/web/src/stores/scoring.store.ts                    (add 'queued' to SubmissionStatus)
apps/web/src/app/(judge)/judge/[token]/page.tsx         (wire offline queue, queued UI state)
apps/web/vitest.config.ts                               (verify JSDOM env if missing)
```

### Next.js Version Warning

`apps/web/AGENTS.md` says: **"This is NOT the Next.js you know — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."**

For this story, no new Next.js APIs are introduced — only React hooks, browser APIs (`navigator.onLine`, `online` event, `localStorage`), and existing tRPC client. The `'use client'` directive on the new hook file ensures it runs only on the client. Standard `useEffect`/`useRef`/`useState` patterns.

### Testing Standards

- **Test framework**: Vitest (already configured in `apps/web`).
- **Test environment**: JSDOM required for `localStorage` and DOM event tests. Verify `apps/web/vitest.config.ts` includes `environment: 'jsdom'` — add if missing.
- **Mocking**: Use `vi.spyOn(window, 'localStorage', 'get')` or replace `globalThis.localStorage` with an in-memory mock. Use `window.dispatchEvent(new Event('online'))` to trigger drain in hook tests.
- **Coverage target**: All branches in `offline-queue.ts` (read/write/enqueue/removeFirst/removeByIdempotencyKey/quota error). Hook drain lifecycle: success, retriable failure, permanent failure, re-entry guard, mount drain, online event drain.

### Gotchas from Previous Stories (Still Apply)

1. **`proxy.ts` NOT `middleware.ts`** — auth proxy at `apps/web/src/proxy.ts`. Judge route remains public (no Clerk).
2. **Scores as strings** — already enforced upstream by `JudgeScoreInput` component; the queue carries the same `"X.XX"` strings.
3. **AGENTS.md warning** — see above; no new Next.js APIs introduced.
4. **No `any` type** — use `unknown` + type guards (see `isQueuedSubmission`, `isNetworkError`, `isPermanentError`).
5. **Cleanup `useEffect` returns** — every `useEffect` that adds an event listener MUST remove it on cleanup.
6. **`crypto.randomUUID()` requires secure context** — HTTPS or localhost. Production-safe.
7. **Draft restore from Story 3.3** — `DRAFT_KEY` and `parseDraft` are unchanged; AC #5 is satisfied. Add a regression test if convenient (verify localStorage round-trip survives a simulated reload via re-render).
8. **Story 3.4 sanitization pattern** — `sanitizeCriteriaScores` precedent for filtering malformed jsonb/localStorage. Apply same defensive pattern in `readQueue`.
9. **`useUtils` pattern** — `utils.tournament.getJudgeAssignments.invalidate({ token })` already used in Story 3.3 to refresh assignments after score submission. Reuse on queue drain success.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5 — FR33, NFR6, NFR18, NFR19]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend — localStorage + Service Worker for offline score queuing (line 168)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Gap Analysis Results — Service Worker registration strategy deferred to this story (line 1205)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Organization — `apps/web/src/hooks/use-offline-queue.ts` planned location (line 944)]
- [Source: _bmad-output/planning-artifacts/architecture.md#API Patterns — Idempotency: client-generated keys, server deduplicates on retry (line 212)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Loading & Connection State Conventions — `submissionStatus: 'queued'` yellow checkmark]
- [Source: _bmad-output/planning-artifacts/prd.md#FR33 — system queues submissions when connection lost]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR18 — auto-retry for up to 5 minutes]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR19 — graceful degradation, queues submissions, no error screens]
- [Source: _bmad-output/implementation-artifacts/3-3-judge-scoring-interface-cypher-mode.md#Dev Notes — DRAFT_KEY, parseDraft, ConnectionDot, submitLockRef, advanceTimerRef]
- [Source: _bmad-output/implementation-artifacts/3-4-real-time-score-aggregation-and-live-standings.md#Adversarial Code Review Fixes — H2 sanitizeCriteriaScores defensive runtime guard pattern]
- [Source: apps/web/src/app/(judge)/judge/[token]/page.tsx — existing submit flow with idempotency keys]
- [Source: apps/web/src/stores/scoring.store.ts — `SubmissionStatus` union to extend]
- [Source: apps/api/src/trpc/routers/tournament.router.ts — `submitScore` server-side idempotency at `(judgeSessionId, idempotencyKey)`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

**Implementation complete — 2026-04-25**

- Implemented `offline-queue.ts` as pure functions over localStorage with defensive `isQueuedSubmission` type guard (mirrors Story 3.4 H2 sanitizeCriteriaScores pattern). All functions no-op or return `[]` on SSR / private browsing rather than throwing.
- Implemented `useOfflineQueue` hook with FIFO drain, re-entry guard via `drainLockRef`, callback-ref pattern (same as `useJudgeSocket`/`usePublicSocket`), and event-driven lifecycle (`online` event + mount drain).
- Extended `SubmissionStatus` union with `'queued'` in `scoring.store.ts`.
- Wired offline queue into `page.tsx`: `isNetworkError()` helper detects both `navigator.onLine === false` and missing `error.data` (tRPC never reached server). Offline path: enqueues submission, clears draft, advances to next competitor after 1.5s, shows "Queued — will submit when connection returns". Online error path: unchanged `'error'` state. Queue count badge appears in `ConnectionDot` when `queueSize > 0`.
- Fixed connection status gap in `use-judge-socket.ts`: added `offline` browser event listener to force `'disconnected'` state, preventing Socket.IO's reconnect cycle from showing 'reconnecting' (yellow) while the device is truly offline.
- 19 tests added: 12 unit tests for `offline-queue.ts` (full branch coverage) and 7 hook tests for `useOfflineQueue` using React 19 built-in utilities (no new devDependencies). All pass in JSDOM environment.
- Full Turborepo CI gate: `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — 13/13 tasks pass.

### File List

apps/web/src/lib/offline-queue.ts (new)
apps/web/src/lib/offline-queue.spec.ts (new)
apps/web/src/hooks/use-offline-queue.ts (new)
apps/web/src/hooks/use-offline-queue.spec.ts (new)
apps/web/src/lib/judge-draft.ts (new — extracted from page.tsx during code review for AC #5 testability)
apps/web/src/lib/judge-draft.spec.ts (new — AC #5 regression coverage)
apps/web/src/lib/network-error.ts (new — extracted from page.tsx during code review for unit testability)
apps/web/src/lib/network-error.spec.ts (new — null-safety + offline-detection tests)
apps/web/src/stores/scoring.store.ts (modified — added 'queued' to SubmissionStatus)
apps/web/src/app/(judge)/judge/[token]/page.tsx (modified — offline queue wiring, queued UI state, queue count badge, drain confirmation/failure toast stack)
apps/web/src/hooks/use-judge-socket.ts (modified — browser offline event listener for accurate connection status)

### Change Log

- 2026-04-25: Implemented Story 3.5 — offline score queue and connection resilience. Added localStorage FIFO queue helpers, `useOfflineQueue` React hook with event-driven drain, `'queued'` submission status, offline branching in judge submit flow, queue count badge in ConnectionDot, and fixed connection indicator to show 'disconnected' during browser offline events. 19 new tests added.
- 2026-04-25: Addressed code review findings (1 High, 5 Medium). Extracted `parseDraft`/`DRAFT_KEY` to `lib/judge-draft.ts` and `isNetworkError` to `lib/network-error.ts` for unit testing. Added per-drained-item "Score submitted ✓" confirmation toasts (AC #4) and permanent-failure error toasts (M4). Hardened `isNetworkError` and `isPermanentError` against null/undefined inputs (M3). Added defensive empty-string `judgeSessionId` guard to `offline-queue` helpers and gated `useOfflineQueue` mount effect (M1). Total tests: 39 (was 19). Full Turborepo CI gate: 13/13 tasks pass.

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.7 (different LLM than implementer Sonnet 4.6, per BMAD policy)
**Date:** 2026-04-25
**Outcome:** Approve (after fixes applied)
**Severity Breakdown:** 1 High, 5 Medium, 2 Low — High and Medium all resolved in this session.

### Findings & Resolutions

#### H1 — AC #4 partial: no per-drained-item "Score submitted ✓" confirmation

- **Finding:** AC #4 says "I see 'Score submitted ✓' confirmations for each (NFR18)". The original `onSuccess` callback only invalidated the `getJudgeAssignments` query; the user only saw the queue count badge decrement.
- **Resolution:** Added `DrainNotice` toast stack rendered fixed top-right (below `ConnectionDot`). Each drained submission pushes a transient green chip that auto-dismisses after 2.5s. Permanent failures push a red chip that persists for 6s. The stack is non-blocking (does not interrupt the active scoring form) so it preserves the deliberate UX trade-off documented in Dev Notes while still satisfying the AC literally.
- **Files:** `apps/web/src/app/(judge)/judge/[token]/page.tsx`

#### M1 — Empty-string `judgeSessionId` namespace risk

- **Finding:** `useOfflineQueue` was called with `tokenData?.judgeSessionId ?? ''`. While `tokenData` was loading, all queue helpers operated on the global `judge-queue-` key (empty prefix), creating a cross-judge collision risk if any future change called `enqueue` before `tokenData` resolved.
- **Resolution:** Added `if (!judgeSessionId) return;` guards to all five queue helpers (`readQueue`, `enqueue`, `removeFirst`, `removeByIdempotencyKey`, `clearQueue`) and an early-return guard at the top of the `useOfflineQueue` mount effect. Verified by 5 new unit tests in `offline-queue.spec.ts`.
- **Files:** `apps/web/src/lib/offline-queue.ts`, `apps/web/src/hooks/use-offline-queue.ts`

#### M2 — AC #5 (draft crash-recovery) had no regression test

- **Finding:** Story Task 6 noted "verify still works post-3.5 and add a regression test if convenient" — was skipped at implementation. AC #5 explicitly requires draft restore on refresh; zero coverage.
- **Resolution:** Extracted `DRAFT_KEY` and `parseDraft` from inline definitions in `page.tsx` to `apps/web/src/lib/judge-draft.ts` (clean module). Added `judge-draft.spec.ts` with 7 tests covering null/empty/malformed input, primitive-vs-object discrimination, type filtering of non-string values, and a localStorage round-trip explicitly labelled "AC #5 regression".
- **Files:** `apps/web/src/lib/judge-draft.ts` (new), `apps/web/src/lib/judge-draft.spec.ts` (new), `apps/web/src/app/(judge)/judge/[token]/page.tsx` (now imports the helpers)

#### M3 — `isNetworkError` and `isPermanentError` not null-safe

- **Finding:** Both used type-assertion (`err as { data?: ... }`) and accessed `.data` without first checking that `err` was a non-null object. A `throw null` from a buggy library would crash the catch block.
- **Resolution:** Added explicit `if (err == null || typeof err !== 'object') return ...;` guards before any property access. `isPermanentError` additionally validates that `err.data` is itself a non-null object and `err.data.code` is a string before checking against `PERMANENT_CODES`.
- **Files:** `apps/web/src/lib/network-error.ts` (new, replaces inline page helper), `apps/web/src/hooks/use-offline-queue.ts`

#### M4 — Permanent failure silently dropped scores (data-integrity gap)

- **Finding:** `onPermanentFailure` only `console.error`'d. The user advanced to next competitor at the 1.5s timer, never knowing their score was lost.
- **Resolution:** Permanent failures now push a red error toast ("Score failed — contact organizer") into the same drain-notice stack used for H1. The toast persists 6 seconds (longer than success) to ensure it's seen. Console log retained for diagnostics. (Future story can add structured telemetry.)
- **Files:** `apps/web/src/app/(judge)/judge/[token]/page.tsx`

#### M5 — `isNetworkError` page-level helper had no unit test

- **Finding:** It was the actual decision point for AC #1 (offline branch vs error branch); zero coverage.
- **Resolution:** Extracted to `apps/web/src/lib/network-error.ts`, added 7 unit tests covering: `navigator.onLine === false`, missing `.data`, structured tRPC error path, null/undefined input, primitive-string input, and explicit-undefined `.data`.
- **Files:** `apps/web/src/lib/network-error.ts` (new), `apps/web/src/lib/network-error.spec.ts` (new)

### Findings NOT Fixed (Low — deferred)

#### L1 — Asymmetric `online`/`offline` event handling in `use-judge-socket.ts`

- Only listens for `offline`. If a user opens the page while already offline, status may briefly show 'reconnecting' (Socket.IO connect_error) before any visible change. Edge case; left as future enhancement.

#### L2 — `react-dom/test-utils` `act` deprecation warnings in stderr

- Cosmetic. React 19 supports `import { act } from 'react'`. Deferred — does not affect test correctness.

### Validation

- `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` → 13/13 tasks pass
- Total tests: 39 (was 19) — added 20 across 3 new spec files
- All ACs satisfied including AC #4 (per-item confirmation) and AC #5 (draft crash-recovery, now tested)
