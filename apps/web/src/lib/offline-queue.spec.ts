import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  enqueue,
  readQueue,
  removeFirst,
  removeByIdempotencyKey,
  clearQueue,
  getQueueKey,
  type QueuedScoreSubmission,
  type QueuedVoteSubmission,
} from './offline-queue';

const SESSION_ID = 'test-session';

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

function makeVoteSubmission(overrides?: Partial<QueuedVoteSubmission>): QueuedVoteSubmission {
  return {
    kind: 'vote',
    token: 'tok-1',
    matchupId: 'm-1',
    vote: 'player1',
    idempotencyKey: 'vote-key-1',
    queuedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('offline-queue', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueue then readQueue returns the submission', () => {
    const sub = makeSubmission();
    enqueue(SESSION_ID, sub);
    expect(readQueue(SESSION_ID)).toEqual([sub]);
  });

  it('preserves FIFO order across multiple enqueue calls', () => {
    const a = makeSubmission({ idempotencyKey: 'a', competitorId: 'comp-a' });
    const b = makeSubmission({ idempotencyKey: 'b', competitorId: 'comp-b' });
    const c = makeSubmission({ idempotencyKey: 'c', competitorId: 'comp-c' });
    enqueue(SESSION_ID, a);
    enqueue(SESSION_ID, b);
    enqueue(SESSION_ID, c);
    expect(readQueue(SESSION_ID).map((s) => s.idempotencyKey)).toEqual(['a', 'b', 'c']);
  });

  it('removeFirst removes the head only', () => {
    const a = makeSubmission({ idempotencyKey: 'a', competitorId: 'comp-a' });
    const b = makeSubmission({ idempotencyKey: 'b', competitorId: 'comp-b' });
    enqueue(SESSION_ID, a);
    enqueue(SESSION_ID, b);
    removeFirst(SESSION_ID);
    const queue = readQueue(SESSION_ID);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.idempotencyKey).toBe('b');
  });

  it('removeByIdempotencyKey removes only the matching item', () => {
    const a = makeSubmission({ idempotencyKey: 'a', competitorId: 'comp-a' });
    const b = makeSubmission({ idempotencyKey: 'b', competitorId: 'comp-b' });
    enqueue(SESSION_ID, a);
    enqueue(SESSION_ID, b);
    removeByIdempotencyKey(SESSION_ID, 'a');
    const queue = readQueue(SESSION_ID);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.idempotencyKey).toBe('b');
  });

  it('readQueue filters malformed entries missing required fields', () => {
    const bad = { token: 'x' }; // missing competitorId, idempotencyKey, queuedAt, scores
    localStorage.setItem(
      getQueueKey(SESSION_ID),
      JSON.stringify([bad, makeSubmission({ idempotencyKey: 'good' })]),
    );
    const queue = readQueue(SESSION_ID);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.idempotencyKey).toBe('good');
  });

  it('readQueue filters entries with wrong field types', () => {
    const badScores = {
      token: 'tok-1',
      competitorId: 'comp-1',
      idempotencyKey: 'key-1',
      queuedAt: '2026-01-01T00:00:00.000Z',
      scores: [{ criterionId: 123, value: 8.5 }], // wrong types
    };
    localStorage.setItem(
      getQueueKey(SESSION_ID),
      JSON.stringify([badScores, makeSubmission({ idempotencyKey: 'good' })]),
    );
    const queue = readQueue(SESSION_ID);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.idempotencyKey).toBe('good');
  });

  it('readQueue returns [] when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(readQueue(SESSION_ID)).toEqual([]);
  });

  it('readQueue returns [] when stored value is not a JSON array', () => {
    localStorage.setItem(getQueueKey(SESSION_ID), '"not-an-array"');
    expect(readQueue(SESSION_ID)).toEqual([]);
  });

  it('enqueue does not throw when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => enqueue(SESSION_ID, makeSubmission())).not.toThrow();
  });

  it('clearQueue removes all items', () => {
    enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'x' }));
    clearQueue(SESSION_ID);
    expect(readQueue(SESSION_ID)).toEqual([]);
  });

  it('getQueueKey returns correct key for session id', () => {
    expect(getQueueKey('abc123')).toBe('judge-queue-abc123');
  });

  it('isolated sessions do not cross-contaminate', () => {
    enqueue('session-A', makeSubmission({ idempotencyKey: 'a' }));
    enqueue('session-B', makeSubmission({ idempotencyKey: 'b' }));
    expect(readQueue('session-A').map((s) => s.idempotencyKey)).toEqual(['a']);
    expect(readQueue('session-B').map((s) => s.idempotencyKey)).toEqual(['b']);
  });

  describe('discriminated submission types (Story 5.2)', () => {
    it('round-trips a vote submission', () => {
      const v = makeVoteSubmission();
      enqueue(SESSION_ID, v);
      const queue = readQueue(SESSION_ID);
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({ kind: 'vote', vote: 'player1', matchupId: 'm-1' });
    });

    it('preserves submission order across mixed score and vote entries', () => {
      enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'score-1' }));
      enqueue(SESSION_ID, makeVoteSubmission({ idempotencyKey: 'vote-1' }));
      enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'score-2' }));
      const kinds = readQueue(SESSION_ID).map((s) => `${s.kind}:${s.idempotencyKey}`);
      expect(kinds).toEqual(['score:score-1', 'vote:vote-1', 'score:score-2']);
    });

    it('treats legacy entries with no `kind` field as score submissions (back-compat)', () => {
      const legacy = {
        token: 'tok-1',
        competitorId: 'comp-1',
        scores: [{ criterionId: 'crit-1', value: '8.50' }],
        idempotencyKey: 'legacy-1',
        queuedAt: '2026-01-01T00:00:00.000Z',
      };
      localStorage.setItem(getQueueKey(SESSION_ID), JSON.stringify([legacy]));
      const queue = readQueue(SESSION_ID);
      expect(queue).toHaveLength(1);
      expect(queue[0]?.kind).toBe('score');
      expect(queue[0]?.idempotencyKey).toBe('legacy-1');
    });

    it('drops a malformed vote entry (invalid choice)', () => {
      const bad = {
        kind: 'vote',
        token: 'tok-1',
        matchupId: 'm-1',
        vote: 'invalid',
        idempotencyKey: 'bad',
        queuedAt: '2026-01-01T00:00:00.000Z',
      };
      const good = makeVoteSubmission({ idempotencyKey: 'good' });
      localStorage.setItem(getQueueKey(SESSION_ID), JSON.stringify([bad, good]));
      const queue = readQueue(SESSION_ID);
      expect(queue).toHaveLength(1);
      expect(queue[0]?.idempotencyKey).toBe('good');
    });
  });

  describe('empty judgeSessionId guard', () => {
    it('readQueue returns [] for empty session id', () => {
      expect(readQueue('')).toEqual([]);
    });

    it('enqueue is a no-op for empty session id and does not write to localStorage', () => {
      enqueue('', makeSubmission());
      // Real session can still operate normally — confirm no leakage to empty key.
      enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'real' }));
      expect(localStorage.getItem(getQueueKey(''))).toBeNull();
      expect(readQueue(SESSION_ID).map((s) => s.idempotencyKey)).toEqual(['real']);
    });

    it('removeFirst is a no-op for empty session id', () => {
      enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'a' }));
      removeFirst('');
      expect(readQueue(SESSION_ID)).toHaveLength(1);
    });

    it('removeByIdempotencyKey is a no-op for empty session id', () => {
      enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'a' }));
      removeByIdempotencyKey('', 'a');
      expect(readQueue(SESSION_ID)).toHaveLength(1);
    });

    it('clearQueue is a no-op for empty session id', () => {
      enqueue(SESSION_ID, makeSubmission({ idempotencyKey: 'a' }));
      clearQueue('');
      expect(readQueue(SESSION_ID)).toHaveLength(1);
    });
  });
});
