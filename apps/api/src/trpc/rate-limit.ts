import { TRPCError } from '@trpc/server';

interface Bucket {
  timestamps: number[];
  windowMs: number;
}

const BUCKETS = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

// Probabilistically sweep fully-expired buckets so the Map does not grow
// without bound across long-lived deployments with many distinct IPs.
function maybeSweep(now: number): void {
  if (Math.random() >= 0.02) return;
  for (const [k, b] of BUCKETS.entries()) {
    if (b.timestamps.every((ts) => now - ts >= b.windowMs)) {
      BUCKETS.delete(k);
    }
  }
}

export function enforceRateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  maybeSweep(now);
  const bucket = BUCKETS.get(key) ?? {
    timestamps: [],
    windowMs: opts.windowMs,
  };
  const fresh = bucket.timestamps.filter((ts) => now - ts < opts.windowMs);
  if (fresh.length >= opts.max) {
    BUCKETS.set(key, { timestamps: fresh, windowMs: opts.windowMs });
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
  fresh.push(now);
  BUCKETS.set(key, { timestamps: fresh, windowMs: opts.windowMs });
}

// Testing utility — not used in production code paths.
export function __resetRateLimitBuckets(): void {
  BUCKETS.clear();
}
