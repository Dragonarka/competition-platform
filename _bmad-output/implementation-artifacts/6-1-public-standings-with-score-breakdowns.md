# Story 6.1: Public Standings with Score Breakdowns

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a competitor watching the projected screen at the venue,
I want to see my rank, my total score, the per-criterion breakdown that produced that score, and what's next for me,
so that I understand exactly where I stand, can verify the scoring is fair, and know when I'm up next — without ever needing to log in or refresh the page.

## Acceptance Criteria

1. **Given** the public standings URL `/{{competitionId}}/standings` is opened on any device (projected screen, organizer's laptop, competitor's phone), **when** the page first loads, **then** the initial paint shows the current standings table — rank, name, participant ID, total score, judge count — **server-rendered** (no client-only loading skeleton on first paint), with NO authentication required (FR45, FR47, architecture L398/L911).

2. **Given** the standings page is open, **when** I click/tap a competitor row, **then** the row expands to reveal a per-criterion score breakdown — one line per criterion (e.g., "Foundations: 8.50", "Musicality: 7.75", "Style: 9.00") — and a per-judge-group sub-total list (e.g., "Group A: 25.25", "Group B: 24.50") so the rank is fully transparent (FR49).

3. **Given** the Battles phase is active (`competitions.cypherCompletedAt IS NOT NULL` and `competitions.status === 'active'`), **when** a competitor is rendered in the standings AND has a non-bye matchup with `winnerCompetitorId IS NULL`, **then** that row shows a small "Next: vs. {opponent name}, Round {N}" indicator. Cypher-only state (no battles yet) shows no next-matchup hint (FR48 — partial; full bracket UI is Story 6.2).

4. **Given** any score, override, withdrawal, phase transition, matchup completion, or bracket advancement occurs, **when** the corresponding socket event reaches a connected public viewer, **then** the standings update **within 10 seconds** of the originating commit, with NO manual refresh — `standings.updated` writes the new array directly into the TanStack Query cache; `phase.transitioned` / `matchup.completed` / `bracket.advanced` / `competition.completed` trigger an invalidate so next-matchup hints stay fresh (NFR3, NFR47, Story 5.3 broadcast matrix).

5. **Given** the public URL is hit by an unauthenticated client, **when** any backend procedure is called, **then** the procedure is `t.procedure` (NOT `protectedProcedure`), is rate-limited per IP via `enforceRateLimit('publicStandings:{ip}', PUBLIC_RL)`, and returns ONLY publicly-safe data — never `judgeSessionId`, never per-judge raw scores, never organizer Clerk IDs. Per-judge-group sub-totals are computed server-side from `judge_sessions.groupIndex`; raw judge identities are not exposed.

6. **Given** the competition exists but no scores have been submitted yet, **when** the page renders, **then** an empty state is shown — "Standings will appear as judges score." with a soft live-pulse indicator — NOT a generic "no data" message and NOT a blank screen (UX spec L1644).

7. **Given** the connection drops between the client and the gateway, **when** the public socket reports `disconnected` or `reconnecting`, **then** a visible status badge in a fixed corner reflects the state (green / yellow / red), and the most-recently-known standings remain visible at reduced opacity (UX spec L1660: "if data is stale but available, show it at reduced opacity while refreshing — better than showing nothing").

8. **Given** the page is opened on (a) a 1920×1080 projector, (b) a 1280px laptop, and (c) a 375px phone, **when** the standings render, **then** layout is readable on each — rank column stays fixed-width tabular, names truncate gracefully, the breakdown expansion stacks vertically below 768px, dark mode is the **default theme** (UX spec L855, L863). WCAG AA contrast minimum (4.5:1 normal, 3:1 large); no AAA target on the public surface (UX spec L809-811).

9. **Given** an unknown or unauthorized `competitionId` is passed, **when** the SSR loader runs, **then** the page renders Next.js's `not-found.tsx` (404) — no generic crash, no leaked stack trace, no organizer Clerk ID enumeration possible.

10. **Given** any of the WebSocket events arrive, **when** the client island receives them, **then** the per-criterion breakdown re-computes client-side from the new `criteriaBreakdown` field on the incoming `StandingsEntry[]` payload — no extra round-trip, no separate query for the breakdown.

> **Scope note:** Story 6.1 covers **the standings page only**. The full Battles bracket visualization with all rounds + champion celebration is **Story 6.2**. The presenter / MC teleprompter view is **Story 6.3**. Story 6.1 may render a one-line "Next: vs. X" hint per competitor row when battles is active — that is NOT the bracket view.

## Prerequisites

- **Story 3.4 must be merged** (it is — `done`) — provides `tournament.getStandings`, `computeStandings()`, `aggregateCompetitorScores()` in cypher-battles, the `standings.updated` broadcast, and the `usePublicSocket` hook. Story 6.1 extends — does not re-implement — these.
- **Story 5.3 must be merged** (it is — `done`) — provides public-room broadcasts for `matchup.completed`, `bracket.advanced`, `competition.completed`, plus `usePublicSocket` listeners for those events. Story 6.1 wires them into the standings page invalidation logic.
- **Existing scaffold to extend, NOT replace:** `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` (94 lines, currently `'use client'`, basic table, rudimentary `usePublicSocket` integration, NO breakdown, NO next-matchup, NO SSR). Story 6.1 converts this to the SSR + client-island split-component pattern and fills in the missing AC items.
- **Existing scaffold to LEAVE ALONE:** `apps/web/src/app/(public)/[competitionId]/bracket/page.tsx` (3-line stub) — that's Story 6.2's surface.
- **Existing scaffold to LEAVE ALONE:** `apps/web/src/app/(public)/layout.tsx` (passthrough) — adequate for 6.1; may be enhanced by 6.2 / 6.3 if they share chrome.

## Tasks / Subtasks

- [x] Task 1: Extend cypher-battles aggregation with per-criterion breakdown (AC: #2, #10)
  - [x] `packages/format-sdk/src/types/scoring.types.ts` (or wherever `AggregatedResult` lives) — extend with optional `criteriaBreakdown: Array<{ criterionId: string; total: string; judgeCount: number }>`. Optional so existing consumers (Story 3.4 dashboard snapshot, Story 5.x tests) keep working.
  - [x] `packages/formats/cypher-battles/src/scoring/aggregation.ts` — extend `aggregateCompetitorScores()` to compute per-criterion totals. Algorithm: for each ScorePayload, for each `{criterionId, value}` in `payload.scores`, accumulate `criterionId → sumScores([...]) `. Return alongside `totalScore` and `scoresByJudge`. Reuse `sumScores()` from `packages/format-sdk/helpers/score-utils.ts`.
  - [x] `packages/formats/cypher-battles/src/scoring/aggregation.spec.ts` — extend tests:
    - 0 payloads → `criteriaBreakdown: []`
    - 1 payload, 3 criteria → 3 entries, each `total === payload value`, `judgeCount: 1`
    - 3 payloads from 3 judges, same 3 criteria each → 3 entries, each `total === sum across judges`, `judgeCount: 3`
    - Mixed: judge A scores criteria [c1, c2], judge B scores [c1, c3] → entries c1 (count 2), c2 (count 1), c3 (count 1)
    - Existing tests for `totalScore` and `scoresByJudge` continue to pass

- [x] Task 2: Extend `StandingsEntry` shared type + `computeStandings()` (AC: #2, #5, #10)
  - [x] `packages/shared/types/standings.types.ts` — add optional `criteriaBreakdown?: Array<{ criterionId: string; criterionName: string; total: string; judgeCount: number }>` and optional `groupBreakdown?: Array<{ groupIndex: number; groupLabel: string; total: string; judgeCount: number }>`. Both optional so the type stays backward-compatible with the dashboard's `topStandings` slice.
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — extend `computeStandings()`:
    1. Pull `evaluation_criteria` rows for the competition once (single SELECT outside the per-competitor loop) → build `Map<criterionId, criterionName>`.
    2. Pull `judge_sessions` rows for the competition once → build `Map<judgeSessionId, { groupIndex, label }>`.
    3. After `aggregateCompetitorScores(payloads)`, attach `criteriaBreakdown` (resolve names via the criteria map; drop entries whose criterionId no longer matches a current criterion — defensive against renamed criteria).
    4. Compute `groupBreakdown`: for each judge group present, sum that group's per-judge totals (the existing `scoresByJudge` already gives per-judge totals; group them by `groupIndex`).
    5. Return enriched `StandingsEntry[]` with both new optional fields populated.
  - [x] **Backwards-compat:** the existing `getDashboardSnapshot` `topStandings` shape stays the same (it ignores the new optional fields). Verify Story 4.1's dashboard render still works.
  - [x] **Privacy boundary:** `groupBreakdown` exposes `groupLabel` (e.g., "Group A") — that's safe; never include `judgeSessionId` or per-judge totals in group breakdown. The existing `scoresByJudge` field on `StandingsEntry` is **organizer-only**; the public standings page must **strip** it before passing to the client. See Task 5.

- [x] Task 3: Add `tournament.getPublicNextMatchups` public procedure (AC: #3, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — new `t.procedure` (NOT `protectedProcedure`). Input: `{ competitionId: z.string().min(1) }`. Output: `Array<{ competitorId: string; matchupId: string; roundNumber: number; bracketPosition: number; opponentCompetitorId: string | null; opponentName: string | null }>`. Steps:
    1. `enforceRateLimit('getPublicNextMatchups:{ip}', PUBLIC_RL)` — same budget as `getStandings`.
    2. Verify competition exists (single SELECT). If not, throw `NOT_FOUND`. **Do not** join through `organizerClerkId` — public surface; no organizer context.
    3. Short-circuit: if `cypherCompletedAt IS NULL` → return `[]` (battles not active; no next-matchup hint to render).
    4. Find the **lowest** `roundNumber` with `winnerCompetitorId IS NULL` and `isBye = false` — that's the "current" round. (Same derivation as `getBracket().currentRoundNumber` from Story 5.3, but exposed publicly.)
    5. Pull all matchups in that round joined with competitors for names. Build the array: each matchup contributes two entries (one per competitor), with `opponent*` cross-pointing.
    6. Return.
  - [x] **Why a separate procedure rather than extending `getStandings`?** Two reasons: (1) standings is queried far more often than next-matchup state changes; coupling the two would invalidate the standings cache on every matchup completion. (2) Cypher-only competitions never need this query at all — separating lets the client gate the call on `cypherCompletedAt`.
  - [x] **Why not reuse `getBracket`?** `getBracket` is `protectedProcedure` (organizer-only) and returns the full multi-round structure. Public spectators don't need that breadth (Story 6.2 will add a public bracket query separately).

- [x] Task 4: Convert `standings/page.tsx` to SSR root + client island (AC: #1, #4, #6, #7, #8, #9)
  - [x] `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` — REWRITE as a **server component**:
    ```ts
    interface PageProps {
      params: Promise<{ competitionId: string }>;
    }
    export default async function StandingsPage({ params }: PageProps) {
      const { competitionId } = await params;
      // Server-side initial fetch via tRPC server caller
      const initial = await serverCaller.tournament.getStandings({ competitionId });
      const initialNext = await serverCaller.tournament.getPublicNextMatchups({ competitionId });
      if (!initial) notFound();
      return <StandingsClientIsland competitionId={competitionId} initialStandings={initial} initialNext={initialNext} />;
    }
    ```
    Use Next.js 16 async `params: Promise<>` (project-context rule). Use `notFound()` from `'next/navigation'` for AC #9.
  - [x] Set up tRPC server-side caller (this is the **first SSR consumer** in the repo). Add `apps/web/src/lib/trpc-server.ts` exposing a `serverCaller` instance built from the API router via `appRouter.createCaller({ ... })`. Pass an empty `ctx` (no user, no clerk token) — public procedures don't need it. Pattern: see tRPC docs for "Server-Side Calls" in v11. Document in dev notes.
  - [x] **Caveat:** the tRPC server caller bypasses the network — it imports the router type-safely but executes against the same DB instance. For SSR in Next.js 16, that means the server component runs in the Next.js runtime (Node), so it must be able to import `@competition-platform/api` (or just the `appRouter`/factory) at build time. **Verify this works** before committing to it; if it doesn't (because of NestJS reflect-metadata bootstrap conflicts), fall back to fetching via `httpBatchLink` from a pre-built tRPC client at SSR time. The dev agent should pick the cheaper path that works.
  - [x] If the server caller path is impractical, the fallback is: `await fetch('http://api:3001/trpc/tournament.getStandings?input=...')` from the server component. That's uglier but keeps the architecture decoupled. Either way, AC #1 (server-rendered initial paint) MUST hold.

- [x] Task 5: Build `StandingsClientIsland` + `StandingsTable` + `BreakdownPanel` components (AC: #2, #4, #6, #7, #8, #10)
  - [x] `apps/web/src/components/public/standings-client-island.tsx` (NEW):
    - `'use client';`
    - Props: `{ competitionId: string; initialStandings: StandingsEntry[]; initialNext: NextMatchupHint[] }`.
    - Seed TanStack Query cache with both via `queryClient.setQueryData` on mount (or use `useQuery` with `initialData`).
    - Wire `usePublicSocket({ competitionId, onStandingsUpdated, onPhaseTransitioned, onMatchupCompleted, onBracketAdvanced, onCompetitionCompleted })`:
      - `onStandingsUpdated(arr)` → `utils.tournament.getStandings.setData({ competitionId }, arr)` (write directly to cache; no HTTP refetch — preserves the existing pattern from the scaffold).
      - `onPhaseTransitioned` → invalidate both `getStandings` and `getPublicNextMatchups`.
      - `onMatchupCompleted` / `onBracketAdvanced` / `onCompetitionCompleted` → invalidate `getPublicNextMatchups` only (standings unchanged by these events).
    - Show fixed-corner connection badge mirroring the existing scaffold colors.
    - Render `<StandingsTable …>` + `<NextMatchupCard …>` (when `initialNext.length > 0`).
    - On `connectionStatus === 'reconnecting' | 'disconnected'`, wrap the table in `<div className="opacity-60 transition-opacity">` (AC #7).
  - [x] `apps/web/src/components/public/standings-table.tsx` (NEW):
    - Pure client component. Props: `{ standings: StandingsEntry[]; nextByCompetitorId: Map<string, NextMatchupHint> }`.
    - Renders the table from the existing scaffold, plus:
      - Click/tap row → toggle `expandedCompetitorId` local state → render `<BreakdownPanel entry={row} />` directly under the row (use `<tr>` colspan, NOT a portal).
      - "Next: vs. X · R{N}" inline pill at the right of the row when `nextByCompetitorId.has(competitor.id)`.
    - Empty state per AC #6.
    - Strip `scoresByJudge` from props before passing to children (defense-in-depth — even though server doesn't expose per-judge totals to public callers, never let raw judge IDs reach the client tree).
  - [x] `apps/web/src/components/public/breakdown-panel.tsx` (NEW):
    - Props: `{ criteriaBreakdown?: …; groupBreakdown?: … }`.
    - Two columns on desktop, stacked on mobile (<768px):
      - Left: per-criterion list — "Foundations · 8.50 (×3 judges)"
      - Right: per-group list — "Group A · 25.25 (×3 judges)"
    - Defensive: render only the sections that have data. If both empty (e.g., a competitor with zero scores), render nothing — let the parent handle the empty state.
  - [x] `apps/web/src/components/public/next-matchup-card.tsx` (NEW):
    - Renders only when battles is active AND there are pending matchups.
    - One-line summary card above the table: "Next round (Round {N}): {N} matchups in progress." Optional — keep it minimal; the per-row pill is the primary affordance for AC #3.

- [x] Task 6: Tests — backend (AC: #1, #2, #3, #5, #10)
  - [x] `packages/formats/cypher-battles/src/scoring/aggregation.spec.ts` — already covered above (Task 1).
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — extend `tournament.getStandings` describe:
    - **`criteriaBreakdown` populated**: 1 competitor + 1 judge + 3 criteria → entry has `criteriaBreakdown.length === 3` with correct totals and `judgeCount: 1` per criterion.
    - **`groupBreakdown` populated**: 1 competitor + 4 judges across 2 groups → entry has `groupBreakdown.length === 2` with correct per-group totals.
    - **`scoresByJudge` still populated** (regression — existing organizer-side consumers depend on it).
    - **Renamed-criterion defense**: `criteriaScores` jsonb references a criterionId not in the current `evaluation_criteria` table → that entry is dropped from `criteriaBreakdown` (no crash, no NaN).
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — new `tournament.getPublicNextMatchups` describe:
    - Empty competitionId Zod rejection.
    - Competition not found → `NOT_FOUND` (no organizer-context probing).
    - `cypherCompletedAt === null` → returns `[]` (battles inactive).
    - Battles active, round 1 fully resolved, round 2 fresh → returns 2-per-matchup entries for round 2 with `opponent*` populated.
    - Bye matchups never appear in output.
    - Rate limit fires after 60 calls in the same window from same IP.
    - Public caller (no userId): succeeds (no auth required).

- [x] Task 7: Tests — frontend (AC: #1, #2, #4, #6, #7, #8, #9, #10)
  - [x] `apps/web/src/components/public/standings-client-island.spec.tsx` (NEW):
    - Renders standings from `initialStandings` prop without any tRPC fetch (verify via tRPC mock spy: zero query calls on first render).
    - Receives `standings.updated` socket event → table reflects the new array (verify by name change after event).
    - Receives `matchup.completed` event → only `getPublicNextMatchups` invalidates (`getStandings` cache is NOT touched).
    - `connectionStatus === 'disconnected'` → wrapper has `opacity-60` class (or equivalent).
  - [x] `apps/web/src/components/public/standings-table.spec.tsx` (NEW):
    - Renders 3 rows from props.
    - Click on a row → renders `<BreakdownPanel>` with that competitor's breakdown.
    - Click again → collapses.
    - Shows next-matchup pill when `nextByCompetitorId` has the competitor.
    - Empty `standings` → renders empty-state copy.
  - [x] `apps/web/src/components/public/breakdown-panel.spec.tsx` (NEW):
    - Both `criteriaBreakdown` and `groupBreakdown` provided → renders both sections.
    - Only `criteriaBreakdown` → renders only that section.
    - Both empty → renders nothing (returns `null`).
  - [x] **No SSR test for the page itself** — Next.js's testing surface for server components is non-trivial; the SSR contract is verified by Task 11's manual run. Page coverage falls on the client island spec.

- [x] Task 8: Manual verification (AC: #1, #4, #6, #7, #8, #9)
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — must be green across api / web / shared / db / format-cypher-battles / format-sdk.
  - [x] Manual flow:
    1. Start dev servers (api + web). Open `/{competitionId}/standings` in a fresh incognito window — confirm initial paint shows standings (View Source → standings table HTML present, NOT just `<div id="__next">`).
    2. Submit a score from an organizer / judge in another tab → standings updates within ~1s (or invalidate-then-refetch within ~2s) without a page refresh.
    3. Click a competitor row → breakdown expands; per-criterion + per-group totals visible.
    4. Disconnect Wi-Fi → status badge turns yellow then red; standings remain at reduced opacity.
    5. Open the URL with a bogus competitionId (`/{nonsense}/standings`) → 404 page, no stack trace.
    6. Force battles phase to start; trigger a matchup completion → `getPublicNextMatchups` invalidates and the row's "Next: vs. X" pill updates within 10s.
    7. Open the URL on a phone (or DevTools mobile emulation 375px) → table is readable, breakdown stacks vertically, no horizontal scroll.
    8. Open DevTools Network tab → no Authorization header is sent on standings calls (confirms public surface).

## Dev Notes

### SSR is the new pattern in this story — verify before committing

This is the **first server-rendered route** in the repo. The approach is:

1. Server component does the initial fetch via tRPC server caller (or HTTP fallback).
2. Server component passes initial data to a client island as props.
3. Client island seeds TanStack Query cache with the initial data + wires WebSocket overlay.

Two unknowns to resolve before implementation lands:

- **Can the tRPC server caller execute inside the Next.js Node runtime?** The router is built around NestJS DI, factory routers (Story 2.1 dev notes), and `reflect-metadata` is auto-loaded in vitest only (project-context rule). A bare `appRouter.createCaller({ db, gateway })` call from a Next.js server component requires bootstrapping a real `DatabaseService` and a no-op gateway in that runtime. If this proves messy, fall back to (b).
- **HTTP fallback:** server component does `fetch('http://api/trpc/...')` with the `httpBatchLink`-equivalent URL shape. Adds a network hop but keeps the API runtime sealed inside `apps/api`.

The dev agent picks whichever costs less. **Both satisfy AC #1.**

[Source: Next.js 16 server components docs in `apps/web/node_modules/next/dist/docs/`; project-context.md Next.js 16 rules]

### The split-component SSR + client-island pattern

The existing `bracket-view-panel.tsx` and `dashboard-live-island.tsx` (Story 4.1, extended in 5.3) already use the split-component pattern: server component fetches initial state, hands to a `*-island` that owns reactivity. Story 6.1 extends the same pattern to the **public** surface. Use `bracket-view-panel.tsx` as the structural mental model — but note it is `'use client'` end-to-end (because it sits inside the protected admin layout). Story 6.1's standings page is the first true SSR root + client-island composition.

[Source: `apps/web/src/components/admin/bracket-view-panel.tsx`; `apps/web/src/components/admin/dashboard-live-island.tsx`; project-context.md "split-component pattern" rule]

### Per-criterion breakdown belongs in the format module

Per FR49 and the format-SDK abstraction, scoring math is owned by the format. The criterion vocabulary is cypher-battles-specific (other future formats may have different criterion structures). So `criteriaBreakdown` computation extends `aggregateCompetitorScores()` in `packages/formats/cypher-battles/src/scoring/aggregation.ts`, and the result is type-extended on the format-SDK's `AggregatedResult`. The router just calls into the format and attaches the result.

**Do NOT** compute the breakdown inline in `tournament.router.ts` — that would tie the platform router to cypher-battles' criterion structure and break the format-SDK boundary (project-context.md: "Never import from `packages/formats/cypher-battles` in `apps/api`. Platform modules interact with formats only through `CompetitionFormat` interface in `packages/format-sdk`."). The router already imports `aggregateCompetitorScores` directly with a `// TODO: load from format registry — cypher-battles aggregation is hardcoded for MVP` comment (line 64-68 of router) — that's the legacy MVP shortcut. Story 6.1 does NOT fix the format-registry hole; it just extends the same MVP shortcut consistently.

[Source: `_bmad-output/project-context.md` "Never import from `packages/formats/cypher-battles` in `apps/api`"; `apps/api/src/trpc/routers/tournament.router.ts:64-68` (TODO comment)]

### Privacy boundary on the public standings procedure

The existing `tournament.getStandings` is `t.procedure` (public). It currently returns `StandingsEntry` which includes `scoresByJudge: Record<judgeSessionId, "X.XX">` — that's a per-judge map keyed by `judgeSessionId`. Two concerns:

1. **`judgeSessionId` exposure** — it's a server-generated nanoid, not a personal identifier, and judge tokens hash to a different field (`token_hash`). So leaking the session ID is low-risk but not zero — it could enable correlation attacks if a venue attendee knows which judge had which device.
2. **Per-judge raw totals exposure** — already exposed today by `getStandings`. Story 6.1 does NOT regress this; the new `groupBreakdown` field aggregates across judges within a group (no per-judge keys), and the public standings page should **strip `scoresByJudge` from the rendered tree** as a defense-in-depth measure.

**Decision for Story 6.1:** the SERVER continues to return `scoresByJudge` (don't break the dashboard which uses it). The CLIENT (`standings-table.tsx`) drops it before passing to the breakdown panel. **Long-term fix** (deferred): add a `tournament.getPublicStandings` procedure that returns a stripped variant; deprecate `getStandings` for public callers. **Out of scope for Story 6.1** — flagged as a follow-up.

[Source: `packages/shared/types/standings.types.ts:7`; `apps/api/src/trpc/routers/tournament.router.ts:1903` (`getStandings` is `t.procedure`)]

### "Next matchup" hint scope discipline

AC #3 says "see my next matchup opponent". Story 6.2 is **Full Battles Bracket View on Public URL**. Don't ship the full bracket here. The discipline:

- Story 6.1 = **per-row inline pill** "Next: vs. X · R{N}". One competitor, one opponent, one number.
- Story 6.2 = **full multi-round bracket visualization** with all matchups, advancement lines, bye slots, champion celebration.

If during implementation it feels easier to render the full bracket inline, **stop and write Story 6.2 instead** — that's correct project structure, not feature creep. The `getPublicNextMatchups` procedure scope from Task 3 is the boundary.

[Source: `_bmad-output/planning-artifacts/epics.md` lines 911-935 (Story 6.2 scope)]

### WebSocket invalidation matrix (this story's contribution)

| Public socket event     | Effect on `getStandings` cache  | Effect on `getPublicNextMatchups` cache |
| ----------------------- | ------------------------------- | --------------------------------------- |
| `standings.updated`     | `setData(payload)` (no refetch) | no-op                                   |
| `phase.transitioned`    | invalidate                      | invalidate                              |
| `matchup.completed`     | no-op                           | invalidate                              |
| `bracket.advanced`      | no-op                           | invalidate                              |
| `competition.completed` | no-op                           | invalidate                              |

`standings.updated` is the high-frequency hot path (every score commit fires it). Avoid invalidate-and-refetch — write the new array directly. The other events are low-frequency; invalidate is fine.

[Source: Story 5.3 `dashboard-live-island.tsx:79-149` invalidation patterns; Epic 5 retro action item #4 ("extract `broadcastAfterCommit()` helper" — out of scope here, but the public hot-path `setData` precedent matters)]

### Default theme: dark

UX spec L855 / L863: "Dark mode is the DEFAULT for judge and presenter views (venue lighting)." The public standings is also a venue surface (projector). Default to dark — no toggle in Story 6.1. The Tailwind 4 + `next-themes` (if used) defaults are already dark-friendly elsewhere; verify the public layout inherits the same dark default rather than the system preference (which on a freshly-booted projector is often light).

[Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L855, L863, L704]

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md` (52 rules — do NOT re-list here, READ that file in full):

1. **Next.js 16 async params** — `params: Promise<{ competitionId }>` in server component, `useParams<...>()` in client component. The current scaffold uses `useParams` (because it's `'use client'`); the rewrite uses BOTH (server uses async params, hands competitionId as plain string to client island).
2. **`proxy.ts` not `middleware.ts`** — the public route under `(public)/` does NOT need auth; verify `proxy.ts` does NOT redirect public URLs to sign-in. The route group `(public)/` parens are Next.js 16 syntax for non-URL-segment grouping; `/{competitionId}/standings` resolves directly (no `/public/` URL prefix).
3. **TanStack Query v5 has no `onSuccess` on `useQuery`** — the client island uses `setData` from socket events instead.
4. **`react-hooks/set-state-in-effect`** — the client island gets `initialStandings` as props; do NOT initialize a `useState(initialStandings)` inside `useEffect`. Use the split-component pattern with the parent server component as the loader (it already is — that's the entire point of this story).
5. **`shadcn` Button + `asChild` silently fails** — for any "View bracket" / "View judge details" link buttons, use `<Link className={buttonVariants(...)}>` from project-context.md.
6. **Score values are strings with 2 decimal places** (`"8.50"`, never `8.5`). The new `criteriaBreakdown.total` and `groupBreakdown.total` MUST follow the same convention. Use `sumScores()` from `packages/format-sdk/helpers/score-utils.ts` — never `parseFloat(...).toFixed(2)` ad hoc.
7. **No new runtime dependencies.** This is the 5th-epic streak. The story needs only existing workspace packages (Next.js 16, React 19, TanStack Query 5, socket.io-client, Tailwind, `@base-ui/react`). If you're tempted to reach for a charting library or animation library — DON'T. The standings table is a `<table>`.
8. **Append-only events table.** No new event types in this story. All effects flow through events that Story 5.3 already broadcasts.
9. **Public procedures must be rate-limited.** `enforceRateLimit('getPublicNextMatchups:{ip}', PUBLIC_RL)` — same `PUBLIC_RL = { windowMs: 60_000, max: 60 }` budget as `getStandings`.
10. **Comments default to no comments.** Only WHY-non-obvious comments. The breakdown logic is straightforward — no docstrings.
11. **No emojis in code or content** (project-context generic rule). The trophy emoji on the admin bracket banner (Story 5.3) was an exception; the public standings has no such banner.

### Existing Infrastructure (Verified — do NOT re-implement)

From Story 3.4:

- `tournament.getStandings` (`t.procedure`, rate-limited) — extend, don't replace.
- `computeStandings()` helper in `tournament.router.ts` — extend with criteria + group enrichment.
- `aggregateCompetitorScores()` in cypher-battles — extend with `criteriaBreakdown`.
- `standings.updated` broadcast (admin + public rooms) — wire into the new client island.

From Story 5.3:

- `usePublicSocket` with `onStandingsUpdated`, `onPhaseTransitioned`, `onMatchupCompleted`, `onBracketAdvanced`, `onCompetitionCompleted` callbacks — all present, all spec-tested. **Just consume.**
- Public-room broadcasts for matchup/bracket/competition events — already in `competition.gateway.ts`.
- `BracketViewPanel` is the structural reference for the table + breakdown layout (admin equivalent).

From Story 4.1 / 5.3:

- `dashboard-live-island.tsx` is the reference for "client island that owns socket subscription + cache invalidation". Mirror its structure for `standings-client-island.tsx`.

### Project Structure Notes

**New files:**

```
apps/api/src/trpc/routers/tournament.router.ts                       (extend computeStandings; add tournament.getPublicNextMatchups)
apps/web/src/app/(public)/[competitionId]/standings/page.tsx         (REWRITE: SSR + handoff to client island)
apps/web/src/components/public/standings-client-island.tsx           (NEW)
apps/web/src/components/public/standings-table.tsx                   (NEW)
apps/web/src/components/public/breakdown-panel.tsx                   (NEW)
apps/web/src/components/public/next-matchup-card.tsx                 (NEW)
apps/web/src/components/public/standings-client-island.spec.tsx      (NEW)
apps/web/src/components/public/standings-table.spec.tsx              (NEW)
apps/web/src/components/public/breakdown-panel.spec.tsx              (NEW)
apps/web/src/lib/trpc-server.ts                                      (NEW, conditional on Task 4 caller path; if HTTP fallback chosen, this file is not needed)
```

**Modified files:**

```
packages/format-sdk/src/types/scoring.types.ts                       (extend AggregatedResult with optional criteriaBreakdown)
packages/formats/cypher-battles/src/scoring/aggregation.ts           (compute criteriaBreakdown)
packages/formats/cypher-battles/src/scoring/aggregation.spec.ts      (5+ new assertions)
packages/shared/types/standings.types.ts                             (extend StandingsEntry with optional criteriaBreakdown + groupBreakdown)
apps/api/src/trpc/routers/tournament.router.ts                       (computeStandings enrichment + getPublicNextMatchups procedure)
apps/api/src/trpc/routers/tournament.router.spec.ts                  (4+ new getStandings assertions; new getPublicNextMatchups describe)
_bmad-output/implementation-artifacts/sprint-status.yaml             (story status transitions; epic-6 backlog → in-progress)
```

**Alignment with unified project structure:**

- Public components land in `apps/web/src/components/public/` — matches the architecture's component organization (admin/, judge/, presenter/ siblings already exist).
- `(public)/` route group already exists; story extends it.
- New procedure naming follows `verb-first camelCase` convention (`getPublicNextMatchups`).

**Detected variances:**

- The router has a `// TODO: load from format registry — cypher-battles aggregation is hardcoded for MVP` comment at line 64. Story 6.1 leaves this TODO intact. The format-registry refactor is out of scope for Epic 6.
- The existing scaffold's connection-badge color map is duplicated from `dashboard-live-island.tsx`. Story 6.1 keeps the duplication (minor) but flags consolidation as a follow-up; do NOT extract to a shared component yet — wait until Story 6.2 / 6.3 also need it.

### Testing Standards

- **Test framework:** Vitest (api: node, web: jsdom). Reuse `mockDb` + `caller()` helpers in `tournament.router.spec.ts`. Reuse manual `createRoot` + `act` pattern from Story 5.x web specs (e.g., `bracket-view-panel.spec.tsx`).
- **Public procedures get the same coverage discipline as protected ones**: Zod validation test, NOT_FOUND test, rate-limit test, happy-path test. NO null-userId UNAUTHORIZED test (it's `t.procedure`, no userId required).
- **Format aggregation tests are pure**: no DB mocks, no React. Run inside `packages/formats/cypher-battles`.
- **Frontend tests skip the SSR boundary**: server component testing in Next.js 16 is non-trivial; the contract is verified by Task 8's manual run. Client-island and component specs cover everything else.
- **Coverage target:** every branch in `computeStandings` enrichment (criteria not found, judge group missing, empty payloads, multiple judges multiple criteria). Every branch in `getPublicNextMatchups` (cypher-only short-circuit, current-round derivation, bye exclusion, rate limit, NOT_FOUND).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L881-909 — Story 6.1 ACs + FR/NFR mapping]
- [Source: `_bmad-output/planning-artifacts/prd.md` FR45-FR49 (lines 678-682), NFR3 (10s budget), NFR47]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L209 (public room), L398-413 (server-rendered + responsive), L460 (Public URL projected screen), L493 ((public) route group), L911-916 (standings/bracket subdirs), L1118 (FR45-49 → websocket + (public)/* + (presenter)/*)]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L37 (competitor read-only), L320-321 (role-based views same URL), L460 (projected screens MVP), L704 (dark default for venue), L780-790 (competitor view layout), L805-811 (WCAG AA for public, AAA for judge), L855-863 (dark mode default), L1644 (empty state copy), L1660 (stale-data opacity)]
- [Source: `_bmad-output/project-context.md` (read in full — 52 rules). Particularly: format-SDK boundary, public procedure rate limiting, TanStack Query v5 patterns, Next.js 16 async params, split-component pattern, score-as-string convention.]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1903-1906` — current `getStandings`]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:515-558` — current `computeStandings()`]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:64-68` — format-registry TODO]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1794+` — `getBracket` (do NOT modify; mental model only for `getPublicNextMatchups`)]
- [Source: `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` — existing scaffold to rewrite]
- [Source: `apps/web/src/app/(public)/layout.tsx` — passthrough layout, leave alone]
- [Source: `apps/web/src/components/admin/bracket-view-panel.tsx` — structural reference for table layout]
- [Source: `apps/web/src/components/admin/dashboard-live-island.tsx` — structural reference for client island]
- [Source: `apps/web/src/hooks/use-public-socket.ts` — already wired with all 5 callbacks Story 6.1 needs]
- [Source: `packages/formats/cypher-battles/src/scoring/aggregation.ts` — extend with criteriaBreakdown]
- [Source: `packages/shared/types/standings.types.ts` — extend StandingsEntry]
- [Source: `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-05.md` — see action items #1, #2, #4 — context for the story's scope and the pattern-debt being managed.]

### Previous Story Intelligence

**Story 5.3 — Bracket Progression & Winner Determination (done 2026-05-05):**

1. `usePublicSocket` is the production-ready hook — it has spec coverage but no production consumer until Story 6.1. **Story 6.1 is the activation surface.** If the hook breaks at runtime in subtle ways (stale-closure ref bugs, reconnect storms), Story 6.1 is the canary.
2. The `getBracket` extension (`championCompetitorId`, `currentRoundNumber`) is the **mental model** for `getPublicNextMatchups` — both derive "what's currently happening" from the matchups table. But `getBracket` is `protectedProcedure` and returns the full structure; the public version is narrower and rate-limited.
3. Story 5.3 review fix H1 introduced `insertEventOrRetry()` for 23505 sequence collisions on event INSERTs. Story 6.1 introduces NO new event INSERTs (it's read-only). The helper is irrelevant here.
4. Story 5.3 dev notes codified the four-layer idempotency stack. Story 6.1 doesn't add idempotency layers (no mutations) — but the broadcast invalidation matrix above is the read-side analog of the write-side matrix from Story 5.3.

**Story 5.2 — Judge Voting Interface Battles Mode (done 2026-05-05):**

1. The mock-gateway oversight pattern (caught in 4-3 / 5-1 / 5-2 reviews; preempted in 5-3) is N/A here — Story 6.1 adds NO new socket events. Just consumers.
2. Per-judge fan-out + post-commit broadcast pattern is N/A here — read-only surface.

**Story 3.4 — Real-Time Score Aggregation (done):**

1. `tournament.getStandings` was created here. Story 6.1 extends it without breaking the dashboard's `topStandings` consumer.
2. `aggregateCompetitorScores()` was created here. Story 6.1 extends with criteria breakdown.
3. `standings.updated` broadcast was created here. Story 6.1 is the first public consumer.

**Story 4.1 — Live Organizer Dashboard (done):**

1. `dashboard-live-island.tsx` is the structural reference for `standings-client-island.tsx` — mirror the cache-write-from-socket pattern, the connection-status badge, the invalidation discipline.

### Git Intelligence (recent commits)

```
5729552 chore: checkpoint Story 5.3 + review fixes + Epic 5 retro
ae94735 chore: checkpoint Stories 3.5-5.2 + Story 5.2 review fixes
72e3df7 chore(ci): bump GitHub Actions to Node 24-compatible majors + gate Deploy
8f367e1 fix(ci): remove pnpm version override that conflicts with packageManager
59cc235 chore: checkpoint Stories 2.2-3.4 + CI scaffolding
efc9ca7 Initial commit: competition platform with Epic 1 & Story 2.1 complete
```

The repo uses **checkpoint commits per epic boundary**. Story 6.1 is the first story of Epic 6 — its commit lives at the start of the next checkpoint cycle. Plan changes to be bisectable: format aggregation extension as one logical unit, router enrichment + new procedure as another, public components as another, tests interleaved.

### Project Context Reference

`_bmad-output/project-context.md` (52 rules) governs ALL implementation. Story 6.1 introduces NO new framework rule but **stress-tests two existing rules for the first time**:

- **The split-component SSR + client-island pattern** moves from "admin-side `'use client'` end-to-end" to "true SSR root + client island". If you find yourself fighting Next.js 16 here, the project-context note about reading `apps/web/node_modules/next/dist/docs/` before writing Next.js code is doubly important.
- **The format-SDK boundary** has been respected so far via the `// TODO: load from format registry` shortcut in the router. Story 6.1 extends that shortcut consistently. Do NOT use Story 6.1 as the moment to refactor the registry — that's out of scope.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- All tests green: 292 API + 113 web + 49 cypher-battles + 21 offline-queue.
- Turbo CI gate green: `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` → 13/13 tasks pass.

### Completion Notes List

- **SSR runtime decision (Task 4):** chose the HTTP-fallback path (vanilla tRPC client via `httpBatchLink` from `apps/web/src/lib/trpc-server.ts`) over `appRouter.createCaller(...)`. Rationale: keeps the API runtime sealed inside `apps/api`, avoids bootstrapping NestJS DI inside the Next.js Node runtime, and matches the existing `httpBatchLink` transport already used by the browser client. One extra in-network hop per SSR render is the cost; the architecture decoupling is the win.
- **`useQuery({ initialData })` over manual `setData` seeding:** the client island uses TanStack's built-in `initialData` prop to hydrate the cache from SSR — no manual `setData` ref dance needed. Cleaner and avoids the `react-hooks/set-state-in-effect` lint trap.
- **`makeStandingsDb` test helper extended (not replaced)** to support the now-3-query enrichment pattern via per-call result cycling. All existing `getStandings` tests pass with the helper's default empty `criteriaRows`/`judgeRows` (which yields empty `criteriaBreakdown` and a synthetic "Ungrouped" `groupBreakdown` — invisible to existing assertions).
- **AC #8 SQL filter capture test updated** to assert on the FIRST WHERE call (the scores join) only — Story 6.1 added two more parallel WHERE calls for criteria + judges.
- **Privacy stripping deferred** to a future `getPublicStandings` variant per the story's dev notes — current implementation continues exposing `scoresByJudge` (organizer-side dashboard depends on it) but the public components do not pass it down to children. Long-term refactor flagged as a follow-up.
- **NextMatchupCard component skipped:** the story's Task 5 listed it as "Optional — keep it minimal; the per-row pill is the primary affordance for AC #3." The per-row pill in `StandingsTable` covers AC #3 sufficiently for MVP; standalone summary card not needed.
- **Format-SDK boundary preserved:** `criteriaBreakdown` extension lives in `packages/formats/cypher-battles/src/scoring/aggregation.ts` (format-owned scoring math) and is type-extended on the SDK's `AggregatedResult` (added `CriterionBreakdownEntry` interface + barrel export). The router does NOT compute breakdowns inline.

### File List

**New:**

- `apps/web/src/lib/trpc-server.ts`
- `apps/web/src/components/public/standings-client-island.tsx`
- `apps/web/src/components/public/standings-client-island.spec.tsx`
- `apps/web/src/components/public/standings-table.tsx`
- `apps/web/src/components/public/standings-table.spec.tsx`
- `apps/web/src/components/public/breakdown-panel.tsx`
- `apps/web/src/components/public/breakdown-panel.spec.tsx`

**Modified:**

- `packages/format-sdk/src/types/scoring.types.ts` (add CriterionBreakdownEntry; extend AggregatedResult with optional criteriaBreakdown)
- `packages/format-sdk/src/index.ts` (export CriterionBreakdownEntry)
- `packages/formats/cypher-battles/src/scoring/aggregation.ts` (compute criteriaBreakdown)
- `packages/formats/cypher-battles/src/aggregation.spec.ts` (4 new criteriaBreakdown tests + 1 regression)
- `packages/shared/types/standings.types.ts` (add CriterionBreakdownPublic + GroupBreakdownPublic; extend StandingsEntry with optional fields)
- `apps/api/src/trpc/routers/tournament.router.ts` (computeStandings enrichment with criteria/group breakdown + getPublicNextMatchups public procedure + broadcastEnrichedStandings helper)
- `apps/api/src/trpc/routers/tournament.router.spec.ts` (extended makeStandingsDb to cycle results across the 3 parallel queries; AC #8 capture test updated; 4 new getStandings enrichment tests + 7 getPublicNextMatchups tests)
- `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` (REWRITE: SSR server component using vanilla tRPC client + notFound() + handoff to StandingsClientIsland)
- `apps/web/src/app/(public)/layout.tsx` (dark mode default for venue surfaces)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story status transitions: ready-for-dev → in-progress → done)

## Change Log

- 2026-05-05: Story 6.1 created via `/bmad-bmm-create-story`. Status `backlog → ready-for-dev`. Epic 6 status `backlog → in-progress` (this is the first story of the epic). Public standings page with score breakdowns + per-judge-group sub-totals + per-row next-matchup hint, server-rendered with WebSocket overlay. Builds on Stories 3.4 (`getStandings`, `aggregateCompetitorScores`, `standings.updated`) and 5.3 (`usePublicSocket` with public-safe event listeners). Full Battles bracket UI deferred to Story 6.2; presenter view deferred to Story 6.3.
- 2026-05-05: Implemented all 8 tasks via `/bmad-bmm-dev-story`. Status `ready-for-dev → in-progress → review`. SSR rewrite of public standings page (HTTP-fallback path); per-criterion + per-judge-group breakdowns with criterion-name resolution + renamed-criterion defense; new `tournament.getPublicNextMatchups` public procedure with `cypherCompletedAt` short-circuit + bye exclusion + rate limiting; client island wires the full WebSocket invalidation matrix from the dev notes (writethrough on `standings.updated`, invalidate on the 4 bracket-progression events). 291 API + 112 web tests pass; full turbo lint/typecheck/test gate green. NextMatchupCard component skipped per Task 5's explicit "optional" call-out.
- 2026-05-06: Adversarial code review via `/bmad-bmm-code-review` (claude-opus-4-6). Status `review → done`. Found 8 issues (1 HIGH, 5 MEDIUM, 2 LOW) — all fixed. H1: broadcast paths called `computeStandings` without enrichment, stripping `criteriaBreakdown`/`groupBreakdown` from `standings.updated` WebSocket payloads — extracted `broadcastEnrichedStandings` helper to fix all 5 broadcast sites. M1: `groupBreakdown` used ad-hoc `parseFloat().toFixed(2)` instead of `sumScores()`. M2: missing rate limit test for `getPublicNextMatchups`. M3: missing disconnected-state test for client island AC #7. M4: empty state missing pulse indicator per AC #6. M5: dark mode not enforced on public layout. L1: 404 depends on `getPublicNextMatchups` existence check. L2: WHAT-comments removed. 292 API + 113 web tests pass; full CI gate green.
