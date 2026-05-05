export interface QueuedScoreSubmission {
  kind: 'score';
  token: string;
  competitorId: string;
  scores: Array<{ criterionId: string; value: string }>;
  idempotencyKey: string;
  queuedAt: string;
}

export interface QueuedVoteSubmission {
  kind: 'vote';
  token: string;
  matchupId: string;
  vote: 'player1' | 'player2' | 'tie';
  idempotencyKey: string;
  queuedAt: string;
}

export type QueuedSubmission = QueuedScoreSubmission | QueuedVoteSubmission;

const QUEUE_KEY_PREFIX = 'judge-queue-';

export function getQueueKey(judgeSessionId: string): string {
  return `${QUEUE_KEY_PREFIX}${judgeSessionId}`;
}

function isQueuedScoreSubmission(
  o: Record<string, unknown>,
): o is Omit<QueuedScoreSubmission, 'kind'> & { kind?: 'score' } {
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

function isQueuedVoteSubmission(
  o: Record<string, unknown>,
): o is Omit<QueuedVoteSubmission, 'kind'> & { kind: 'vote' } {
  return (
    o['kind'] === 'vote' &&
    typeof o['token'] === 'string' &&
    typeof o['matchupId'] === 'string' &&
    typeof o['idempotencyKey'] === 'string' &&
    typeof o['queuedAt'] === 'string' &&
    (o['vote'] === 'player1' || o['vote'] === 'player2' || o['vote'] === 'tie')
  );
}

function isQueuedSubmission(x: unknown): x is QueuedSubmission {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  // Default missing `kind` to 'score' for one release window so queues written
  // before Story 5.2 (which introduced the discriminator) keep draining.
  if (o['kind'] === 'vote') return isQueuedVoteSubmission(o);
  return isQueuedScoreSubmission(o);
}

function normalize(s: unknown): QueuedSubmission | null {
  if (typeof s !== 'object' || s === null) return null;
  const o = s as Record<string, unknown>;
  if (o['kind'] === 'vote') {
    return isQueuedVoteSubmission(o)
      ? ({
          kind: 'vote',
          token: o['token'] as string,
          matchupId: o['matchupId'] as string,
          vote: o['vote'] as 'player1' | 'player2' | 'tie',
          idempotencyKey: o['idempotencyKey'] as string,
          queuedAt: o['queuedAt'] as string,
        } satisfies QueuedVoteSubmission)
      : null;
  }
  // Score path (or legacy entry with no `kind`): stamp `kind` so downstream
  // code can switch on it without worrying about pre-5.2 entries.
  if (!isQueuedScoreSubmission(o)) return null;
  return {
    kind: 'score',
    token: o['token'] as string,
    competitorId: o['competitorId'] as string,
    scores: o['scores'] as Array<{ criterionId: string; value: string }>,
    idempotencyKey: o['idempotencyKey'] as string,
    queuedAt: o['queuedAt'] as string,
  } satisfies QueuedScoreSubmission;
}

export function readQueue(judgeSessionId: string): QueuedSubmission[] {
  // Empty session id would namespace the queue under `judge-queue-`, a global
  // key shared across all judges on the device. Guard against that.
  if (!judgeSessionId) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getQueueKey(judgeSessionId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((s): s is QueuedSubmission => s !== null);
  } catch {
    return [];
  }
}

function writeQueue(judgeSessionId: string, queue: QueuedSubmission[]): void {
  if (!judgeSessionId) return;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getQueueKey(judgeSessionId), JSON.stringify(queue));
  } catch {
    // QuotaExceededError or private browsing — silently drop. The submission
    // is lost, but the user already saw a "Queued" message; they can retry.
  }
}

export function enqueue(judgeSessionId: string, submission: QueuedSubmission): void {
  if (!judgeSessionId) return;
  const queue = readQueue(judgeSessionId);
  queue.push(submission);
  writeQueue(judgeSessionId, queue);
}

export function removeFirst(judgeSessionId: string): void {
  if (!judgeSessionId) return;
  const queue = readQueue(judgeSessionId);
  queue.shift();
  writeQueue(judgeSessionId, queue);
}

export function removeByIdempotencyKey(judgeSessionId: string, key: string): void {
  if (!judgeSessionId) return;
  const queue = readQueue(judgeSessionId).filter((s) => s.idempotencyKey !== key);
  writeQueue(judgeSessionId, queue);
}

export function clearQueue(judgeSessionId: string): void {
  if (!judgeSessionId) return;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getQueueKey(judgeSessionId));
  } catch {
    // private browsing or unavailable
  }
}
