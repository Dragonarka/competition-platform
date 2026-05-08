# Story 6.3: Presenter / MC Teleprompter View

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer running MC duties on a second device,
I want a dedicated presenter view showing exactly what I need to announce right now and what's coming next,
so that I can MC the competition confidently from my phone without switching between the admin dashboard and a notes app.

## Acceptance Criteria

1. **Given** I am logged in as an organizer and open the presenter view on my phone (`/present/{competitionId}`), **when** the presenter view loads, **then** I see large-text, glanceable information: current competition name, current phase, current round, competitors currently performing, and what's next — NOT the full admin dashboard. The view uses the `(presenter)/` route group and requires organizer authentication (Clerk JWT). No admin controls, no sidebar, no data tables — pure teleprompter.

2. **Given** the competition advances to the next round or phase (e.g., Cypher phase completes, a Battles matchup resolves, bracket advances), **when** the admin dashboard confirms the transition, **then** the presenter view updates in real-time via WebSocket — my phone shows the new state **within 3 seconds** without any manual action. The presenter is connected to the admin room via `useAdminSocket` and stays in sync with the admin dashboard.

3. **Given** I need to announce a matchup during the Battles phase, **when** I look at my presenter view, **then** competitor names are displayed in the largest possible text (64px+, designed for glancing, not reading), formatted for verbal announcement (e.g., "Up next: Maria vs. Carlos"). Current matchup is visually prominent; next matchup is secondary.

4. **Given** the presenter view is open on my phone, **when** I also have the admin dashboard open on my laptop, **then** both views stay in real-time sync — the presenter view reflects exactly the current competition state that the admin sees. Both consume events from the same admin socket room (`competition:{id}:admin`).

5. **Given** the competition is in Cypher phase, **when** I view the presenter, **then** I see the current phase label ("CYPHER SCORING"), a scoring progress indicator (e.g., "12 of 24 scores submitted"), and the top 5 standings so I can announce leaders. Competitor names in standings are large enough to read at a glance.

6. **Given** the competition is complete (champion determined), **when** I view the presenter, **then** I see a prominent champion announcement — competitor name in the largest text on screen, with seed number and a celebration visual — ready for the MC to announce the winner.

7. **Given** the connection drops between the presenter client and the gateway, **when** the socket reports `disconnected` or `reconnecting`, **then** a visible status badge in a fixed corner reflects the state (green / yellow / red), and the most-recently-known data remains visible at reduced opacity. Same pattern as Stories 6.1/6.2.

8. **Given** the page is opened on (a) a 375px phone (primary), (b) a 768px tablet, and (c) a 1280px laptop, **when** the presenter renders, **then** layout is readable on each — single column, centered text, massive padding (32px+), no horizontal scroll. Dark mode is the **default theme**. WCAG AA contrast minimum (4.5:1). Competitor names scale responsively but never below 48px on mobile.

**And** the presenter view has no admin controls, no score/vote submission capabilities, no edit functionality — it is strictly read-only with large-text display optimized for an MC glancing at their phone during a live event.

## Prerequisites

- **Story 6.1 must be merged** (it is — `done`) — establishes the `createServerTrpcClient()` utility, `usePublicSocket` hook patterns, dark mode on public layout, connection-status badge pattern.
- **Story 6.2 must be merged** (it is — `done`) — provides `getPublicBracket` public procedure, `BracketView` component patterns, `roundLabel()` algorithm. The presenter does NOT use the public bracket component directly but reuses the round-label logic.
- **Story 5.3 must be merged** (it is — `done`) — provides `getBracket` (admin, protectedProcedure), bracket progression logic, all socket broadcasts. The presenter uses `getBracket` for current/next matchup derivation.
- **Story 4.1 must be merged** (it is — `done`) — provides `getDashboardSnapshot` (admin, protectedProcedure), `DashboardLiveIsland` pattern for authenticated client-side socket wiring with Clerk token.
- **Existing stubs to REWRITE:**
  - `apps/web/src/app/(presenter)/layout.tsx` (3 lines, passthrough) — Story 6.3 adds dark mode wrapper + minimal presenter chrome.
  - `apps/web/src/app/(presenter)/present/[competitionId]/page.tsx` (3 lines, empty `<main />`) — Story 6.3 replaces with client component.
- **Existing empty directory to populate:** `apps/web/src/components/presenter/` — Story 6.3 creates presenter components here.
- **Auth already configured:** `proxy.ts` line 6 protects `/present/(.*)` with Clerk auth. No changes needed.

## Tasks / Subtasks

- [x] Task 1: Update `(presenter)/layout.tsx` with dark mode and presenter chrome (AC: #1, #8)
  - [x] `apps/web/src/app/(presenter)/layout.tsx` — REWRITE:
    ```typescript
    export default function PresenterLayout({ children }: { children: React.ReactNode }) {
      return <div className="dark min-h-screen bg-zinc-950 text-zinc-50">{children}</div>;
    }
    ```
    Dark mode enforced by default (same pattern as `(public)/layout.tsx`). Zinc-950 background for maximum contrast. No sidebar, no navigation, no header — pure content wrapper.

- [x] Task 2: Build `PresenterPage` client component (AC: #1, #2, #4, #7)
  - [x] `apps/web/src/app/(presenter)/present/[competitionId]/page.tsx` — REWRITE as a `'use client'` component:
    - Uses `useParams<{ competitionId: string }>()` from `'next/navigation'` to get competitionId (client component pattern per project-context rule).
    - Uses `useAuth()` from `@clerk/nextjs` to get Clerk token (same pattern as `DashboardLiveIsland`).
    - Uses `trpc.tournament.getCompetition.useQuery({ competitionId })` for competition metadata (name, status, cypherCompletedAt, soloMode).
    - Uses `trpc.tournament.getDashboardSnapshot.useQuery({ competitionId })` for scoring progress KPIs + top standings.
    - Uses `trpc.tournament.getBracket.useQuery({ competitionId })` for bracket state (current matchup, next matchup, champion).
    - Wires `useAdminSocket` for real-time updates — invalidates all three queries on relevant events.
    - Renders `<PresenterView>` with derived presenter data.
    - Shows connection status badge in fixed corner (same `STATUS_COLORS` / `STATUS_LABELS` pattern as Stories 6.1/6.2/4.1).
    - On `connectionStatus === 'reconnecting' | 'disconnected'`, wraps content in `<div className="opacity-60 transition-opacity">`.
  - [x] **Why client-only, not SSR?** The presenter route requires Clerk JWT auth. The existing admin pattern (`DashboardLiveIsland`) is client-only with `useAuth()` + `useAdminSocket`. SSR would require forwarding Clerk tokens through the server component → tRPC server caller chain, adding complexity for minimal benefit (the view is real-time focused; first paint is a brief loading state while Clerk auth loads). Client-only matches the admin dashboard pattern exactly.

- [x] Task 3: Build `PresenterView` component (AC: #1, #3, #5, #6, #8)
  - [x] `apps/web/src/components/presenter/presenter-view.tsx` (NEW):
    - Pure client component. Props:
      ```typescript
      interface PresenterViewProps {
        competitionName: string;
        currentPhase: 'configuration' | 'cypher' | 'cypher-review' | 'battles' | 'completed';
        // Cypher phase data
        totalScoresSubmitted: number;
        totalScoresExpected: number;
        topStandings: StandingsEntry[];
        // Battles phase data
        currentMatchup: { competitorA: string; competitorB: string; roundLabel: string } | null;
        nextMatchup: { competitorA: string; competitorB: string; roundLabel: string } | null;
        // Champion
        champion: { name: string; seed: number } | null;
      }
      ```
    - **Layout:** Single column, centered text, `px-8 py-8` minimum (32px padding), no chrome.
    - **Competition name:** Always visible at top. `text-3xl font-bold` (30px per UX spec `--text-3xl`).
    - **Phase badge:** Pill under competition name showing current phase in uppercase. Color-coded:
      - configuration → zinc (muted)
      - cypher → blue
      - cypher-review → yellow
      - battles → green
      - completed → gold/amber
    - **Configuration phase (AC #1):** Show "Competition is being set up. Scoring has not started yet." in muted text.
    - **Cypher phase (AC #5):** Show:
      - "CYPHER SCORING" heading in `text-2xl`.
      - Progress bar: `{totalScoresSubmitted} / {totalScoresExpected} scores submitted`.
      - Top 5 standings list: rank + competitor name in `text-xl` (18px minimum). No score values (MC announces names, not numbers). If `topStandings` is empty, show "Waiting for scores..."
    - **Cypher-review phase:** Show "REVIEW IN PROGRESS" + top 5 standings + "Awaiting advancement confirmation."
    - **Battles phase (AC #3):** Show:
      - Current matchup: "NOW BATTLING" label in `text-xl`, then competitor names in `text-[64px] font-bold leading-tight` (UX spec `--text-presenter`). Format: "{CompetitorA}\nvs\n{CompetitorB}" centered. Round label below (e.g., "Quarterfinals").
      - If no current matchup (between rounds): "Awaiting next round..."
      - Next matchup: "UP NEXT" label in `text-lg text-muted-foreground`, then "{CompetitorA} vs {CompetitorB}" in `text-2xl`. If no next matchup, omit section.
    - **Completed phase (AC #6):** Show:
      - "CHAMPION" label in `text-2xl text-yellow-400`.
      - Champion name in `text-[64px] font-bold text-yellow-300` (celebration text).
      - Seed badge: "Seed #{seed}" in `text-xl`.
      - Optional: subtle pulsing border or glow effect on the champion card (CSS only, no animation library).
    - **Responsive:** Text sizes scale down on very small screens via Tailwind `text-[clamp(...)]` or responsive breakpoints, but competitor names never go below `text-5xl` (48px) on mobile per AC #8.
    - `data-testid="presenter-view"` on root container.

- [x] Task 4: Derive presenter data from existing queries (AC: #1, #3, #5, #6)
  - [x] In `PresenterPage` (Task 2), derive all `PresenterViewProps` from the three existing query results:
    - `competitionName` ← `getCompetition.data.name`
    - `currentPhase` ← derive from `getDashboardSnapshot.data.currentPhase` (already computed: configuration / cypher / cypher-review / battles / completed).
    - `totalScoresSubmitted` ← `getDashboardSnapshot.data.totalScoresSubmitted`
    - `totalScoresExpected` ← `getDashboardSnapshot.data.totalScoresExpected`
    - `topStandings` ← `getDashboardSnapshot.data.topStandings.slice(0, 5)`
    - `currentMatchup` ← from `getBracket.data`: find matchups in `currentRoundNumber` where `winnerCompetitorId === null && !isBye`. Take the first one with both competitors assigned. Resolve names from matchup's `competitorA` / `competitorB` objects. Compute `roundLabel(roundNumber, totalRounds)` using the reusable algorithm from Story 6.2.
    - `nextMatchup` ← from `getBracket.data`: next unresolved non-bye matchup after `currentMatchup` in the same round, or first matchup in the next round if current round has only one remaining. If no next matchup, null.
    - `champion` ← from `getBracket.data`: when `championCompetitorId` is set, resolve name and seed from matchups.
  - [x] **roundLabel helper:** Extract a standalone `roundLabel(roundNumber: number, totalRounds: number): string` function. This is the third consumer (admin `bracket-view-panel.tsx`, public `bracket-view.tsx`, now presenter). Extract to a shared utility: `apps/web/src/lib/bracket-utils.ts` — export `roundLabel`. Update the two existing consumers to import from this utility (DRY cleanup that was deferred from Story 6.2).

- [x] Task 5: Wire `useAdminSocket` for real-time sync (AC: #2, #4)
  - [x] In `PresenterPage` (Task 2), wire `useAdminSocket` with the same invalidation matrix as `DashboardLiveIsland`:
    - `onStandingsUpdated` → `utils.tournament.getDashboardSnapshot.setData(...)` to write topStandings directly (same pattern as admin dashboard).
    - `onPhaseTransitioned` → invalidate `getCompetition`, `getDashboardSnapshot`, `getBracket`.
    - `onBracketGenerated` → invalidate `getBracket`, `getCompetition`.
    - `onVoteSubmitted` → invalidate `getBracket`.
    - `onMatchupCompleted` → invalidate `getBracket`.
    - `onMatchupRevoteRequired` → invalidate `getBracket`.
    - `onMatchupTieResolutionRequired` → invalidate `getBracket`.
    - `onBracketAdvanced` → invalidate `getBracket`.
    - `onCompetitionCompleted` → invalidate `getBracket`, `getCompetition`, `getDashboardSnapshot`.
    - `onScoreSubmitted` → invalidate `getDashboardSnapshot` (score counts update).
    - `onCompetitorWithdrawn` → invalidate `getDashboardSnapshot`, `getStandings`.
    - `onCompetitorRescued` → invalidate `getDashboardSnapshot`, `getStandings`.
  - [x] **Why `useAdminSocket` and not `usePublicSocket`?** The presenter needs organizer-level events (judge status, score submitted, revote required, tie resolution) and must join the admin room for AC #4 (real-time sync with admin dashboard). `usePublicSocket` joins the public room and receives only a subset of events.

- [x] Task 6: Tests — presenter page (AC: #1, #2, #4, #7)
  - [x] `apps/web/src/app/(presenter)/present/[competitionId]/page.spec.tsx` (NEW):
    - Renders loading state when `isLoaded === false` (Clerk auth pending).
    - Renders competition name from `getCompetition` data.
    - Renders `PresenterView` when all queries resolve.
    - `phase.transitioned` socket event → `getDashboardSnapshot` + `getBracket` + `getCompetition` invalidate.
    - `matchup.completed` socket event → `getBracket` invalidates.
    - `connectionStatus === 'disconnected'` → wrapper has `opacity-60` class.
    - Connection badge shows correct color/label for each status.
  - [x] Reuse manual `createRoot` + `act` test pattern from Story 6.1/6.2 component specs.
  - [x] Mock `useAuth()` from `@clerk/nextjs` (same pattern as `dashboard-live-island` tests if they exist, or the admin page specs).
  - [x] Mock `useParams()` from `next/navigation` to return `{ competitionId: 'test-comp-id' }`.

- [x] Task 7: Tests — presenter view component (AC: #1, #3, #5, #6, #8)
  - [x] `apps/web/src/components/presenter/presenter-view.spec.tsx` (NEW):
    - **Configuration phase:** renders "Competition is being set up" message, no matchup cards.
    - **Cypher phase:** renders "CYPHER SCORING" heading, progress bar with correct counts, top 5 standings with competitor names.
    - **Cypher phase (no scores):** renders "Waiting for scores..." placeholder.
    - **Cypher-review phase:** renders "REVIEW IN PROGRESS" + standings + "Awaiting advancement confirmation."
    - **Battles phase with current matchup:** renders competitor names in large text, "vs" separator, round label. Renders "UP NEXT" section with next matchup.
    - **Battles phase between rounds:** renders "Awaiting next round..." when no current matchup.
    - **Completed phase:** renders "CHAMPION" label + champion name in large text + seed badge.
    - **Empty states:** gracefully handles null/undefined props for battles data when in cypher phase.

- [x] Task 8: Extract `roundLabel` utility and update consumers (DRY cleanup)
  - [x] `apps/web/src/lib/bracket-utils.ts` (NEW):
    ```typescript
    export function roundLabel(roundNumber: number, totalRounds: number): string {
      if (totalRounds <= 0) return `Round ${roundNumber}`;
      const fromFinal = totalRounds - roundNumber;
      if (fromFinal === 0) return 'Final';
      if (fromFinal === 1) return 'Semifinals';
      if (fromFinal === 2) return 'Quarterfinals';
      const matchupsAtRound = 2 ** (fromFinal + 1);
      return `Round of ${matchupsAtRound}`;
    }
    ```
  - [x] `apps/web/src/components/admin/bracket-view-panel.tsx` — replace local `roundLabel` with import from `@/lib/bracket-utils`.
  - [x] `apps/web/src/components/public/bracket-view.tsx` — replace local `roundLabel` with import from `@/lib/bracket-utils`.
  - [x] Verify all existing bracket tests still pass after the refactor.

- [x] Task 9: Manual verification (AC: #1, #2, #3, #4, #5, #6, #7, #8)
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — must be green.
  - [ ] Manual flow:
    1. Start dev servers. Open `/present/{competitionId}` while NOT logged in → redirected to sign-in (Clerk auth required).
    2. Log in as organizer. Open `/present/{competitionId}` → presenter view loads with competition name and current phase.
    3. Open admin dashboard on laptop simultaneously → both show the same competition state.
    4. During Cypher phase: submit a score from judge/admin → presenter's score count updates within ~2s (no refresh).
    5. Transition to Battles phase from admin → presenter updates to show "BATTLES" phase badge and current matchup within 3s.
    6. During Battles: resolve a matchup → presenter shows the next matchup, previous matchup clears. Competitor names are 64px+.
    7. Complete all rounds → presenter shows champion announcement with large celebration text.
    8. Open on mobile emulation (375px) → single column, centered, large text, dark background, no horizontal scroll. Competitor names are 48px+.
    9. Disconnect Wi-Fi → status badge turns red, content stays at reduced opacity.
    10. Reconnect → status badge turns green, content returns to full opacity.

## Dev Notes

### Client-Only Rendering (Same Pattern as Admin Dashboard)

This is an **authenticated, real-time** view. The pattern follows `DashboardLiveIsland` exactly:

1. `'use client'` component at the page level.
2. `useAuth()` to get Clerk token.
3. `useAdminSocket` to join the admin room with auth.
4. tRPC queries with `enabled: isLoaded && isSignedIn` guard.
5. Socket event handlers invalidate/setData on relevant queries.

**NOT SSR.** The `(presenter)/` route group is auth-protected. SSR would require forwarding the Clerk session cookie through `createServerTrpcClient()` → tRPC server caller, which is not set up (the existing `trpc-server.ts` uses an unauthenticated `httpBatchLink` for public routes). Adding auth-forwarded SSR is non-trivial and out of scope — the admin dashboard proves the client-only pattern works.

[Source: `apps/web/src/components/admin/dashboard-live-island.tsx` — the structural reference for this pattern]

### Presenter Socket: Admin Room, Not Public Room

The presenter uses `useAdminSocket` (NOT `usePublicSocket`) because:

1. **Admin room events** include `score.submitted`, `judge.status-changed`, `vote.submitted`, `matchup.revote-required`, `matchup.tie-resolution-required` — none of which broadcast to the public room.
2. **AC #4** requires exact sync with the admin dashboard. Both must see the same events at the same time. The admin dashboard connects to `competition:{id}:admin`; the presenter must too.
3. The presenter is an authenticated organizer on a second device — architecturally, it IS an admin consumer with a different UI.

The auth requirement is already handled: `proxy.ts` line 6 protects `/present/(.*)` with `auth().protect()`, and `useAdminSocket` requires a Clerk JWT to connect.

[Source: Architecture L1106 — `(presenter)/*` requires Clerk JWT (organizer); `apps/web/src/hooks/use-admin-socket.ts` — emits `join.admin` to join the admin room]

### Data Model: Reuse Existing Queries

The presenter does NOT need a new tRPC procedure. It composes data from three existing protected procedures:

| Procedure              | What the presenter uses                                                          | Refresh strategy                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getCompetition`       | Name, status, cypherCompletedAt                                                  | Invalidate on phase.transitioned, competition.completed                                                |
| `getDashboardSnapshot` | currentPhase, totalScoresSubmitted, totalScoresExpected, topStandings (top 5)    | setData on standings.updated; invalidate on score.submitted, phase.transitioned, competition.completed |
| `getBracket`           | matchups (derive current/next matchup), championCompetitorId, currentRoundNumber | Invalidate on all bracket events                                                                       |

All three are `protectedProcedure` — the presenter's Clerk JWT authorizes them. No privacy boundary concerns (organizer sees their own data).

**Why not a dedicated `getPresenterData` procedure?** The three existing queries cover all presenter needs. A dedicated procedure would duplicate logic and add maintenance burden. The presenter is a light consumer — it doesn't need to be data-optimal (unlike the public surface which needs rate-limited, stripped procedures).

### Current/Next Matchup Derivation

From `getBracket.data`:

1. Filter matchups to `currentRoundNumber` (lowest round with unresolved non-bye matchups).
2. `currentMatchup` = first matchup in that round where `winnerCompetitorId === null && !isBye && competitorA && competitorB` (both competitors assigned, not resolved yet).
3. `nextMatchup` = second such matchup in the same round. If only one remains in the current round, look at the first matchup in round N+1 that has both competitors assigned.
4. If no unresolved matchups exist, both are null (competition may be between rounds or fully completed).

Competitor names come from the matchup's `competitorA.name` / `competitorB.name` fields (already resolved by `getBracket`).

### roundLabel Extraction (DRY Cleanup)

Story 6.2 deferred this: "Story 6.3 or a follow-up can extract to a shared utility if the presenter view also needs it." The presenter DOES need it — this is the 3rd consumer. Extract to `apps/web/src/lib/bracket-utils.ts`.

Three consumers being updated:

1. `apps/web/src/components/admin/bracket-view-panel.tsx` (local `roundLabel` at line ~29)
2. `apps/web/src/components/public/bracket-view.tsx` (local `roundLabel` — duplicated from admin)
3. `apps/web/src/components/presenter/presenter-view.tsx` (NEW — imports from shared utility)

[Source: Story 6.2 dev notes — "roundLabel() is duplicated between admin panel and public bracket view. Acceptable for MVP; extract if Story 6.3 also needs it."]

### UX Typography Scale

Per UX specification:

- Competition name: `--text-3xl` (30px, font-weight 700)
- Competitor names in battles: `--text-presenter` (64px, font-weight 700, line-height 1.1)
- Phase headings: `--text-2xl` (24px, font-weight 700)
- Secondary info (next matchup, round labels): `--text-xl` (18px, font-weight 600)
- Progress text: `--text-lg` (16px, font-weight 500)

Mobile scaling: use `text-5xl lg:text-[64px]` for competitor names (48px on mobile, 64px on desktop). Never below 48px.

[Source: UX spec L728-736 — typography scale; L777-783 — presenter view layout]

### WebSocket Invalidation Matrix (This Story's Contribution)

| Admin socket event                | getCompetition | getDashboardSnapshot   | getBracket |
| --------------------------------- | -------------- | ---------------------- | ---------- |
| `score.submitted`                 | —              | invalidate             | —          |
| `standings.updated`               | —              | setData (topStandings) | —          |
| `phase.transitioned`              | invalidate     | invalidate             | invalidate |
| `bracket.generated`               | invalidate     | —                      | invalidate |
| `vote.submitted`                  | —              | —                      | invalidate |
| `matchup.completed`               | —              | —                      | invalidate |
| `matchup.revote-required`         | —              | —                      | invalidate |
| `matchup.tie-resolution-required` | —              | —                      | invalidate |
| `bracket.advanced`                | —              | —                      | invalidate |
| `competition.completed`           | invalidate     | invalidate             | invalidate |
| `competitor.withdrawn`            | —              | invalidate             | —          |
| `competitor.rescued`              | —              | invalidate             | —          |

This is a subset of the admin dashboard's invalidation matrix — same events, same queries, just fewer UI side-effects (no recent scores list, no judge grid).

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md` (52 rules):

1. **`proxy.ts` not `middleware.ts`** — the presenter route is already protected by `proxy.ts` line 6: `'/present/(.*)'`. Do NOT create a separate middleware.
2. **`useParams<{ competitionId: string }>()` in client components** — NOT `params` prop (that's server components only).
3. **TanStack Query v5 has no `onSuccess` on `useQuery`** — derive state from query data, don't use effects to transform it.
4. **`shadcn` Button + `asChild` silently fails** — N/A for this story (no buttons in the teleprompter view).
5. **No new runtime dependencies.** Pure Tailwind CSS for all styling. No animation libraries.
6. **Comments default to no comments.** Only WHY-non-obvious comments.
7. **Dark mode default** — enforced via `<div className="dark">` wrapper on `(presenter)/layout.tsx`.
8. **Clerk auth pattern:** `useAuth()` returns `{ isLoaded, isSignedIn, getToken }`. Gate queries on `isLoaded && isSignedIn`. Gate socket on `effectiveToken = isLoaded && isSignedIn ? clerkToken : null`.

### Existing Infrastructure (Verified — do NOT Re-implement)

From Story 4.1:

- `DashboardLiveIsland` — **structural reference** for the presenter page (authenticated client-only pattern with `useAuth` + `useAdminSocket` + tRPC queries + socket invalidation).
- `getDashboardSnapshot` — provides `currentPhase`, `totalScoresSubmitted`, `totalScoresExpected`, `topStandings`.

From Story 5.3:

- `getBracket` admin procedure — provides matchups, `championCompetitorId`, `currentRoundNumber`.
- `useAdminSocket` with all 14 event callbacks — **just consume**.
- All bracket socket broadcasts reach the admin room.

From Story 6.1:

- Connection badge pattern (`STATUS_COLORS`, `STATUS_LABELS`, opacity wrapper).
- Dark mode enforcement pattern on `(public)/layout.tsx`.

From Story 6.2:

- `roundLabel()` algorithm — Story 6.3 extracts this to a shared utility.
- `BracketView` champion detection (scanning matchups for champion seed/name).

### Project Structure Notes

**New files:**

```
apps/web/src/lib/bracket-utils.ts                                    (NEW — roundLabel utility)
apps/web/src/components/presenter/presenter-view.tsx                  (NEW)
apps/web/src/components/presenter/presenter-view.spec.tsx             (NEW)
apps/web/src/app/(presenter)/present/[competitionId]/page.spec.tsx    (NEW)
```

**Modified files:**

```
apps/web/src/app/(presenter)/layout.tsx                               (REWRITE: add dark mode wrapper)
apps/web/src/app/(presenter)/present/[competitionId]/page.tsx         (REWRITE: client component with auth + socket + queries)
apps/web/src/components/admin/bracket-view-panel.tsx                  (import roundLabel from shared utility)
apps/web/src/components/public/bracket-view.tsx                       (import roundLabel from shared utility)
_bmad-output/implementation-artifacts/sprint-status.yaml              (story status: backlog → ready-for-dev)
```

**Alignment with unified project structure:**

- Presenter components land in `apps/web/src/components/presenter/` — matches the architecture's component organization (`admin/`, `judge/`, `presenter/`, `public/` siblings).
- `(presenter)/` route group already exists; story fills in the stubs.
- No new tRPC procedures — reuses existing `protectedProcedure` queries.
- Shared utility lands in `apps/web/src/lib/` — consistent with `trpc-server.ts`, `trpc.tsx`.

**Detected variances:**

- The `(presenter)/` route URL is `/present/{competitionId}` (not `/presenter/...`). This is because Next.js route groups use parens for non-URL-segment grouping. The URL segment is `present`, the route group is `(presenter)`. Consistent with the scaffold.
- Connection status badge rendering is duplicated for the 3rd time (admin, public standings, public bracket, now presenter). Story 6.3 does NOT extract a shared `ConnectionBadge` component — the duplication is 4 identical constant maps + 1 div, not worth a component abstraction yet.

### Testing Standards

- **Test framework:** Vitest (web: jsdom). Use manual `createRoot` + `act` pattern from Story 6.1/6.2 component specs.
- **Mock strategy:**
  - `@clerk/nextjs` `useAuth` → mock return `{ isLoaded: true, isSignedIn: true, getToken: () => Promise.resolve('test-token') }`.
  - `next/navigation` `useParams` → mock return `{ competitionId: 'test-comp-id' }`.
  - tRPC queries → mock via `trpc.tournament.*.useQuery` return values.
  - `useAdminSocket` → mock to capture callback props and trigger them in tests.
- **Coverage target:** every phase state in `PresenterView` (configuration, cypher, cypher empty, cypher-review, battles with matchup, battles between rounds, completed). Every socket event invalidation in the page component. Connection status badge all 3 states.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L937-962 — Story 6.3 ACs + FR mapping]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L491 ((presenter)/ route group), L500 (presenter components dir), L936 (teleprompter.tsx), L1106 (Clerk JWT auth, teleprompter no chrome, mobile primary)]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L26 (dual-device workflow), L31 (Elena persona), L39-40 (presenter = dedicated MC view), L44 (real-time sync mandatory), L58 (presenter as differentiator), L101 (presenter device/interaction), L624-651 (presenter flow mockup), L704 (dark mode default), L728-730 (text-3xl/text-presenter typography), L777-783 (presenter layout: single column, centered, massive padding, no chrome)]
- [Source: `_bmad-output/project-context.md` (52 rules). Particularly: proxy.ts auth, useParams client pattern, TanStack Query v5, no new deps, dark mode.]
- [Source: `apps/web/src/proxy.ts:6` — `/present/(.*)` protected route]
- [Source: `apps/web/src/hooks/use-admin-socket.ts` — admin socket hook with all 14 callbacks]
- [Source: `apps/web/src/components/admin/dashboard-live-island.tsx` — structural reference for authenticated real-time client island]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:968` — `getCompetition` (protectedProcedure)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1924` — `getBracket` (protectedProcedure)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:3485` — `getDashboardSnapshot` (protectedProcedure)]
- [Source: `apps/web/src/components/admin/bracket-view-panel.tsx:29-39` — roundLabel algorithm to extract]
- [Source: `apps/web/src/components/public/bracket-view.tsx` — roundLabel duplicate to consolidate]

### Previous Story Intelligence

**Story 6.2 — Full Battles Bracket View on Public URL (done 2026-05-07):**

1. `roundLabel()` was intentionally duplicated with a note: "extract if Story 6.3 also needs it." Story 6.3 triggers the extraction.
2. Connection badge pattern is now in 2 components (standings + bracket client islands). Story 6.3 adds a 3rd consumer. Still not worth extracting to a shared component — 4 constant maps is simpler than a component abstraction.
3. Adversarial review fixed `MatchupCard` slot B `isBye` prop — the bracket data is now correct. Story 6.3 reads from `getBracket` and can trust the bye flags.

**Story 6.1 — Public Standings with Score Breakdowns (done 2026-05-06):**

1. SSR runtime decision: chose HTTP-fallback path. Story 6.3 does NOT use SSR (authenticated route), so this is N/A.
2. `useQuery({ initialData })` pattern — N/A (no SSR to seed from).
3. The code review found broadcast sites calling `computeStandings` without enrichment — fixed with `broadcastEnrichedStandings` helper. Story 6.3 consumes enriched standings via `getDashboardSnapshot.topStandings` which calls `computeStandings` — the enrichment is N/A for top-5 display (presenter doesn't show per-criterion breakdowns).
4. Dark mode enforcement established. Story 6.3 applies the same pattern to `(presenter)/layout.tsx`.

**Story 4.1 — Live Organizer Dashboard & Judge Monitoring (done):**

1. `DashboardLiveIsland` is the direct structural ancestor of `PresenterPage`. Same auth pattern, same socket hook, same invalidation strategy — just a radically different UI.
2. The `getDashboardSnapshot` includes `currentPhase` derivation (configuration/cypher/cypher-review/battles/completed) — the presenter reuses this directly.

### Git Intelligence (recent commits)

```
5729552 chore: checkpoint Story 5.3 + review fixes + Epic 5 retro
ae94735 chore: checkpoint Stories 3.5-5.2 + Story 5.2 review fixes
```

Stories 6.1 and 6.2 are in unstaged changes (not yet committed). Story 6.3 must be developed on top of both. Verify all modified files from 6.1/6.2 are available before starting. Key files to verify:

- `apps/web/src/hooks/use-public-socket.ts` (Story 6.1 extended)
- `apps/web/src/lib/trpc-server.ts` (Story 6.1 created)
- `apps/web/src/components/public/bracket-view.tsx` (Story 6.2 created — has local `roundLabel` to refactor)
- `apps/web/src/components/admin/bracket-view-panel.tsx` (has local `roundLabel` to refactor)
- `apps/web/src/app/(public)/layout.tsx` (dark mode wrapper from Story 6.1)

### Project Context Reference

`_bmad-output/project-context.md` (52 rules) governs ALL implementation. Story 6.3 introduces NO new framework rules. It exercises:

- The **authenticated client-only pattern** (established in Story 4.1's `DashboardLiveIsland`).
- The **admin socket room** pattern for real-time organizer views.
- The **phase derivation** logic from `getDashboardSnapshot`.
- The **dark mode enforcement** pattern from `(public)/layout.tsx`.

No new tRPC procedures, no new socket events, no new shared types — Story 6.3 is a pure frontend composition of existing backend capabilities.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with one post-hoc typecheck fix (missing `rank` field in test helpers).

### Completion Notes List

1. **Task 8 executed first** (roundLabel DRY extraction) since Tasks 2-5 depended on the shared utility.
2. **Task order**: 8 → 1 → 3 → 2/4/5 (combined in page.tsx) → 7 → 6 → typecheck fix.
3. All 9 tasks complete. Turbo gate (lint + typecheck + test) passes: 149/149 tests, 0 lint errors, 0 type errors.
4. Post-implementation fix: `StandingsEntry` type requires a `rank` field (added in a prior story). Both test files needed `rank` added to mock standings entries.
5. Manual verification (Task 9 step 2) deferred to developer — requires running dev servers with Clerk auth.

### Change Log

- Fixed missing `rank` field in `makeStandingsEntry` helper in `presenter-view.spec.tsx`
- Fixed missing `rank` field in inline mock standings entry in `page.spec.tsx`

#### Senior Developer Review (AI) — 2026-05-07

**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Outcome:** Approve with fixes applied

**Findings fixed (6):**

- [H1] Unsafe `as` cast on `currentPhase` — added validation with fallback to 'configuration' for unknown phases
- [M1] `StandingsList` used `idx + 1` instead of `entry.rank` — replaced with `entry.rank`
- [M2] `animate-pulse` on champion card pulsed entire content including text — replaced with CSS `champion-glow` animation targeting border/shadow only
- [M3] Completed phase rendered blank when champion data not yet loaded — added loading fallback message
- [M4] Missing tests for connection status opacity wrapper — added 2 tests verifying `opacity-60` on disconnect and removal on connect
- [M5] Missing `onError` handler for socket errors — added handler + error banner display (consistent with DashboardLiveIsland)

**Findings noted but not fixed (2 LOW):**

- [L1] CypherDisplay missing dedicated `text-2xl` heading (relies on shared badge pill in `text-sm`)
- [L2] Stale Story 5.3 reference in bracket-view-panel.tsx comment (pre-existing, not introduced by 6.3)

**Test results after fixes:** 151/151 tests pass, 0 lint errors, 0 type errors.

### File List

**New files:**

- `apps/web/src/lib/bracket-utils.ts` — shared `roundLabel` utility (extracted from 2 duplicates)
- `apps/web/src/components/presenter/presenter-view.tsx` — pure presentational component with phase-specific displays
- `apps/web/src/components/presenter/presenter-view.spec.tsx` — 10 tests covering all 5 phases + edge cases
- `apps/web/src/app/(presenter)/present/[competitionId]/page.spec.tsx` — 10 tests covering auth, queries, socket events, connection status

**Modified files:**

- `apps/web/src/app/(presenter)/layout.tsx` — dark mode wrapper added
- `apps/web/src/app/(presenter)/present/[competitionId]/page.tsx` — full client component with auth + socket + query composition + socket error handling
- `apps/web/src/components/admin/bracket-view-panel.tsx` — import `roundLabel` from shared utility (removed local copy)
- `apps/web/src/components/public/bracket-view.tsx` — import `roundLabel` from shared utility (removed local copy)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status: backlog → done
- `_bmad-output/implementation-artifacts/6-3-presenter-mc-teleprompter-view.md` — status → done, review notes added
