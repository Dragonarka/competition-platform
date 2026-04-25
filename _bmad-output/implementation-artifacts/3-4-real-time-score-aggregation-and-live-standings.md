# Story 3.4: Real-Time Score Aggregation & Live Standings

Status: done <!-- adversarial code review pass (2026-04-24) resolved 2 HIGH + 2 MEDIUM findings -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer (and competitor watching the projected screen),
I want submitted scores to aggregate in real-time and update the live standings,
so that the competition state is always visible and current for everyone in the venue.

## Acceptance Criteria

1. Given a judge submits a score, when the server receives it, then the per-participant-per-judge score (sum of all criteria values) is computable from persisted data and the `score.submitted` domain event is already in the append-only event store (FR13, FR14, NFR11). [Data persisted in Story 3.3 — this AC validates the data is queryable for real-time aggregation.]

2. Given scores have been submitted by one or more judges for a participant, when the `getStandings` query runs, then it returns each participant's `totalScore` (sum of all criteria across all judges who scored them) and their rank (highest totalScore = rank 1) (FR15, FR16).

3. Given the live standings public URL (`/{competitionId}/standings`), when any score is submitted, then the leaderboard on that URL updates within 10 seconds via WebSocket broadcast (FR45, FR47, NFR3).

4. Given I am the organizer watching my dashboard, when scores are flowing in, then the `getStandings` query provides up-to-date data and the standings reflect the latest submitted scores without manual refresh.

5. And every score submission's idempotency is enforced (in Story 3.3) — if a judge's client retries a submission, the server deduplicates and the standings do not double-count the repeated submission.

## Tasks / Subtasks

- [x] Task 1: Add `StandingsEntry` shared type and `standings.updated` socket event (AC: #3)
  - [x] `packages/shared/types/standings.types.ts` (new) — implement `StandingsEntry` interface: `{ rank: number; competitorId: string; competitorName: string; participantId: string; totalScore: string; scoresByJudge: Record<string, string>; judgeCount: number }`. `totalScore` is always `"X.XX"` string. `scoresByJudge` maps `judgeSessionId → "X.XX"` judge total (not per-criterion breakdown — safe for public broadcast).
  - [x] `packages/shared/events/socket-event-map.ts` — add `'standings.updated': (data: import('../types/standings.types').StandingsEntry[]) => void` to `ServerToClientEvents`. Import `StandingsEntry` at top of file.
  - [x] `packages/shared/index.ts` — add `export * from './types/standings.types'`

- [x] Task 2: Implement `getStandings` tRPC public query (AC: #2, #4)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — extract `computeStandings` helper function at module level (above `createTournamentRouter`). Takes `scoreRows` (joined scores + competitors) and returns `StandingsEntry[]` (see Dev Notes for exact shape). Imports `aggregateCompetitorScores` from `@competition-platform/format-cypher-battles/scoring` with `// TODO: load from format registry` comment. Import `ScorePayload` from `@competition-platform/format-sdk`.
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add `getStandings: t.procedure.input(z.object({ competitionId: z.string().min(1) })).query(...)`:
    - Rate-limited with `PUBLIC_RL` keyed on `clientIp`
    - Queries `scores` JOINed with `competitors` filtered by `competitionId`
    - Calls `computeStandings(scoreRows)` and returns result
  - [x] Add `StandingsEntry` to imports from `@competition-platform/shared`
  - [x] `competitors` is already imported — no new import needed

- [x] Task 3: Add `broadcastStandingsUpdated` to the WebSocket gateway (AC: #3)
  - [x] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add `broadcastStandingsUpdated(competitionId: string, standings: StandingsEntry[]): void`. Import `StandingsEntry` from `@competition-platform/shared`.
  - [x] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — implement `broadcastStandingsUpdated`: emits `standings.updated` to `competition:{id}:public` room ONLY. Does NOT emit to admin room (admin gets `score.submitted` already). Import `StandingsEntry` from `@competition-platform/shared`.

- [x] Task 4: Wire standings computation and broadcast into `submitScore` (AC: #3)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — after the existing `broadcastScoreSubmitted` call (which is already post-commit), added standings recomputation and broadcast. Wrapped in try/catch — standings broadcast failure does NOT fail the mutation or error the judge.
  - [x] The standings query for broadcast runs AFTER transaction commit — always reads the latest committed data including the just-inserted score.

- [x] Task 5: Add `usePublicSocket` hook (AC: #3)
  - [x] `apps/web/src/hooks/use-public-socket.ts` (new) — anonymous Socket.IO hook:
    - Connects to `/competition` namespace WITHOUT a `token` query param (anonymous role — gateway handles this gracefully: unauthenticated clients receive `role: 'anonymous'`)
    - On connect: emits `join.public` with `{ competitionId }`
    - Listens for `standings.updated` → calls `onStandingsUpdated` callback via stable `callbackRef`
    - Tracks `connectionStatus: 'connected' | 'reconnecting' | 'disconnected'`
    - Cleanup: `socket.disconnect()` on unmount

- [x] Task 6: Implement public standings page (AC: #2, #3)
  - [x] `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` — full client component (`'use client'`):
    - Fetches initial standings via `trpc.tournament.getStandings.useQuery({ competitionId })`
    - Uses `trpc.useUtils()` to call `utils.tournament.getStandings.invalidate({ competitionId })` on socket `standings.updated` events (TanStack Query re-fetches; `setQueryData` not available in this tRPC version)
    - Uses `usePublicSocket` with `onStandingsUpdated` callback for live updates
    - Renders ranked table: rank, competitor name, participant ID, total score, judge count
    - Shows connection status dot (green/yellow/red) at top right
    - Loading state when `isLoading` is true
    - Empty state message when no scores submitted yet

- [x] Task 7: Write tests (AC: #2)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — added `tournament.getStandings` describe block with 5 tests:
    - Empty: no scores → returns `[]`
    - Single judge single competitor: sum of 2 criteria = correct `totalScore`
    - Multiple judges same competitor: cross-judge sum matches expected
    - Multiple competitors: sorted descending by `totalScore`, ranks assigned correctly
    - Rate limit: 61st request throws `TOO_MANY_REQUESTS`

- [x] Task 8: CI verification — `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — all 13 tasks pass (72 API unit tests, lint clean, typecheck clean). E2E test package pre-existing failure confirmed unrelated to this story via `git stash` verification.

## Dev Notes

### Score Aggregation Algorithm (Two-Stage)

**Stage 1 — Per judge per competitor** (computed by `aggregateCypherScore`):

```
judgeTotal = sum(criteriaScores[0].value + criteriaScores[1].value + ...)
```

**Stage 2 — Cross-judge per competitor** (computed by `aggregateCompetitorScores`):

```
competitorTotal = sum(judge1Total + judge2Total + ...)
```

Cypher Battles **sums** (does not average) judge totals. This is intentional and format-specific — if 3 judges each give 25.00, the competitor's total is 75.00.

`scoresByJudge` in `AggregatedResult` maps `judgeSessionId → "X.XX"` total. This is what goes into `StandingsEntry.scoresByJudge`. It is safe to broadcast publicly — judge identity in the socket payload is a session ID (not a real name), and only the per-judge aggregate total (not per-criterion breakdown) is exposed.

### `computeStandings` Helper (Extract as Module-Level Function)

Define above `createTournamentRouter` so it can be called from both `getStandings` and the `submitScore` broadcast path:

```typescript
// TODO: load from format registry — cypher-battles aggregation is hardcoded for MVP
import { aggregateCompetitorScores } from '@competition-platform/format-cypher-battles/src/scoring/aggregation';
import type { ScorePayload } from '@competition-platform/format-sdk';
import type { StandingsEntry } from '@competition-platform/shared';

type StandingsRow = {
  competitorId: string;
  judgeSessionId: string;
  criteriaScores: unknown;
  competitorName: string;
  participantId: string;
};

function computeStandings(scoreRows: StandingsRow[]): StandingsEntry[] {
  const byCompetitor = new Map<
    string,
    { name: string; participantId: string; payloads: ScorePayload[] }
  >();

  for (const row of scoreRows) {
    const existing = byCompetitor.get(row.competitorId) ?? {
      name: row.competitorName,
      participantId: row.participantId,
      payloads: [],
    };
    existing.payloads.push({
      judgeId: row.judgeSessionId,
      competitorId: row.competitorId,
      roundId: '', // unused by aggregateCypherScore
      scores: row.criteriaScores as { criterionId: string; value: string }[],
      idempotencyKey: '', // unused by aggregateCompetitorScores
    });
    byCompetitor.set(row.competitorId, existing);
  }

  const unsorted: Omit<StandingsEntry, 'rank'>[] = [];
  for (const [competitorId, { name, participantId, payloads }] of byCompetitor) {
    const result = aggregateCompetitorScores(payloads);
    unsorted.push({
      competitorId,
      competitorName: name,
      participantId,
      totalScore: result.totalScore,
      scoresByJudge: result.scoresByJudge,
      judgeCount: payloads.length,
    });
  }

  unsorted.sort((a, b) => parseFloat(b.totalScore) - parseFloat(a.totalScore));
  return unsorted.map((entry, i) => ({ ...entry, rank: i + 1 }));
}
```

### `getStandings` Procedure

```typescript
getStandings: t.procedure
  .input(z.object({ competitionId: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    enforceRateLimit(`getStandings:${ctx.clientIp ?? 'unknown'}`, PUBLIC_RL);
    const scoreRows = await db.db
      .select({
        competitorId: scores.competitorId,
        judgeSessionId: scores.judgeSessionId,
        criteriaScores: scores.criteriaScores,
        competitorName: competitors.name,
        participantId: competitors.participantId,
      })
      .from(scores)
      .innerJoin(competitors, eq(scores.competitorId, competitors.id))
      .where(eq(scores.competitionId, input.competitionId));
    return computeStandings(scoreRows);
  }),
```

### Standings Broadcast in `submitScore` (After Commit)

After the existing `gateway.broadcastScoreSubmitted(...)` call:

```typescript
// Broadcast aggregated standings to the public room.
// This query runs after the transaction committed — reads the latest data.
// Failure is non-critical: the mutation already succeeded; clients will
// see updated standings on next poll or WebSocket reconnect.
if (broadcastPayload !== null) {
  const competitionId = (broadcastPayload as ScoreSubmittedPayload).competitionId;
  try {
    const updatedRows = await db.db
      .select({
        competitorId: scores.competitorId,
        judgeSessionId: scores.judgeSessionId,
        criteriaScores: scores.criteriaScores,
        competitorName: competitors.name,
        participantId: competitors.participantId,
      })
      .from(scores)
      .innerJoin(competitors, eq(scores.competitorId, competitors.id))
      .where(eq(scores.competitionId, competitionId));
    gateway.broadcastStandingsUpdated(competitionId, computeStandings(updatedRows));
  } catch {
    // Standings broadcast failure is non-critical — swallow silently.
  }
}
```

### `usePublicSocket` Hook

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  StandingsEntry,
} from '@competition-platform/shared';

type PublicSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UsePublicSocketOptions {
  competitionId: string;
  onStandingsUpdated?: (standings: StandingsEntry[]) => void;
}

export function usePublicSocket({ competitionId, onStandingsUpdated }: UsePublicSocketOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const callbackRef = useRef(onStandingsUpdated);
  useEffect(() => {
    callbackRef.current = onStandingsUpdated;
  });

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const socket = io(`${apiUrl}/competition`, {
      transports: ['websocket'],
      // No token — anonymous public connection. Gateway assigns role: 'anonymous'.
    }) as PublicSocket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join.public', { competitionId });
    });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect_error', () => setConnectionStatus('reconnecting'));
    socket.on('standings.updated', (standings) => {
      callbackRef.current?.(standings);
    });

    return () => {
      socket.disconnect();
    };
  }, [competitionId]);

  return { connectionStatus };
}
```

**Note**: `callbackRef` pattern — `useEffect(() => { callbackRef.current = onStandingsUpdated; })` with no deps array runs on every render (sync, before paint), keeping the ref current without adding `onStandingsUpdated` to the socket setup effect's deps.

### Public Standings Page

```typescript
'use client';
import { useState, useEffect } from 'react';
import { use } from 'react';
import { trpc } from '@/lib/trpc';
import { usePublicSocket } from '@/hooks/use-public-socket';
import type { StandingsEntry } from '@competition-platform/shared';

const statusColors: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

export default function StandingsPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = use(params);
  const [displayedStandings, setDisplayedStandings] = useState<StandingsEntry[]>([]);
  const { data, isLoading } = trpc.tournament.getStandings.useQuery({ competitionId });
  const { connectionStatus } = usePublicSocket({ competitionId, onStandingsUpdated: setDisplayedStandings });

  useEffect(() => {
    if (data) setDisplayedStandings(data);
  }, [data]);

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="fixed top-3 right-3 flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${statusColors[connectionStatus]}`} />
        <span className="text-xs text-muted-foreground">{connectionStatus}</span>
      </div>

      <h1 className="text-2xl font-bold mb-6">Live Standings</h1>

      {isLoading && <p className="text-muted-foreground">Loading standings...</p>}

      {!isLoading && displayedStandings.length === 0 && (
        <p className="text-muted-foreground">No scores submitted yet.</p>
      )}

      {displayedStandings.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">#</th>
              <th className="text-left py-2 pr-4">Name</th>
              <th className="text-left py-2 pr-4">ID</th>
              <th className="text-right py-2 pr-4">Total</th>
              <th className="text-right py-2">Judges</th>
            </tr>
          </thead>
          <tbody>
            {displayedStandings.map((entry) => (
              <tr key={entry.competitorId} className="border-b">
                <td className="py-3 pr-4 font-bold text-xl">{entry.rank}</td>
                <td className="py-3 pr-4 font-medium">{entry.competitorName}</td>
                <td className="py-3 pr-4 text-muted-foreground text-sm">{entry.participantId}</td>
                <td className="py-3 pr-4 text-right font-mono font-bold">{entry.totalScore}</td>
                <td className="py-3 text-right text-sm text-muted-foreground">{entry.judgeCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

**Note on `params` as a Promise**: In this Next.js version, dynamic route params may be delivered as a Promise. Use `use(params)` (React's `use()` hook) to unwrap them. Check `node_modules/next/dist/docs/` for the exact convention if `use(params)` does not match the runtime — alternatives include direct destructuring `{ params: { competitionId } }` or an async server component wrapper.

### Architecture Mandate: No Auth on Public Routes

The `(public)` route group has no Clerk protection. The auth proxy (`apps/web/src/proxy.ts` — not `middleware.ts`) does not list `/{competitionId}/standings` in `isProtectedRoute`. No changes to the proxy are needed.

The root layout wraps all routes in `<ClerkProvider>` and `<TrpcProvider>`. The `TrpcProvider` uses `useAuth()` — it conditionally sends the Clerk JWT only when `token` is non-null. Unauthenticated visitors on the public standings page send no Authorization header, which is correct for public tRPC procedures.

### `broadcastStandingsUpdated` Gateway Method

Add to `competition-gateway.interface.ts`:

```typescript
broadcastStandingsUpdated(competitionId: string, standings: StandingsEntry[]): void;
```

Implementation in `competition.gateway.ts`:

```typescript
broadcastStandingsUpdated(competitionId: string, standings: StandingsEntry[]): void {
  const publicRoom = `competition:${competitionId}:public`;
  this.server.to(publicRoom).emit('standings.updated', standings);
  this.logger.log(`Broadcast standings.updated for ${competitionId} (${standings.length} entries)`);
}
```

Emits ONLY to the public room. Admin already receives per-judge raw `score.submitted` events (sufficient for the admin dashboard in Story 4.1). Keeping admin and public broadcasts separate prevents inadvertently changing admin room event shapes.

### Gotchas from Previous Stories (Still Apply)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy at `apps/web/src/proxy.ts`. Public routes are not in `isProtectedRoute` — no change needed.
2. **Scores as strings**: `totalScore` and all `scoresByJudge` values must be `"X.XX"` format. `aggregateCompetitorScores` (via `sumScores`) already returns this format.
3. **AGENTS.md warning**: Read `node_modules/next/dist/docs/` before writing any Next.js-specific patterns. `params` as `Promise` may require `use()` hook.
4. **`aggregateCompetitorScores` sums, not averages**: This is intentional for Cypher Battles. Three judges giving 25.00 each = competitor total of 75.00.
5. **`ScorePayload.roundId` and `.idempotencyKey` unused by aggregation**: Pass empty strings `''`. The `aggregateCypherScore` function only reads `payload.scores[].value`.
6. **`computeStandings` is pure**: Takes rows, returns entries. No DB calls inside. Reuse for both `getStandings` and `submitScore` broadcast without duplication.
7. **Standings broadcast is non-critical**: The mutation (`submitScore`) has already committed and responded to the judge. A standings broadcast failure (e.g., Redis/WS error) must be swallowed silently. Clients will see updated standings on next poll or socket reconnect.
8. **`competitors` already imported in `tournament.router.ts`**: No new import needed — it was added in Story 3.3.
9. **`/{competitionId}/standings` is the real URL**: The `(public)` route group does NOT add `/public/` to the URL — it is a Next.js convention for grouping routes without affecting the URL path. Epics.md refers to `/public/{competitionId}` as a conceptual label; the real URL served is `/{competitionId}/standings`. Both the epics AC and this story refer to the same feature.
10. **`usePublicSocket` vs `useJudgeSocket`**: The public hook does NOT send a `token`. The gateway's `handleConnection` branches on token presence: no token → `role = 'anonymous'`. `handlePublicJoin` accepts anonymous clients. `handleJudgeJoin` rejects them. No gateway changes needed.
11. **`socket.io-client` already a dependency**: Added in Story 3.3 (`apps/web/package.json`). No new package install needed.

### Project Structure Notes

**New files:**

```
packages/shared/types/standings.types.ts          (new — StandingsEntry interface)
apps/web/src/hooks/use-public-socket.ts           (new — anonymous public WS hook)
```

**Modified files:**

```
packages/shared/events/socket-event-map.ts        (add standings.updated to ServerToClientEvents)
packages/shared/index.ts                           (re-export standings.types)
apps/api/src/modules/websocket/competition-gateway.interface.ts  (add broadcastStandingsUpdated)
apps/api/src/modules/websocket/gateways/competition.gateway.ts   (implement broadcastStandingsUpdated)
apps/api/src/trpc/routers/tournament.router.ts    (add computeStandings helper, getStandings query, standings broadcast in submitScore)
apps/api/src/trpc/routers/tournament.router.spec.ts              (add getStandings tests)
apps/web/src/app/(public)/[competitionId]/standings/page.tsx      (full implementation from stub)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4 — FR13, FR14, FR15, FR16, FR45, FR47, NFR3, NFR11]
- [Source: \_bmad-output/planning-artifacts/architecture.md#Structure Patterns — Next.js Frontend Organization `(public)/[competitionId]/standings/`]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — Socket.IO Event Map `ServerToClientEvents`]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — State Management Patterns (TanStack Query invalidation via WebSocket)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns — Scores: String with 2 decimal places]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines — format-specific logic in `packages/formats/{format-name}/`]
- [Source: packages/formats/cypher-battles/src/scoring/aggregation.ts — `aggregateCypherScore`, `aggregateCompetitorScores`]
- [Source: packages/format-sdk/src/types/scoring.types.ts — `ScorePayload`, `AggregatedResult`]
- [Source: packages/format-sdk/src/helpers/score-utils.ts — `sumScores`]
- [Source: packages/db/schema/scoring.ts — `scores` table, `CriteriaScoreEntry` interface]
- [Source: packages/db/schema/competitors.ts — `competitors` table (name, participantId fields)]
- [Source: apps/api/src/modules/websocket/gateways/competition.gateway.ts — `handlePublicJoin` room pattern, anonymous role behavior]
- [Source: apps/api/src/trpc/routers/tournament.router.ts — `PUBLIC_RL`, `enforceRateLimit`, `computeStandings` placement, broadcast-after-commit pattern]
- [Source: _bmad-output/implementation-artifacts/3-3-judge-scoring-interface-cypher-mode.md#Dev Notes — Gotchas (proxy.ts, scores as strings, no any type)]
- [Source: _bmad-output/implementation-artifacts/3-3-judge-scoring-interface-cypher-mode.md#Code Review Fixes Round 2 — H3: broadcastScoreSubmitted admin-only, public standings scoped to 3.4]
- [Source: apps/web/src/lib/trpc.tsx — TrpcProvider with conditional Clerk auth header]
- [Source: apps/web/src/proxy.ts — isProtectedRoute list (public routes not included)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ESLint `react-hooks/set-state-in-effect` error: Initial implementation used `useEffect(() => { if (data) setState(data) }, [data])` to sync TanStack Query data into local React state. The ESLint rule flags synchronous `setState` inside effects. Fixed by using `utils.tournament.getStandings.invalidate()` in the socket callback instead — TanStack Query re-fetches and the component re-renders from the query data directly. No separate React state needed. **Superseded by adversarial review M1 fix** — now uses `utils.tournament.getStandings.setData({ competitionId }, incoming)` to write the broadcast payload directly into the cache (no re-fetch).
- `setQueryData` not available in this tRPC version: initial attempt failed typecheck. **Resolved during adversarial review**: the correct API is `setData(input, data)` (not `setQueryData`), confirmed by inspecting `@trpc/react-query@11.16.0` source at `src/shared/proxy/utilsProxy.ts`.
- `@competition-platform/format-cypher-battles/scoring` subpath export added: The `./scoring/aggregation.ts` module was not a registered package.json export. Added `"./scoring": "./src/scoring/aggregation.ts"` to both `exports` and `typesVersions` (same pattern as `./validators` from Story 3.3). Allows the API to import `aggregateCompetitorScores` without pulling in React/JSX dependencies.
- Mock gateway update: Adding `broadcastStandingsUpdated` to `ICompetitionGateway` required updating both mock objects in `tournament.router.spec.ts` (`mockGateway` at the top and `makeFullGateway()` helper).
- `makeStandingsDb` test helper: `getStandings` uses a direct `db.db.select().from().innerJoin().where()` chain without a transaction wrapper. Required a new helper that mocks `db.db` directly (not `db.db.transaction`) using the same `createLazyResult` pattern.

### Adversarial Code Review Fixes (2026-04-24)

- **H1 — Zero test coverage for `submitScore → broadcastStandingsUpdated` integration**: The valid-submission test only asserted `broadcastScoreSubmitted`; the post-commit standings broadcast was silently failing in tests (`db.db.select` undefined on the transaction-only mock) and the router's try/catch swallowed it, so the test passed green despite the broadcast never firing. Fixed: extended `makeSubmitScoreTxDb` to accept an optional `postCommitStandingsRows` parameter that wires a non-transactional `select().from().innerJoin().where()` chain on `db.db`. Added a new test `broadcasts standings.updated with aggregated leaderboard after commit` that asserts the broadcast is called with the expected competitionId and aggregated `StandingsEntry[]`. Also added `does NOT broadcast standings when submitScore returns idempotent: true` to verify idempotent retries do not double-count.
- **H2 — Malformed `criteriaScores` jsonb silently produced "NaN" totalScore**: The unsafe cast `row.criteriaScores as { criterionId: string; value: string }[]` in `computeStandings` accepted any jsonb shape. A null, undefined, or non-X.XX value would propagate through `parseFloat` → NaN → silent "NaN" totalScore on the public leaderboard with undefined sort order. Fixed: added `sanitizeCriteriaScores(raw: unknown)` that validates each entry has `criterionId: string`, `value: string`, and `value` matches `/^\d+\.\d{2}$/`. Malformed entries are dropped. `criteriaScores` not being an array returns `[]`, producing `0.00` totalScore (correct per `sumScores([])` semantics). Added test `filters malformed criteriaScores entries instead of returning "NaN" totalScore` covering: non-string values, null entries, missing fields, non-X.XX format, fully null criteriaScores column.
- **M1 — Public page invalidated cache instead of using broadcast payload**: Every `standings.updated` event triggered a full HTTP re-fetch on every viewer, discarding the payload the server already pushed. With 100 viewers × 50 submissions/min this produced ~300K requests/hour across viewers. Fixed: `page.tsx` now calls `utils.tournament.getStandings.setData({ competitionId }, incoming)` to write the payload directly into the TanStack Query cache. No HTTP round-trip per broadcast per viewer. Scales with NFR22 (50+ concurrent connections).
- **M2 — Full competition re-aggregation on every score submission**: The post-commit query in `submitScore` reads ALL score rows for the competition and re-aggregates. For 200 participants × 5 judges = 1000 rows, this is acceptable MVP behavior but will not scale. Fixed: added a detailed comment marking the future optimization (incremental per-competitor update against an in-memory or Redis standings cache). Plus a L1 fix: the try/catch now logs the error via `console.warn` instead of swallowing silently — a future regression in `computeStandings` will be visible in logs instead of invisible.
- **Tests added**: 3 new tests (H1 valid-submission broadcast, H1 idempotent-retry no-broadcast, H2 malformed-jsonb filter). Total API tests: **75** (was 72).

### File List

**New files:**

- `packages/shared/types/standings.types.ts`
- `apps/web/src/hooks/use-public-socket.ts`

**Modified files:**

- `packages/shared/events/socket-event-map.ts`
- `packages/shared/index.ts`
- `packages/formats/cypher-battles/package.json`
- `apps/api/src/modules/websocket/competition-gateway.interface.ts`
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts`
- `apps/api/src/trpc/routers/tournament.router.ts`
- `apps/api/src/trpc/routers/tournament.router.spec.ts`
- `apps/web/src/app/(public)/[competitionId]/standings/page.tsx`
