# Story 6.2: Full Battles Bracket View on Public URL

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a competitor and audience member watching the projected screen at the venue,
I want to see the full elimination bracket — every round, every matchup, every winner, and the final champion — updating in real-time on the public display,
so that everyone in the venue can follow the competition trajectory, anticipate upcoming matchups, and celebrate the champion the moment they're crowned.

## Acceptance Criteria

1. **Given** the Battles phase is active (`competitions.cypherCompletedAt IS NOT NULL`), **when** the public URL `/{competitionId}/bracket` is viewed on a projected screen or any device, **then** the complete bracket is displayed: all matchups across all rounds, round labels (Round of N / Quarterfinals / Semifinals / Final), seed badges, winners advancing to the next round, and the final champion once determined (FR46). The page is **server-rendered** for fast initial paint (same SSR + client-island pattern as Story 6.1). No authentication required.

2. **Given** a matchup result is confirmed (all judges voted, majority winner determined), **when** the `matchup.completed` / `bracket.advanced` / `competition.completed` socket event reaches a connected public viewer, **then** the bracket view updates **within 10 seconds** of the originating commit, with NO manual refresh — the TanStack Query cache is invalidated and refetched (NFR3).

3. **Given** a bye exists in the bracket (qualifier count is not a power of two), **when** the bracket is displayed, **then** the bye slot is visually distinct — dashed border, "BYE" text, and a label indicating the seeded competitor advances automatically. Byes are NOT hidden; the bracket structure must be clear.

4. **Given** the competition is complete (final matchup resolved), **when** the bracket view renders, **then** a prominent champion celebration banner is displayed at the top — competitor name, seed number, and the champion's winning path through the bracket is visually highlighted (e.g., green border on all matchups the champion won).

5. **Given** the Battles phase has NOT started yet (`cypherCompletedAt IS NULL`), **when** the bracket URL is loaded, **then** an empty state is shown — "Bracket will appear when the Battles phase begins." with a soft live-pulse indicator (same pattern as Story 6.1 empty state). NOT a 404, NOT a blank page.

6. **Given** the page is opened on (a) a 1920x1080 projector, (b) a 1280px laptop, and (c) a 375px phone, **when** the bracket renders, **then** layout is readable on each — desktop (>=1024px) shows a horizontal multi-column bracket layout with rounds as columns and connector lines showing progression; mobile (<1024px) shows a vertical stacked layout with one round per section. Dark mode is the **default theme** (inherited from `(public)/layout.tsx`). WCAG AA contrast minimum (4.5:1 normal, 3:1 large).

7. **Given** the connection drops between the client and the gateway, **when** the public socket reports `disconnected` or `reconnecting`, **then** a visible status badge in a fixed corner reflects the state (green / yellow / red), and the most-recently-known bracket remains visible at reduced opacity (same pattern as Story 6.1 AC #7).

8. **Given** an unknown or unauthorized `competitionId` is passed, **when** the SSR loader runs, **then** the page renders Next.js's `not-found.tsx` (404) — no generic crash, no leaked stack trace.

9. **Given** a `phase.transitioned` event fires (Cypher → Battles transition), **when** the bracket page is already open (viewer was watching standings and navigated to bracket), **then** the bracket query invalidates and the freshly-generated bracket appears within 10 seconds — no manual navigation or refresh needed.

> **Scope note:** Story 6.2 covers **the bracket page only**. The standings page with score breakdowns is Story 6.1 (done). The presenter / MC teleprompter view is Story 6.3. Cross-page navigation (tabs between standings and bracket) is deferred to Story 6.3 or a follow-up.

## Prerequisites

- **Story 6.1 must be merged** (it is — `done`) — establishes the SSR + client-island pattern for the `(public)/` route group, the `createServerTrpcClient()` utility, `usePublicSocket` integration, dark mode on `(public)/layout.tsx`, and the connection-status badge pattern.
- **Story 5.3 must be merged** (it is — `done`) — provides `getBracket` (admin, protectedProcedure), bracket progression logic, `matchup.completed` / `bracket.advanced` / `competition.completed` broadcasts, champion determination, and `usePublicSocket` listeners for all bracket events.
- **Existing stub to REWRITE:** `apps/web/src/app/(public)/[competitionId]/bracket/page.tsx` (3 lines, empty `<main />`). Story 6.2 replaces this with SSR root + client island.
- **Existing admin reference to MIRROR (not modify):** `apps/web/src/components/admin/bracket-view-panel.tsx` (206 lines) — the admin bracket panel uses a vertical stacked layout with `roundLabel()`, `MatchupSlot`, champion banner. Story 6.2 builds the public equivalent with a responsive horizontal/vertical layout. DO NOT modify the admin panel.
- **Existing `(public)/layout.tsx` — LEAVE ALONE:** Already has `<div className="dark">` wrapper from Story 6.1. No changes needed.

## Tasks / Subtasks

- [x] Task 1: Define public bracket types in `packages/shared` (AC: #1)
  - [x] `packages/shared/types/bracket.types.ts` — new file. Define:

    ```typescript
    export interface PublicBracketCompetitor {
      name: string;
      participantId: string;
    }

    export interface PublicBracketMatchup {
      id: string;
      roundNumber: number;
      bracketPosition: number;
      competitorAId: string | null;
      competitorBId: string | null;
      seedA: number | null;
      seedB: number | null;
      isBye: boolean;
      winnerCompetitorId: string | null;
      competitorA: PublicBracketCompetitor | null;
      competitorB: PublicBracketCompetitor | null;
    }

    export interface PublicBracketData {
      matchups: PublicBracketMatchup[];
      championCompetitorId: string | null;
      currentRoundNumber: number | null;
    }
    ```

  - [x] `packages/shared/index.ts` — add `export * from './types/bracket.types';`

- [x] Task 2: Add `tournament.getPublicBracket` public procedure (AC: #1, #5, #8)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — new `t.procedure` (NOT `protectedProcedure`). Input: `{ competitionId: z.string().min(1) }`. Returns `PublicBracketData`.
  - [x] Steps:
    1. `enforceRateLimit('getPublicBracket:{ip}', PUBLIC_RL)` — same budget as `getStandings` / `getPublicNextMatchups`.
    2. Verify competition exists (single SELECT on `competitions` where `id = competitionId`). If not found, throw `TRPCError({ code: 'NOT_FOUND' })`. **Do not** join through `organizerClerkId` — public surface, no organizer context. **Do not** use RLS transaction — `t.procedure` has no userId.
    3. Short-circuit: if `cypherCompletedAt IS NULL` → return `{ matchups: [], championCompetitorId: null, currentRoundNumber: null }` (battles not active; empty-state rendering on client).
    4. Query `battle_matchups` ordered by `roundNumber ASC, bracketPosition ASC`. Select only public-safe columns: `id`, `roundNumber`, `bracketPosition`, `competitorAId`, `competitorBId`, `seedA`, `seedB`, `isBye`, `winnerCompetitorId`. **Strip admin fields:** `tieStatus`, `revoteCount`, `organizerDecisionReason`, `organizerDecisionBy`, `completedAt`.
    5. Collect all competitor IDs, batch-resolve names from `competitors` table (same pattern as `getBracket`).
    6. Compute `championCompetitorId`: if `competitions.status === 'completed'`, find the highest-round matchup with a `winnerCompetitorId`. Otherwise null.
    7. Compute `currentRoundNumber`: lowest round with at least one unresolved non-bye matchup. Null when bracket is empty or fully resolved.
    8. Return `{ matchups, championCompetitorId, currentRoundNumber }`.
  - [x] **Why a new procedure instead of making `getBracket` public?** `getBracket` is `protectedProcedure` (uses RLS transaction, returns `tieStatus`, `revoteCount`, `organizerDecisionReason`, `organizerDecisionBy`, `completedAt`). Making it public would leak admin-only audit data. A separate public procedure respects the privacy boundary.

- [x] Task 3: Convert bracket page stub to SSR + client island (AC: #1, #5, #8)
  - [x] `apps/web/src/app/(public)/[competitionId]/bracket/page.tsx` — REWRITE as server component:

    ```typescript
    import { notFound } from 'next/navigation';
    import { TRPCClientError } from '@trpc/client';
    import { createServerTrpcClient } from '@/lib/trpc-server';
    import { BracketClientIsland } from '@/components/public/bracket-client-island';

    interface PageProps {
      params: Promise<{ competitionId: string }>;
    }

    export default async function BracketPage({ params }: PageProps) {
      const { competitionId } = await params;
      const client = createServerTrpcClient();
      let initialBracket;
      try {
        initialBracket = await client.tournament.getPublicBracket.query({ competitionId });
      } catch (err) {
        if (err instanceof TRPCClientError && err.data?.code === 'NOT_FOUND') {
          notFound();
        }
        throw err;
      }
      return <BracketClientIsland competitionId={competitionId} initialBracket={initialBracket} />;
    }
    ```

    Uses Next.js 16 async `params: Promise<>`. Same pattern as Story 6.1's standings page.

- [x] Task 4: Build `BracketClientIsland` component (AC: #2, #7, #9)
  - [x] `apps/web/src/components/public/bracket-client-island.tsx` (NEW):
    - `'use client';`
    - Props: `{ competitionId: string; initialBracket: PublicBracketData }`.
    - Use `trpc.tournament.getPublicBracket.useQuery({ competitionId }, { initialData: initialBracket })` to seed TanStack Query cache from SSR.
    - Wire `usePublicSocket({ competitionId, ... })`:
      - `onPhaseTransitioned` → invalidate `getPublicBracket` (bracket may have just appeared).
      - `onMatchupCompleted` → invalidate `getPublicBracket` (matchup winner changed).
      - `onBracketAdvanced` → invalidate `getPublicBracket` (round advanced, new matchups populated).
      - `onCompetitionCompleted` → invalidate `getPublicBracket` (champion determined).
      - `onStandingsUpdated` → no-op (standings, not bracket).
    - Show fixed-corner connection badge (same `STATUS_COLORS` / `STATUS_LABELS` maps as Story 6.1's `standings-client-island.tsx`).
    - On `connectionStatus === 'reconnecting' | 'disconnected'`, wrap bracket in `<div className="opacity-60 transition-opacity">`.
    - Render `<BracketView bracket={bracket} />`.

- [x] Task 5: Build `BracketView` component (AC: #1, #3, #4, #5, #6)
  - [x] `apps/web/src/components/public/bracket-view.tsx` (NEW):
    - Pure client component. Props: `{ bracket: PublicBracketData }`.
    - **Empty state (AC #5):** when `bracket.matchups.length === 0`:
      ```tsx
      <div className="text-muted-foreground py-8 text-center" data-testid="bracket-empty">
        <span
          className="mb-3 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse"
          aria-hidden="true"
        />
        <p>Bracket will appear when the Battles phase begins.</p>
      </div>
      ```
    - **Champion banner (AC #4):** when `bracket.championCompetitorId` is not null, display a prominent banner at the top:
      ```tsx
      <div
        data-testid="bracket-champion"
        className="rounded-md border border-yellow-500/40 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-200"
      >
        Champion: {championName} (Seed {championSeed})
      </div>
      ```
      Derive champion name and seed by scanning matchups for `competitorAId` or `competitorBId` matching `championCompetitorId`.
    - **Round labels:** reuse the `roundLabel(roundNumber, totalRounds)` algorithm from `bracket-view-panel.tsx`:
      - Final, Semifinals, Quarterfinals for the last 3 rounds.
      - `Round of N` (NCAA convention) for earlier rounds.
      - Derive `totalRounds` from `Math.log2(round1Count) + 1` where `round1Count` is the number of matchups in round 1.
    - **Desktop layout (>=1024px):** Horizontal multi-column bracket. CSS flexbox with rounds as columns. Each column contains matchup cards. Use vertical spacing to visually align matchups: round 1 matchups have `flex: 1`, round 2 matchups have `flex: 2`, round 3 `flex: 4`, etc. (each matchup centers between its two feeder matchups). CSS `::before` / `::after` pseudo-elements draw horizontal connector lines from each matchup to the next round's column. Use `border-right` on the right side of each matchup and `border-top`/`border-bottom` on the vertical join between paired matchups.
    - **Mobile layout (<1024px):** Vertical stacked rounds (same structure as admin `bracket-view-panel.tsx`). Each round is a `<section>` with round label heading and vertically-stacked matchup cards.
    - **Champion path highlighting (AC #4):** When `championCompetitorId` is set, trace all matchups where `winnerCompetitorId === championCompetitorId` and apply a highlight class (green border) to those matchup cards.
    - **Matchup card** (inline or as `BracketMatchupCard` sub-component):
      - Two competitor slots (name + seed badge + participantId).
      - Winner slot gets green border/bg highlight and a "Winner" label.
      - Bye slot gets dashed border, "BYE" text, and blue "advances automatically" indicator.
      - Empty/TBD slot (no competitor assigned yet — e.g., a future round matchup before feeder matchups resolve) shows "TBD" in muted text.
      - data-testid: `bracket-matchup-{id}`.

- [x] Task 6: Tests — backend (AC: #1, #2, #5, #8)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — new `tournament.getPublicBracket` describe:
    - **Empty competitionId** → Zod rejection.
    - **Competition not found** → `NOT_FOUND`.
    - **`cypherCompletedAt === null`** → returns `{ matchups: [], championCompetitorId: null, currentRoundNumber: null }`.
    - **Battles active, bracket populated** → returns matchups with competitor names resolved, seed badges, bye matchups present. Admin-only fields (`tieStatus`, `revoteCount`, `organizerDecisionReason`, `organizerDecisionBy`, `completedAt`) are NOT present in the response.
    - **Champion detection** → when `competitions.status === 'completed'`, `championCompetitorId` is set to the highest-round winner.
    - **`currentRoundNumber` derivation** → lowest round with unresolved non-bye matchup.
    - **Rate limit** → fires after 60 calls in same window from same IP.
    - **Public caller (no userId)** → succeeds (no auth required).
  - [x] Reuse existing `makeCallerFor` + mock DB patterns from Story 6.1's `getPublicNextMatchups` tests as structural reference.

- [x] Task 7: Tests — frontend (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] `apps/web/src/components/public/bracket-client-island.spec.tsx` (NEW):
    - Renders bracket from `initialBracket` prop without tRPC fetch on first render.
    - `matchup.completed` socket event → `getPublicBracket` invalidates.
    - `bracket.advanced` socket event → `getPublicBracket` invalidates.
    - `connectionStatus === 'disconnected'` → wrapper has `opacity-60` and stale indicator.
  - [x] `apps/web/src/components/public/bracket-view.spec.tsx` (NEW):
    - Empty matchups → renders empty-state with pulse indicator.
    - 4-matchup bracket (8 competitors) → renders all rounds with correct round labels.
    - Champion banner appears when `championCompetitorId` is set.
    - Champion path matchups have green highlight class.
    - Bye slot renders with dashed border and "BYE" text.
    - TBD slots show "TBD" in future round matchups.
    - Winner slot shows "Winner" label with green styling.
  - [x] **No SSR test for the page itself** — same rationale as Story 6.1.

- [x] Task 8: Manual verification (AC: #1, #2, #3, #4, #5, #6, #7, #8, #9)
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — must be green.
  - [x] Manual flow:
    1. Start dev servers. Open `/{competitionId}/bracket` before battles start → empty state with pulse.
    2. Complete cypher phase → bracket appears without refresh (phase.transitioned invalidation).
    3. Submit votes and resolve a matchup → bracket updates showing winner within ~2s.
    4. Complete all rounds → champion banner appears.
    5. Open on mobile emulation (375px) → vertical stacked layout, readable.
    6. Open on desktop (1920px) → horizontal bracket layout with connector lines.
    7. Disconnect Wi-Fi → status badge turns red, bracket stays at reduced opacity.
    8. Bogus competitionId → 404 page, no stack trace.
    9. Check DevTools Network → no Authorization header on bracket calls.

## Dev Notes

### SSR + Client Island Pattern (Established in Story 6.1)

This is the **second** SSR route in the repo. Follow exactly the same pattern as Story 6.1:

1. Server component does initial fetch via `createServerTrpcClient()` (from `apps/web/src/lib/trpc-server.ts`).
2. Server component passes initial data to a `'use client'` island as props.
3. Client island seeds TanStack Query cache with `initialData` prop on `useQuery`.
4. Client island wires `usePublicSocket` for real-time updates via cache invalidation.

The tRPC server caller uses `httpBatchLink` — same transport as the browser client. No NestJS bootstrap in the Next.js runtime.

[Source: `apps/web/src/lib/trpc-server.ts`; `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` — Story 6.1 reference implementation]

### Public Bracket Procedure vs. Admin getBracket

The existing `getBracket` is `protectedProcedure` (line 1924 of `tournament.router.ts`). It:

- Uses RLS transaction (`SET LOCAL session.current_organizer_id`)
- Returns admin-only fields: `tieStatus`, `revoteCount`, `organizerDecisionReason`, `organizerDecisionBy`, `completedAt`
- Requires authenticated organizer

The new `getPublicBracket` is `t.procedure` (public, rate-limited). It:

- Has no RLS transaction (no organizer context for public viewers)
- Strips admin-only fields (privacy boundary)
- Returns only publicly-safe data
- Same core logic (query matchups → resolve names → compute champion/currentRound)

**Do NOT** modify `getBracket` to make it dual-purpose. Keep them separate — the admin procedure's RLS transaction + audit fields are load-bearing for the organizer dashboard.

[Source: `apps/api/src/trpc/routers/tournament.router.ts:1924-2031` — `getBracket`]

### WebSocket Invalidation Matrix (This Story's Contribution)

| Public socket event     | Effect on `getPublicBracket` cache |
| ----------------------- | ---------------------------------- |
| `standings.updated`     | no-op                              |
| `phase.transitioned`    | invalidate                         |
| `matchup.completed`     | invalidate                         |
| `bracket.advanced`      | invalidate                         |
| `competition.completed` | invalidate                         |

All bracket-relevant events are low-frequency. Invalidate-and-refetch is appropriate (unlike the `standings.updated` hot path which uses `setData` writethrough).

[Source: Story 6.1 dev notes — WebSocket invalidation matrix]

### Bracket Layout: Horizontal on Desktop, Vertical on Mobile

**Desktop (>=1024px):** CSS flex-based horizontal bracket. Each round is a column. Matchup cards are vertically positioned within each column such that round N+1 matchups center between the two round N matchups that feed into them. Achieve this with flex `grow` properties: round 1 matchups `flex: 1`, round 2 `flex: 2`, round 3 `flex: 4`, etc. CSS pseudo-elements draw connector lines (horizontal bars from matchup → next column, vertical bars joining paired feeders).

**Mobile (<1024px):** Vertical stacked rounds — same structure as the admin `bracket-view-panel.tsx`. Each round is a `<section>` with a heading and vertically stacked matchup cards. No connector lines on mobile (too cramped).

**Responsive switch:** Use Tailwind responsive classes (`lg:flex-row` vs `flex-col`). The `1024px` breakpoint (`lg:`) separates the two layouts.

**No SVG, no canvas, no charting library.** Pure CSS + HTML. This is the 6th-epic streak with zero new runtime dependencies.

[Source: UX spec L790 — "Standings table: compact rows (36px)"; Admin bracket panel at `apps/web/src/components/admin/bracket-view-panel.tsx` — vertical layout reference]

### Round Label Algorithm (Reuse from Admin Panel)

The admin `bracket-view-panel.tsx` defines `roundLabel(roundNumber, totalRounds)`:

```typescript
function roundLabel(roundNumber: number, totalRounds: number): string {
  if (totalRounds <= 0) return `Round ${roundNumber}`;
  const fromFinal = totalRounds - roundNumber;
  if (fromFinal === 0) return 'Final';
  if (fromFinal === 1) return 'Semifinals';
  if (fromFinal === 2) return 'Quarterfinals';
  const matchupsAtRound = 2 ** (fromFinal + 1);
  return `Round of ${matchupsAtRound}`;
}
```

Derive `totalRounds` from `Math.log2(round1MatchupCount) + 1`. This is duplicated from the admin panel — acceptable MVP duplication. Story 6.3 or a follow-up can extract to a shared utility if the presenter view also needs it.

[Source: `apps/web/src/components/admin/bracket-view-panel.tsx:29-39`]

### Champion Path Highlighting

When `championCompetitorId` is set, trace the champion's journey through the bracket:

1. Collect all matchup IDs where `winnerCompetitorId === championCompetitorId`.
2. Apply a distinct CSS class to those matchup cards (e.g., `border-green-500 bg-green-50 dark:bg-green-950/20`).
3. On the desktop horizontal layout, the highlighted matchups form a visual "path" through the bracket columns.

[Source: Epic 6, Story 6.2 AC #4 — "name, seed, and path through the bracket are all visible"]

### Connection Status Badge (Same as Story 6.1)

Reuse the same `STATUS_COLORS` / `STATUS_LABELS` maps and rendering pattern from `standings-client-island.tsx`. This is minor duplication — Story 6.3 or a follow-up can extract a shared `ConnectionBadge` component if the presenter view also needs it.

[Source: `apps/web/src/components/public/standings-client-island.tsx:9-19`]

### Privacy Boundary

The public bracket procedure returns ONLY:

- Matchup structure (id, roundNumber, bracketPosition)
- Competitor names and participantIds (already public on standings page)
- Seeds and bye status
- Winner IDs

It does NOT return:

- `tieStatus` — internal competition management state
- `revoteCount` — internal audit data
- `organizerDecisionReason` — private organizer justification
- `organizerDecisionBy` — organizer identity
- `completedAt` — internal timestamp

This matches the privacy boundary established in Story 6.1 (where `scoresByJudge` was stripped on the client side).

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md` (52 rules — READ that file in full):

1. **Next.js 16 async params** — `params: Promise<{ competitionId }>` in server component. Client components use `useParams<...>()`.
2. **`proxy.ts` not `middleware.ts`** — verify public URLs are NOT redirected to sign-in.
3. **TanStack Query v5 has no `onSuccess` on `useQuery`** — use invalidation from socket events.
4. **Score values are strings with 2 decimal places** — N/A for bracket (no scores displayed), but don't introduce numeric displays.
5. **No new runtime dependencies.** Pure CSS + HTML for bracket layout.
6. **Public procedures must be rate-limited.** `enforceRateLimit('getPublicBracket:{ip}', PUBLIC_RL)`.
7. **Comments default to no comments.** Only WHY-non-obvious comments.
8. **`shadcn` Button + `asChild` silently fails** — for any link buttons, use `<Link className={buttonVariants(...)}>`.
9. **Dark mode default** — inherited from `(public)/layout.tsx` `<div className="dark">` wrapper.

### Existing Infrastructure (Verified — do NOT Re-implement)

From Story 5.3:

- `getBracket` admin procedure — **mental model** for `getPublicBracket` (same query pattern, minus admin fields).
- `usePublicSocket` with all 5 socket callbacks — **just consume**.
- `broadcastMatchupCompleted`, `broadcastBracketAdvanced`, `broadcastCompetitionCompleted` — already broadcast to public rooms.
- `BracketViewPanel` admin component — **structural reference** for matchup cards, round labels, champion banner.

From Story 6.1:

- `createServerTrpcClient()` — SSR tRPC caller, ready to use.
- `standings-client-island.tsx` — **structural reference** for the client island pattern (connection badge, opacity wrapper, `usePublicSocket` wiring).
- `(public)/layout.tsx` — dark mode wrapper, leave as-is.

### Project Structure Notes

**New files:**

```
packages/shared/types/bracket.types.ts                                (NEW — public bracket types)
apps/web/src/components/public/bracket-client-island.tsx              (NEW)
apps/web/src/components/public/bracket-client-island.spec.tsx         (NEW)
apps/web/src/components/public/bracket-view.tsx                       (NEW)
apps/web/src/components/public/bracket-view.spec.tsx                  (NEW)
```

**Modified files:**

```
packages/shared/index.ts                                              (add bracket.types export)
apps/api/src/trpc/routers/tournament.router.ts                        (add getPublicBracket procedure)
apps/api/src/trpc/routers/tournament.router.spec.ts                   (add getPublicBracket tests)
apps/web/src/app/(public)/[competitionId]/bracket/page.tsx            (REWRITE: SSR + client island)
_bmad-output/implementation-artifacts/sprint-status.yaml              (story status: backlog → ready-for-dev → in-progress → done)
```

**Alignment with unified project structure:**

- Public components land in `apps/web/src/components/public/` — consistent with Story 6.1's component placement.
- Shared bracket types land in `packages/shared/types/` — consistent with `standings.types.ts`.
- New procedure follows `verb-first camelCase` convention (`getPublicBracket`).
- `(public)/` route group bracket page already exists as a stub — Story 6.2 fills it in.

**Detected variances:**

- The admin `bracket-view-panel.tsx` defines `BracketMatchup` and `CompetitorSlot` types locally instead of importing from `packages/shared/`. Story 6.2 does NOT fix this — it defines its own public types in shared. Aligning admin types is a follow-up.
- `roundLabel()` is duplicated between admin panel and public bracket view. Acceptable for MVP; extract if Story 6.3 also needs it.
- Connection status badge rendering is duplicated between `standings-client-island.tsx` and `bracket-client-island.tsx`. Same rationale — extract when 3+ consumers exist.

### Testing Standards

- **Test framework:** Vitest (api: node, web: jsdom). Reuse `makeCallerFor` + mock DB helpers from `tournament.router.spec.ts`.
- **Public procedures get the same coverage:** Zod validation, NOT_FOUND, rate-limit, happy-path. NO unauthorized test (it's `t.procedure`).
- **Frontend tests use manual `createRoot` + `act` pattern** from Story 6.1 component specs.
- **Coverage target:** every branch in `getPublicBracket` (cypher-only short-circuit, champion detection, currentRound derivation, empty bracket). Every visual state in `BracketView` (empty, active bracket, champion celebration, bye slots, TBD slots).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L911-935 — Story 6.2 ACs + FR mapping]
- [Source: `_bmad-output/planning-artifacts/prd.md` FR46 (bracket view on public URL), FR48 (competitor ranking/matchup info on projected display)]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L209 (public room), L398-413 (server-rendered + responsive), L460 (public URL projected screen), L493 ((public) route group), L911-916 (bracket subdir)]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L519 (bracket visualization — established pattern), L704 (dark default for venue), L855-863 (dark mode default), L1644 (empty state copy), L1660 (stale-data opacity)]
- [Source: `_bmad-output/project-context.md` (52 rules). Particularly: public procedure rate limiting, TanStack Query v5 patterns, Next.js 16 async params, split-component SSR pattern.]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1924-2031` — `getBracket` admin procedure (structural reference)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:2062-2175` — `getPublicNextMatchups` (Story 6.1 public procedure reference)]
- [Source: `apps/web/src/components/admin/bracket-view-panel.tsx` — admin bracket component (matchup cards, round labels, champion banner)]
- [Source: `apps/web/src/components/public/standings-client-island.tsx` — client island pattern reference]
- [Source: `apps/web/src/lib/trpc-server.ts` — SSR tRPC caller]
- [Source: `apps/web/src/hooks/use-public-socket.ts` — socket hook with all 5 callbacks]

### Previous Story Intelligence

**Story 6.1 — Public Standings with Score Breakdowns (done 2026-05-06):**

1. SSR runtime decision: chose HTTP-fallback path (`httpBatchLink` from `trpc-server.ts`) over `appRouter.createCaller()`. Works. Story 6.2 reuses the same caller.
2. `useQuery({ initialData })` hydration pattern — cleaner than manual `setData` seeding. Story 6.2 uses the same pattern.
3. The code review found 1 HIGH issue: broadcast sites called `computeStandings` without enrichment. This is N/A for Story 6.2 (read-only surface, no broadcasts to fix).
4. Connection badge + opacity wrapper pattern established. Story 6.2 mirrors exactly.
5. Dark mode enforced via `<div className="dark">` on `(public)/layout.tsx`. Already done — Story 6.2 inherits it.
6. Public procedure testing pattern: Zod test, NOT_FOUND test, rate-limit test, happy-path test, no unauthorized test. Story 6.2 follows the same pattern.

**Story 5.3 — Bracket Progression & Winner Determination (done 2026-05-05):**

1. `getBracket` procedure returns `{ matchups, championCompetitorId, currentRoundNumber }`. Story 6.2's public variant mirrors this shape minus admin fields.
2. Champion determination: highest-round matchup with `winnerCompetitorId` when `comp.status === 'completed'`. Same logic in public procedure.
3. Current round: lowest round with at least one unresolved non-bye matchup. Same derivation.
4. `bracket-view-panel.tsx` established the `roundLabel()` algorithm and the matchup card layout. Story 6.2 builds on this foundation.

### Git Intelligence (recent commits)

```
5729552 chore: checkpoint Story 5.3 + review fixes + Epic 5 retro
ae94735 chore: checkpoint Stories 3.5-5.2 + Story 5.2 review fixes
```

Story 6.1 changes are unstaged (not yet committed). Story 6.2 should be developed on top of Story 6.1's changes. Verify Story 6.1's modified files are available before starting.

### Project Context Reference

`_bmad-output/project-context.md` (52 rules) governs ALL implementation. Story 6.2 exercises the same rules as Story 6.1 (SSR pattern, public procedure, rate limiting, TanStack Query v5). No new rules introduced. The bracket layout is the new challenge — pure CSS, no libraries.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- bracket-view.spec.tsx: Original dev agent adjusted BYE test to expect "TBD" — adversarial review identified this as AC #3 violation and fixed root cause in MatchupCard (slot B `isBye` prop).

### Completion Notes List

- All 8 tasks completed. 301 API tests pass, 131 web tests pass. Full turbo gate (lint/typecheck/test) green with 0 errors.
- Public `getPublicBracket` procedure strips admin-only fields (tieStatus, revoteCount, organizerDecisionReason, organizerDecisionBy, completedAt).
- Responsive bracket: horizontal multi-column on desktop (>=1024px), vertical stacked on mobile.
- Real-time invalidation on 4 socket events: phase.transitioned, matchup.completed, bracket.advanced, competition.completed.
- Champion path highlighting via green border on matchups won by champion.
- `roundLabel()` duplicated from admin panel — acceptable for MVP.

### File List

**New files:**

- `packages/shared/types/bracket.types.ts`
- `apps/web/src/components/public/bracket-client-island.tsx`
- `apps/web/src/components/public/bracket-client-island.spec.tsx`
- `apps/web/src/components/public/bracket-view.tsx`
- `apps/web/src/components/public/bracket-view.spec.tsx`

**Modified files:**

- `packages/shared/index.ts` (added bracket.types export)
- `apps/api/src/trpc/routers/tournament.router.ts` (added getPublicBracket procedure)
- `apps/api/src/trpc/routers/tournament.router.spec.ts` (added getPublicBracket test describe — 9 tests)
- `apps/web/src/app/(public)/[competitionId]/bracket/page.tsx` (rewritten: SSR + client island)

## Change Log

- 2026-05-06: Story 6.2 created via `/bmad-bmm-create-story`. Status `backlog → ready-for-dev`. Full battles bracket view on public URL with horizontal bracket layout on desktop, vertical stacked on mobile, real-time WebSocket updates, champion celebration banner, bye visualization. Builds on Story 6.1 (SSR + client-island pattern, `createServerTrpcClient`, `usePublicSocket` hook, dark mode layout) and Story 5.3 (`getBracket` admin procedure, bracket progression, champion determination). New `getPublicBracket` public procedure strips admin-only fields. Presenter view deferred to Story 6.3.
- 2026-05-06: Story 6.2 implementation complete. Status `in-progress → review`. All 8 tasks done. 301 API tests + 130 web tests pass. Turbo gate green (0 errors, 2 pre-existing warnings).
- 2026-05-07: Adversarial code review fixes applied. H1: Fixed BYE slot B rendering — `MatchupCard` now passes `isBye={matchup.isBye}` to both slots instead of hardcoding `false` for slot B (AC #3 violation). M1: Added horizontal bracket connector lines between rounds using CSS borders — `]` bracket connectors show matchup-to-matchup progression (AC #6). L1: Added reconnecting status test. L2: Added `role="region" aria-label="Tournament bracket"` to bracket container. 131 web tests pass (1 new). Turbo gate green.
