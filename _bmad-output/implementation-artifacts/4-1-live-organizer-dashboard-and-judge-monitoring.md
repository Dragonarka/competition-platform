# Story 4.1: Live Organizer Dashboard & Judge Monitoring

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want a live mission control dashboard showing the full competition state and every judge's submission status,
so that I can glance at the screen and know exactly what's happening — and spot problems — in under 3 seconds.

## Acceptance Criteria

1. Given a competition is in progress, when I view my organizer dashboard, then I see the current phase, all incoming scores in real-time, current standings, and the count of pending vs submitted scores per judge group (FR36).

2. Given I am watching the dashboard, when a judge's WebSocket connection drops, then their status immediately changes to "Disconnected" with a yellow warning indicator — no page refresh needed (FR37).

3. Given a judge has a pending unsubmitted score (offline queue is non-empty), when I view the dashboard, then I see a "1 pending score" (or "N pending") badge on that judge's status card.

4. Given a judge reconnects after a drop, when their queued scores auto-submit, then their status returns to "Connected" and the pending badge clears automatically.

5. Given the dashboard page, when it loads, then the static shell appears in under 2 seconds (PPR) and live data streams in via WebSocket (NFR5).

6. And the dashboard uses stat cards and KPI indicators for score counts, judge status, and phase progression — status colors (green/yellow/red) are used only for system state, never for branding. [Architecture deviation: this story implements KPI cards with shadcn `<Card>` primitives instead of `@tremor/react`. See Dev Notes for rationale.]

7. Given an unauthorized client attempts `join.admin` for a competition, when the WebSocket handshake completes, then the gateway rejects the join (currently it rejects all admin joins per the Story 3.x stub) — organizer auth via Clerk JWT must succeed before the admin room is joined.

## Tasks / Subtasks

- [x] Task 1: WebSocket admin authentication (AC: #1, #2, #5, #7)
  - [ ] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — extend `handleConnection` to also accept an organizer Clerk JWT via `client.handshake.auth.clerkToken` (or `query.clerkToken` as fallback for transports that strip auth headers). Validate via `@clerk/backend` `verifyToken` using the same pattern as `apps/api/src/trpc/trpc.context.ts` (or equivalent existing context).
  - [ ] On successful organizer auth: set `client.data.role = 'organizer'`, `client.data.organizerClerkId = sub` (the Clerk user id from the JWT).
  - [ ] Replace the rejection in `handleAdminJoin` (line 113-123) with proper validation:
    - `client.data.role` must be `'organizer'`.
    - Verify the organizer owns the competition: `SELECT id FROM competitions WHERE id = $1 AND organizer_clerk_id = $2`. Reject if zero rows.
    - On success: `client.join('competition:${competitionId}:admin')` AND emit a one-shot `dashboard.snapshot` event (see Task 5) with the current state.
  - [ ] On disconnect: existing `handleDisconnect` is sufficient — Socket.IO automatically leaves all rooms.
  - [ ] Reuse the existing JWT verification helper if one exists; otherwise add a thin `verifyClerkJwt(token)` helper to `apps/api/src/modules/auth/` (new module) that returns `{ sub: string } | null`.

- [x] Task 2: Judge presence + status tracking on the gateway (AC: #2, #3, #4)
  - [ ] Add to `competition.gateway.ts` an in-memory presence map: `private readonly judgePresence = new Map<string, Map<string, JudgeLiveStatus>>();` keyed by `competitionId → judgeSessionId → status`.
  - [ ] `JudgeLiveStatus` type (define in `packages/shared/types/judge-live-status.ts`, NEW):
    ```ts
    export interface JudgeLiveStatus {
      judgeSessionId: string;
      label: string;
      groupIndex: number | null;
      connected: boolean;
      queueSize: number; // count of items in the judge's offline queue
      lastSeenAt: string; // ISO 8601 — updated on every status emission
    }
    ```
  - [ ] On judge `handleConnection`: insert/update entry with `connected: true, queueSize: 0`.
  - [ ] On judge `handleDisconnect`: set `connected: false`. Do NOT delete the entry — the dashboard wants to see disconnected judges.
  - [ ] Broadcast helper: `broadcastJudgeStatusChanged(competitionId, status)` emits `'judge.status-changed'` to the admin room only. Same boundary discipline as `broadcastScoreSubmitted` (admin-room-only — judge identity is sensitive).
  - [ ] Memory-leak guard: when a competition's status transitions to `'completed'` or `'archived'`, the gateway clears its presence map for that competitionId. Hook this in via a method `clearPresence(competitionId)` called from the relevant tRPC mutations OR from a domain event. For MVP, just call `clearPresence` from within `tournament.completeCypherPhase` (Story 3.6) — but since 3.6 is also pending, document it as a follow-up task to wire up. Story 4.1 scope includes the helper + initial call site after Story 3.6 lands.

- [x] Task 3: Judge → server status emission (AC: #3, #4)
  - [ ] Extend `ClientToServerEvents` in `packages/shared/events/socket-event-map.ts`:
    ```ts
    'judge.status': (data: { competitionId: string; sessionId: string; queueSize: number }) => void;
    ```
  - [ ] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — add `@SubscribeMessage('judge.status')` handler:
    - Validate `client.data.role === 'judge'` AND `client.data.judgeSessionId === data.sessionId` AND `client.data.competitionId === data.competitionId`. Same auth boundary as `handleJudgeJoin`.
    - Look up the existing presence entry. Update `queueSize` and `lastSeenAt`. If entry missing (handshake without join.judge yet), no-op.
    - Call `broadcastJudgeStatusChanged(competitionId, updatedStatus)`.
  - [ ] `apps/web/src/hooks/use-offline-queue.ts` — add an optional `onQueueSizeChanged?: (size: number) => void` callback that fires whenever `setQueueSize` is called. The judge page wires this to `socket.emit('judge.status', { ... })`.
  - [ ] `apps/web/src/app/(judge)/judge/[token]/page.tsx` — pass `onQueueSizeChanged` into `useOfflineQueue` and on each fire, emit `judge.status` via the existing socket from `useJudgeSocket`. Surface the `socket` reference via `useJudgeSocket` (currently returns `socketRef`; verify it's exposed).

- [x] Task 4: Server → admin broadcast on score submission (AC: #1)
  - [ ] **Already exists** in `apps/api/src/modules/websocket/gateways/competition.gateway.ts:155-168` (`broadcastScoreSubmitted` to admin room). Reuse as-is. The dashboard subscribes to this event and increments the per-group `submittedCount` KPI.
  - [ ] **Already exists**: `broadcastStandingsUpdated` (line 170-180) — public room. Dashboard ALSO subscribes (admin room could subscribe too, but cheaper to just join the public room from the admin client OR have the dashboard hook listen on both rooms). For consistency, also emit `'standings.updated'` to the admin room. Update `broadcastStandingsUpdated` to emit to BOTH `:admin` and `:public` rooms. (Single addition; no breaking change.)

- [x] Task 5: tRPC query — `tournament.getDashboardSnapshot` (AC: #1, #5)
  - [ ] Schema in `packages/shared/validation/competition.schema.ts`:
    ```ts
    export const getDashboardSnapshotSchema = z.object({
      competitionId: z.string().min(1),
    });
    ```
  - [ ] `apps/api/src/trpc/routers/tournament.router.ts` — new `protectedProcedure`:
    - RLS transaction (`SET LOCAL session.current_organizer_id`).
    - Verify ownership (explicit SELECT, throw `NOT_FOUND` if absent).
    - Return:
      ```ts
      {
        competitionId: string;
        competitionName: string;
        status: CompetitionStatus;
        currentPhase: 'configuration' | 'cypher' | 'cypher-review' | 'battles' | 'completed';
        // judges: live status from gateway + DB join
        judges: Array<{ judgeSessionId; label; groupIndex; connected; queueSize; lastSeenAt; submittedCount; expectedCount }>;
        // KPI rollups
        totalScoresSubmitted: number;
        totalScoresExpected: number;
        scoresByGroup: Array<{ groupIndex; submitted; expected }>;
        // current standings (top 10 for the dashboard preview; full list via getStandings)
        topStandings: StandingsEntry[];
      }
      ```
    - **`currentPhase` derivation**: derived from `competitions.status` + `cypherCompletedAt` (Story 3.6 column):
      - `status === 'draft'` → `'configuration'`
      - `status === 'active' && cypherCompletedAt === null` → `'cypher'`
      - `status === 'active' && cypherCompletedAt !== null` → `'cypher-review'`
      - `status === 'completed'` → `'completed'`
      - (Battles state added in Epic 5.)
    - Live presence comes from the gateway's in-memory map. Inject the gateway via NestJS DI (it's already injected into the router via `gateway` parameter pattern). Add `getJudgePresence(competitionId): JudgeLiveStatus[]` method to the gateway.
    - For judges with no presence entry yet (never connected since API restart), default to `connected: false, queueSize: 0, lastSeenAt: null`.
  - [ ] **DOES NOT** need rate limiting — protectedProcedure already gates on auth.

- [x] Task 6: Admin WebSocket hook — `useAdminSocket` (AC: #1, #2, #3, #4, #7)
  - [ ] `apps/web/src/hooks/use-admin-socket.ts` (new — mirror `use-judge-socket.ts` shape):
    ```ts
    interface UseAdminSocketOptions {
      competitionId: string;
      onScoreSubmitted?: (p: ScoreSubmittedPayload) => void;
      onStandingsUpdated?: (s: StandingsEntry[]) => void;
      onJudgeStatusChanged?: (s: JudgeLiveStatus) => void;
      onPhaseTransitioned?: (p: PhaseTransitionedPayload) => void;
      onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
    }
    ```
  - [ ] Same `optsRef` callback-ref pattern as Story 3.3/3.5. Cleanup on unmount removes listeners.
  - [ ] On `connect`: emits `join.admin { competitionId }` with the Clerk session token. Use `useAuth().getToken()` from `@clerk/nextjs` to fetch the JWT, pass via `io(url, { auth: { clerkToken } })` at socket creation (NOT later — Socket.IO auth is set at handshake).
  - [ ] If `getToken()` returns null (logged out), do NOT establish the socket. Render an auth-required state in the dashboard.

- [x] Task 7: Frontend live dashboard route (AC: #1, #5, #6)
  - [ ] `apps/web/src/app/(admin)/competitions/[id]/live/page.tsx` (NEW route — keeps the existing `[id]/page.tsx` configuration view intact):
    - Server component (default). Renders the static shell: page heading, KPI card SKELETONS, judge grid SKELETON. This is the PPR static portion.
    - Suspense-bounded client island for live data: `<DashboardLiveIsland competitionId={id} />`.
    - Top of file: `export const experimental_ppr = true;` (Next.js 16 PPR opt-in per-route).
  - [ ] `apps/web/next.config.ts` — add:
    ```ts
    experimental: { ppr: 'incremental' },
    ```
    Per-route opt-in via `experimental_ppr = true` is the safer rollout. Verify `next.config.ts` keeps the existing rewrites.
  - [ ] `apps/web/src/components/admin/dashboard-live-island.tsx` (NEW client component, `'use client'`):
    - Calls `trpc.tournament.getDashboardSnapshot.useQuery({ competitionId })`.
    - Calls `useAdminSocket({ competitionId, onScoreSubmitted, onStandingsUpdated, onJudgeStatusChanged, ... })`.
    - On `onScoreSubmitted`: invalidate `getDashboardSnapshot` (or `setData` to update the score counts directly, mirror Story 3.4 pattern).
    - On `onJudgeStatusChanged`: `utils.tournament.getDashboardSnapshot.setData({ competitionId }, (prev) => updateJudgeInList(prev, status))`.
    - On `onStandingsUpdated`: same direct cache write as the public standings page.
    - Renders KPI cards + judge grid + scrolling-recent-scores feed (last 10).
  - [ ] `apps/web/src/components/admin/dashboard-kpi-cards.tsx` (NEW): plain shadcn `<Card>` based stat cards. Each card has: title, big-number value, subtitle, and an optional status-color dot. Cards: Phase, Total Scores Submitted (X / Y), Connected Judges (X / Y), Average Score Time (deferred — placeholder for now). NO chart library.
  - [ ] `apps/web/src/components/admin/dashboard-judge-grid.tsx` (NEW): grid of judge cards. Each card: judge label, group index badge, status dot (green/yellow/red), pending-queue badge if `queueSize > 0`, last-seen timestamp.
  - [ ] `apps/web/src/components/admin/dashboard-recent-scores.tsx` (NEW): scrolling list of last 10 score submissions. Each entry: judge label, competitor name, total raw score, timestamp. Updated via the `onScoreSubmitted` handler.

- [x] Task 8: Dashboard navigation entry (AC: #1)
  - [ ] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — add a primary action link near the top: when `competition.status === 'active'`, render a `<Link href={\`/competitions/${id}/live\`}>`styled as a button using`buttonVariants()`(NOT`<Button asChild>`—`@base-ui/react`does not support that). Link text:`"Open Live Dashboard →"`.

- [x] Task 9: Connection status indicator on dashboard (AC: #2, #5)
  - [ ] Reuse the `STATUS_COLORS` pattern from `apps/web/src/app/(public)/[competitionId]/standings/page.tsx`. Render a fixed top-right indicator showing dashboard's WebSocket state to the admin server (separate from per-judge presence).

- [x] Task 10: Tests (AC: #1, #2, #3, #4, #7)
  - [ ] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add at minimum:
    - **Auth**: `caller(null).tournament.getDashboardSnapshot({ competitionId: 'x' })` → `UNAUTHORIZED`.
    - **Zod**: empty `competitionId` → `BAD_REQUEST`.
    - **Ownership**: organizer A querying organizer B's competition → `NOT_FOUND` (RLS).
    - **Snapshot shape**: happy path returns all required keys with correct types.
    - **`currentPhase` derivation**: 4 cases (draft, cypher, cypher-review, completed) match the table above.
    - **Presence merging**: gateway returns one connected + one disconnected judge → snapshot reflects both with correct `connected` flag.
  - [ ] `apps/api/src/modules/websocket/gateways/competition.gateway.spec.ts` (NEW) — gateway-level tests:
    - `handleConnection` accepts a valid Clerk JWT and sets `role='organizer'`.
    - `handleConnection` rejects an invalid JWT.
    - `handleAdminJoin` allows the organizer who owns the competition.
    - `handleAdminJoin` rejects an organizer who doesn't own the competition.
    - `handleAdminJoin` rejects a `role='judge'` client.
    - `handleAdminJoin` rejects a `role='anonymous'` client.
    - `handleJudgeStatus` updates the presence map and broadcasts to admin room.
    - `handleJudgeStatus` rejects when judgeSessionId mismatches `client.data.judgeSessionId`.
    - `broadcastJudgeStatusChanged` emits ONLY to the admin room (not public — verify spectators don't see judge identities).
    - Use a mocked `Server` (Socket.IO server) via `vi.fn()` — same pattern as existing gateway tests if they exist.
  - [ ] `apps/web/src/hooks/use-admin-socket.spec.ts` (NEW — pattern from Story 3.5 hook tests; React 19 + react-dom/test-utils, no `@testing-library/react`):
    - Mocks `socket.io-client` with a fake socket that emits/captures events.
    - Verifies `join.admin` is emitted on connect with the supplied Clerk token.
    - Verifies `onJudgeStatusChanged` is invoked when the fake socket emits `judge.status-changed`.
    - Verifies cleanup removes all listeners on unmount.
  - [ ] **Defer to manual QA**: PPR shell render (<2s) — measured via Lighthouse / WebPageTest. Add a story DoD note: `pnpm dev`, navigate, observe shell timing. Not automatable in unit tests.

- [x] Task 11: CI verification — `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — all pass.

## Dev Notes

### ⚠️ Architecture Deviation: NO `@tremor/react` (hand-rolled KPI cards)

AC #6 (and architecture line 122) calls for **Tremor** stat cards and KPI indicators. Tremor is **not installed** (`apps/web/package.json` confirms — no `@tremor/react`). Per `_bmad-output/project-context.md`: _"No new dependencies without explicit user approval. Epic 2 shipped 12 FRs + 5 stories with zero new runtime deps after Story 2.1."_

**Decision: implement KPI cards with the existing shadcn `<Card>` primitives.**

**Rationale:**

- AC #6 requires "stat cards and KPI indicators... status colors green/yellow/red". This is a UI shape requirement, not a library requirement.
- The architecture's mention of Tremor is aspirational; it predates the no-new-deps discipline established during Epic 2.
- Tremor v3 (the open-source library) adds ~50 KB gzipped; for the admin dashboard this is acceptable but unnecessary for AC #6's actual content (numbers in cards).
- All current dashboard needs are met by `<Card>` + Tailwind utility classes.
- A future story (e.g., 6.x presenter view, or a dedicated analytics story) can introduce a chart library when actual charts are required.

**Forward compatibility:** if/when charts are added, switch to either `@tremor/react` OR `recharts` (via shadcn-charts). The KPI card components built here are independent of any charting choice.

[Source: _bmad-output/planning-artifacts/architecture.md#Stack — line 122 (Tremor as planned UI library); _bmad-output/project-context.md — no new deps rule]

### Admin WebSocket Authentication Strategy

Currently `competition.gateway.ts:113-123` rejects ALL `join.admin` attempts with the comment _"organizer WS auth not implemented (story 4.1)"_. This story owns that wiring.

**Approach:** validate the Clerk JWT at the WebSocket handshake (NOT on the join.admin message). Reasons:

- Same as the judge auth pattern (`handleConnection` validates the token before any room joins). Consistency.
- Guards do not fire on the WS upgrade itself; only on `@SubscribeMessage` handlers. So mid-connection auth would be too late.
- An unauthenticated socket sitting on the namespace consumes broadcasts even without joining a room (Socket.IO leaks them at the namespace level if the server emits to namespace rather than room — though our gateway uses room-targeted emits, so the actual leakage is bounded).

**Token transport:** Socket.IO supports `auth: { clerkToken: '...' }` in the client `io()` call. The server reads it from `client.handshake.auth.clerkToken`. Some proxies/transports strip query strings but preserve handshake auth — auth field is the right place. Fall back to `query.clerkToken` for testing if needed.

**Token validation:** use `@clerk/backend` `verifyToken({ token, jwtKey })` with the same env-var-supplied JWKS as the tRPC HTTP context. The user id is `payload.sub`.

**Subsequent `join.admin` validation:** even after handshake auth, verify the organizer owns the requested `competitionId` before joining the admin room. RLS does NOT apply to in-memory rooms; the explicit ownership SELECT is mandatory.

### Judge Presence: In-Memory Now, Redis Later

The gateway uses an in-memory `Map<competitionId, Map<judgeSessionId, JudgeLiveStatus>>`. This works for a single-instance API.

**MVP scope:** in-memory only. Document the limitation in code comments and the story File List.

**Post-MVP:** when scaling to multi-instance Fly.io machines (architecture line 188 — "Redis scoped to real-time state"), move presence to Redis with a TTL'd hash per competition. The gateway interface stays identical; only the implementation swaps.

**Reconnect semantics:** on API restart, the in-memory map is cleared. The dashboard's first fetch via `getDashboardSnapshot` will show all judges as `connected: false`. Within seconds, judges reconnect (Socket.IO auto-reconnect from Story 3.x), repopulate the map, and `judge.status-changed` events flow. This is acceptable — it matches venue Wi-Fi reality where short-window blackouts happen.

### PPR (Partial Prerendering) Setup

Next.js 16 PPR is in `experimental` mode. Two flags:

1. **Project-level**: `next.config.ts` → `experimental: { ppr: 'incremental' }`. This enables PPR globally but in opt-in mode (no route uses PPR unless it explicitly opts in).
2. **Per-route**: at the top of the route's `page.tsx` server component → `export const experimental_ppr = true;`.

**For Story 4.1:** enable both. Apply only to `/competitions/[id]/live/page.tsx`. Other routes remain unaffected.

**The static shell:** the server component renders skeleton cards + judge grid skeleton + page heading. These render at build time / SSR. The dynamic island (`<DashboardLiveIsland>`) is wrapped in `<Suspense>`; it streams in after the initial paint.

**Verification:** `pnpm dev`, visit `/competitions/[id]/live`, observe DevTools Network panel → initial HTML response should include the skeleton; subsequent streaming chunks deliver the live content. Lighthouse First Contentful Paint should be <2s on a 3G profile.

[Source: Next.js 16 PPR docs — `apps/web/node_modules/next/dist/docs/...` per AGENTS.md warning. Read these BEFORE writing PPR code.]

### Data Flow Summary

```
[Judge browser]                  [API gateway]                     [Admin dashboard]
─────────────────                ────────────────                  ────────────────────
useOfflineQueue → ─ judge.status (WS) ─→ Map<…>.set(jSId, status)
                                       └─ broadcast 'judge.status-
                                          changed' to admin room ─→ useAdminSocket → setData → KPI re-render

submitScore (tRPC) ─ POST /trpc → router → INSERT scores
                                       │  └─ broadcast 'score.submitted' (admin) ─→ useAdminSocket → recent-scores feed
                                       │  └─ broadcast 'standings.updated' (admin+public) ─→ useAdminSocket → top-standings re-render
                                       └─ events INSERT (audit trail)

Initial dashboard load:
  page.tsx (server) → static shell (PPR)
  └─ <Suspense> → DashboardLiveIsland (client)
       ├─ trpc.getDashboardSnapshot → DB read + gateway.getJudgePresence
       └─ useAdminSocket('connect' → emit join.admin { competitionId, clerkToken })
                                       │
                                       └─ gateway.handleAdminJoin → ownership SELECT → join admin room
```

### Existing Infrastructure (Verified — DO NOT re-implement)

From Story 3.2 (already shipping):

- `broadcastCompetitionStarted(competitionId, payload)` to admin + public rooms.

From Story 3.3 (already shipping):

- `judgeSessions` table with `groupIndex`. Use `groupIndex` to group judges in the dashboard UI.
- `useJudgeSocket` hook (template for `useAdminSocket`).

From Story 3.4 (already shipping):

- `broadcastScoreSubmitted` admin-room-only (line 155-168 — already implemented). DO NOT re-implement.
- `broadcastStandingsUpdated` public-room-only — extend to admin room as Task 4 specifies.
- `getStandings` query, `StandingsEntry` type, `computeStandings` helper. Reuse.

From Story 3.5 (already shipping):

- `useOfflineQueue` hook with `queueSize` state. Add `onQueueSizeChanged` callback prop (Task 3).
- React 19 + `react-dom/test-utils` testing pattern (no `@testing-library/react` dep).

From Story 3.6 (in flight):

- `competitions.cypherCompletedAt` column. Use for `currentPhase` derivation. If 3.6 hasn't shipped when 4.1 development starts, treat the column as nullable and skip the `cypher-review` phase derivation — falls back to `cypher` for `status='active'`.
- `phase.transitioned` event (admin should see this; `useAdminSocket` includes `onPhaseTransitioned`).

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md` (read this BEFORE writing code):

1. **`postgres-js` runtime, `pg` is devDep only.**
2. **`updatedAt: new Date()`** on every UPDATE. Not relevant here (no mutations except on existing tables).
3. **`SET LOCAL session.current_organizer_id`** mandatory inside any DB-touching protected procedure.
4. **Explicit ownership SELECT** before reading or mutating competition-scoped data. RLS filters silently; the explicit check produces useful `NOT_FOUND`.
5. **Auth test required** for new protectedProcedure: `caller(null)` → `UNAUTHORIZED`.
6. **Zod validation test required** for new schema.
7. **Scores stored as `'X.XX'` strings.** Recent-scores feed displays the string as-is (no `parseFloat`).
8. **`@base-ui/react`, NOT Radix.** `<Button asChild>` does NOT exist. Use `buttonVariants()` className helper on `<Link>`.
9. **`proxy.ts` not `middleware.ts`** for the auth proxy. Already in place.
10. **Event-store immutability** — no UPDATE/DELETE on events table.
11. **TanStack Query v5**: `useQuery` does NOT support `onSuccess`/`onError`. Derive from `data` directly OR use `useEffect`. For hot-update via socket events: `utils.tournament.getDashboardSnapshot.setData(input, updater)` is the right pattern (mirrors Story 3.4 standings).
12. **`react-hooks/set-state-in-effect`** lint rule fires when initializing form state from async query data inside `useEffect`. Use the split-component / `key={data.id}` pattern OR derive directly.
13. **No new top-level dependencies** without user approval. This story explicitly does NOT install Tremor or Recharts.
14. **`'use client'` directive** on the new client island and the `useAdminSocket` hook file.
15. **WebSocket auth at handshake** for sensitive data flow. See "Admin WebSocket Authentication Strategy" above.
16. **`crypto.randomUUID()`** requires secure context (HTTPS or localhost). Not relevant here (no new randomness needed).
17. **Idempotency keys** are scoped to score submission; the dashboard uses none.

### Critical Edge Cases

1. **Organizer JWT expires while dashboard is open** — Clerk JWTs expire after 15 min (NFR9). The Socket.IO connection survives, but a server restart + reconnect would fail handshake auth. Handle: `useAdminSocket` watches `useAuth().getToken()` reactively; on token refresh, dispose+recreate the socket. For MVP, document the gap as `if (auth state changes) { trigger socket reconnect with new token }` — implementation detail.

2. **Judge has multiple tabs open** — `judge-token` URLs are publicly shareable; nothing stops a judge from opening two tabs. Each tab's socket is a separate `client.id`. Both call `handleConnection` and end up with the SAME `judgeSessionId` in `client.data.judgeSessionId`. Both call `broadcastJudgeStatusChanged`. The presence map would alternate between their two reports. Mitigation: store `Map<judgeSessionId, JudgeLiveStatus>` (last-write-wins). The dashboard sees the most recent emission. Acceptable.

3. **Disconnect while score is in-flight** — judge submits, network drops between request send and response. The score IS persisted server-side (per Story 3.5 idempotency). The judge's `submissionStatus` may be 'queued' or 'sending'. Their queue might briefly show size 1 (the in-flight) then 0 (drained). Dashboard reflects whatever the judge last emitted via `judge.status`. No special handling needed.

4. **API restart during a competition** — in-memory presence map is cleared. Initial dashboard fetch via `getDashboardSnapshot` returns `connected: false` for all judges. Within seconds, Socket.IO auto-reconnect from active judges repopulates. Dashboard recovers automatically. Documented limitation.

5. **`currentPhase` ambiguity during cypher-review (Story 3.6 dependency)** — if Story 3.6 ships first: `cypherCompletedAt` is set, `currentPhase = 'cypher-review'`. If Story 3.6 ships AFTER Story 4.1: `cypherCompletedAt` column doesn't exist yet. Mitigation in Task 5: if column missing (catch), fall back to `'cypher'` for `status='active'`. Defensive programming.

6. **Admin sees stale `submittedCount` if score is overridden later** — Story 4.2 will introduce score overrides. The `score.submitted` event won't fire on override; instead a `score.overridden` event will. Dashboard's `submittedCount` computed from `scores` table COUNT will reflect overrides automatically. No separate handling needed in 4.1.

7. **Disconnected judge re-connects with stale queue** — they connect, send their `judge.status` with the still-non-zero queue, drain begins, queue shrinks, `judge.status` events fire as queue size changes. Dashboard updates incrementally. The badge fades from "3 pending" → "2" → "1" → gone. This is the desired behavior per AC #4.

8. **Many judges, frequent status events = noise** — at 30 judges × 1 score per minute × 1 status event per score change = ~120 events/min admin-side. Affordable. If it becomes a hotspot, debounce on the gateway or in `useAdminSocket`.

### Project Structure Notes

**New files:**

```
apps/api/src/modules/auth/clerk-jwt.ts                                  (new — JWT verifier helper, only if not already present)
apps/api/src/modules/auth/clerk-jwt.spec.ts                             (new)
apps/api/src/modules/websocket/gateways/competition.gateway.spec.ts     (new — gateway tests)
apps/web/src/app/(admin)/competitions/[id]/live/page.tsx                (new — dashboard route, server component, PPR opt-in)
apps/web/src/components/admin/dashboard-live-island.tsx                 (new — client island)
apps/web/src/components/admin/dashboard-kpi-cards.tsx                   (new — stat cards)
apps/web/src/components/admin/dashboard-judge-grid.tsx                  (new — judge status grid)
apps/web/src/components/admin/dashboard-recent-scores.tsx               (new — recent-scores feed)
apps/web/src/hooks/use-admin-socket.ts                                  (new — admin WS hook)
apps/web/src/hooks/use-admin-socket.spec.ts                             (new)
packages/shared/types/judge-live-status.ts                              (new — JudgeLiveStatus type)
```

**Modified files:**

```
apps/api/src/modules/websocket/gateways/competition.gateway.ts          (admin auth at handshake; presence map; judge.status handler; getJudgePresence; broadcastJudgeStatusChanged; broadcastStandingsUpdated also to admin)
apps/api/src/modules/websocket/competition-gateway.interface.ts         (interface additions)
apps/api/src/trpc/routers/tournament.router.ts                          (add getDashboardSnapshot procedure)
apps/api/src/trpc/routers/tournament.router.spec.ts                     (tests)
packages/shared/events/socket-event-map.ts                              (add 'judge.status' client event + 'judge.status-changed' server event)
packages/shared/validation/competition.schema.ts                        (add getDashboardSnapshotSchema)
packages/shared/index.ts                                                (re-export new types/schemas)
apps/web/next.config.ts                                                 (experimental.ppr = 'incremental')
apps/web/src/app/(admin)/competitions/[id]/page.tsx                     ("Open Live Dashboard" link)
apps/web/src/hooks/use-judge-socket.ts                                  (expose socket reference if not already; verify)
apps/web/src/hooks/use-offline-queue.ts                                 (add onQueueSizeChanged callback)
apps/web/src/app/(judge)/judge/[token]/page.tsx                         (wire onQueueSizeChanged to socket.emit('judge.status'))
```

### Next.js Version Warning (recurring)

`apps/web/AGENTS.md`: _"This is NOT the Next.js you know — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."_

For this story specifically: PPR's exact API changed across Next 14 / 15 / 16. `experimental.ppr = 'incremental'` and per-route `experimental_ppr = true` are the Next 16 form. Verify against `apps/web/node_modules/next/dist/docs/...` before authoring `next.config.ts` or the route file.

### Testing Standards

- **Test framework**: Vitest. API runs Node, web runs JSDOM.
- **Gateway tests**: mock `Server` from `socket.io` via `vi.fn()`. Stub `client.handshake.auth`, `client.data`, `client.join`, `client.disconnect`. Assert state mutations and emit calls. NestJS DI: instantiate the gateway directly with a mocked `DatabaseService`.
- **JWT helper tests**: stub `@clerk/backend` `verifyToken` via `vi.mock`. Assert pass/fail paths.
- **Hook tests**: same React 19 + `react-dom/test-utils` pattern as Story 3.5. Mock `socket.io-client` `io()` with a fake socket emitter.
- **Coverage target**: every branch in admin auth (judge token / organizer token / no token / invalid token), `handleAdminJoin` (4 reject paths + 1 happy path), `handleJudgeStatus` (auth boundary + map mutation + broadcast). Snapshot derivation (4 phase cases). Hook listener wiring + cleanup.

### Previous Story Intelligence (Story 3.5 — completed; Story 3.6 — ready-for-dev)

From Story 3.5 (just completed):

1. **Defensive runtime guards** for any data crossing trust boundaries. The `judge.status` payload from a judge socket should be validated server-side before mutating the presence map.
2. **Type guards over type assertions** — `JudgeLiveStatus` returned from gateway to tRPC needs a guard if it ever crosses a serialization boundary.
3. **Extract testable helpers**: any complex derivation (e.g., `currentPhase`) should live in a pure helper file with its own spec, not inline in the procedure.
4. **No new top-level deps** — the `lib/network-error.ts` and `lib/judge-draft.ts` extractions during Story 3.5's review were done with zero new packages. Apply same constraint here.
5. **TanStack Query v5 reactivity** — derive state from `data`, no `useEffect` mirroring.

From Story 3.6 (ready-for-dev, may ship in parallel):

- The `competitions.cypherCompletedAt` column is the source of truth for the `cypher-review` phase. If it doesn't exist when 4.1 lands, the snapshot derivation must defensively check.
- The `phase.transitioned` socket event is included in `useAdminSocket` so the dashboard auto-refreshes the phase KPI when 3.6's mutation fires.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1 — FR36, FR37, NFR5]
- [Source: _bmad-output/planning-artifacts/prd.md#FR36-FR37 — live dashboard, judge connection monitoring]
- [Source: _bmad-output/planning-artifacts/architecture.md#Stack — line 122 (Tremor planned, deviated from); line 223 (PPR for admin); line 34 (admin WS namespace)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Cache — Redis presence is post-MVP; in-memory is MVP-acceptable]
- [Source: apps/api/src/modules/websocket/gateways/competition.gateway.ts:113-123 — current `join.admin` rejection stub to replace]
- [Source: apps/api/src/modules/websocket/gateways/competition.gateway.ts:155-180 — existing broadcast methods to reuse/extend]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:875-894 — `getStandings` for standings preview reuse]
- [Source: packages/shared/events/socket-event-map.ts — events to extend with `judge.status` + `judge.status-changed`]
- [Source: packages/shared/events/scoring-events.ts — `ScoreSubmittedPayload` consumed by recent-scores feed]
- [Source: packages/db/schema/judge-sessions.ts — `groupIndex` for grouping judges in the UI]
- [Source: packages/db/schema/competitions.ts — `cypherCompletedAt` (Story 3.6) for phase derivation]
- [Source: apps/web/src/hooks/use-judge-socket.ts — template for `useAdminSocket`]
- [Source: apps/web/src/hooks/use-offline-queue.ts — `queueSize` to surface via `onQueueSizeChanged`]
- [Source: apps/web/src/app/(public)/[competitionId]/standings/page.tsx — connection-status indicator pattern]
- [Source: apps/web/src/app/(admin)/competitions/[id]/page.tsx — competition detail page to add the dashboard link]
- [Source: apps/web/src/proxy.ts — Clerk auth proxy already protects `/competitions(.*)`]
- [Source: _bmad-output/implementation-artifacts/3-3-judge-scoring-interface-cypher-mode.md — judge socket pattern]
- [Source: _bmad-output/implementation-artifacts/3-4-real-time-score-aggregation-and-live-standings.md — public socket + standings broadcast]
- [Source: _bmad-output/implementation-artifacts/3-5-offline-score-queue-and-connection-resilience.md — offline queue, hook callback ref pattern, no-new-deps discipline]
- [Source: _bmad-output/implementation-artifacts/3-6-cypher-phase-completion-and-advancement-review.md — `phase.transitioned` event and `cypherCompletedAt` column]
- [Source: _bmad-output/project-context.md — exhaustive list of project-wide rules; READ FIRST]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

1. PPR shell render timing (<2s) deferred to manual QA as noted in Task 10. Story DoD: run `pnpm dev`, navigate to `/competitions/[id]/live`, observe the skeleton shell renders immediately while the live island streams in.
2. `clearPresence` wired into gateway interface and implementation. Follow-up: call `clearPresence` from `completeCypherPhase` when competition status transitions to completed in a future story.
3. Organizer JWT expiry while dashboard is open (AC edge case): MVP handles reconnect on token refresh via socket re-creation (new `clerkToken` → new `useEffect` run). Short-window gap exists during the 15-min JWT lifetime — documented in Dev Notes.

### File List

**New files:**

- `packages/shared/types/judge-live-status.ts`
- `apps/api/src/modules/auth/clerk-jwt.ts`
- `apps/api/src/modules/auth/clerk-jwt.spec.ts`
- `apps/api/src/modules/websocket/gateways/competition.gateway.spec.ts`
- `apps/web/src/hooks/use-admin-socket.ts`
- `apps/web/src/hooks/use-admin-socket.spec.ts`
- `apps/web/src/components/admin/dashboard-kpi-cards.tsx`
- `apps/web/src/components/admin/dashboard-judge-grid.tsx`
- `apps/web/src/components/admin/dashboard-recent-scores.tsx`
- `apps/web/src/components/admin/dashboard-live-island.tsx`
- `apps/web/src/components/admin/live-dashboard-link.tsx`
- `apps/web/src/app/(admin)/competitions/[id]/live/page.tsx`

**Modified files:**

- `packages/shared/index.ts` — re-export JudgeLiveStatus
- `packages/shared/events/socket-event-map.ts` — add `judge.status` client event, `judge.status-changed` server event
- `packages/shared/validation/competition.schema.ts` — add `getDashboardSnapshotSchema`
- `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add `broadcastJudgeStatusChanged`, `getJudgePresence`, `clearPresence`
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — organizer auth at handshake; presence map; `judge.status` handler; admin join ownership check; `broadcastStandingsUpdated` → admin+public; new broadcast/presence methods
- `apps/api/src/trpc/routers/tournament.router.ts` — add `getDashboardSnapshot` protectedProcedure
- `apps/api/src/trpc/routers/tournament.router.spec.ts` — mock gateway additions; `getDashboardSnapshot` tests
- `apps/web/next.config.ts` — `experimental.ppr = 'incremental'`
- `apps/web/src/hooks/use-offline-queue.ts` — add `onQueueSizeChanged` callback
- `apps/web/src/app/(judge)/judge/[token]/page.tsx` — wire `onQueueSizeChanged` to emit `judge.status`
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — add `LiveDashboardLink` component

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-27 | Initial implementation: all 11 tasks complete, 13/13 CI gates passing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-04-28 | Senior Developer Review fixes (1 HIGH + 2 MEDIUM): H1 — `handleAdminJoin` now emits structured `error` events on all 4 rejection paths so the dashboard can surface diagnostics; `useAdminSocket` exposes new `onError` callback. M1 — `DashboardLiveIsland` differentiates `isLoaded`/`isSignedIn` to avoid the "Authentication required" flash for authenticated users; effective token nulled on sign-out. M2 — `handleJudgeStatus` now runtime-validates payload (integer 0..10_000) at the WS trust boundary, dropping malformed `queueSize` per Story 3.5's defensive-guards lesson. Tests: 7 new gateway tests (4 reject-paths assert error emit, missing-clerkId disconnects, 6 malformed-payload `it.each` cases), 1 new hook test for `onError`. CI: 120 API + 45 web tests passing. |
