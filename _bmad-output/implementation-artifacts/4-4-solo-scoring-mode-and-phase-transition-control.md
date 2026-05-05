# Story 4.4: Solo Scoring Mode & Phase Transition Control

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to score participants directly from the admin panel and explicitly control phase transitions,
so that I can run small events single-handedly and maintain authoritative control over when the competition advances.

## Acceptance Criteria

1. **Given** I am in solo operation mode (no separate judge accounts), **when** I open the admin scoring panel, **then** I can score participants using the same criteria fields as judges — scores are submitted under my organizer identity (FR43).

2. **Given** I am scoring directly as the organizer, **when** I submit a score, **then** it is treated identically to a judge submission: persisted to the event store, aggregated in real-time, and broadcast to all WebSocket clients.

3. **Given** the Cypher phase is complete and I have reviewed the standings, **when** I click "Confirm Advancement to Battles", **then** the top N participants are locked in, the phase transitions to Battles, and a `phase.transitioned` event is recorded in the event store (FR42).

4. **Given** I have not yet confirmed advancement, **when** I am reviewing Cypher results, **then** I can scroll through all scores and standings — the competition is paused at the review checkpoint until I explicitly confirm.

5. **Given** unexpected circumstances require holding the competition at the current phase, **when** I choose not to click "Confirm Advancement", **then** the competition remains in Cypher review state indefinitely until I take explicit action — no automatic advancement occurs.

6. **Given** I am NOT in solo mode, **when** I attempt to call `submitOrganizerScore`, **then** the mutation is rejected — solo scoring is opt-in to prevent accidental admin scoring during normal multi-judge events.

7. **Given** solo mode is enabled, **when** I call `startCypherPhase`, **then** the "insufficient judge links" guard is bypassed — solo competitions need zero generated judge links.

> **Scope note:** AC #3, #4, #5 are **already satisfied** by Story 3.6's `completeCypherPhase` procedure (`apps/api/src/trpc/routers/tournament.router.ts:892`). Story 4.4's primary new implementation work is **AC #1, #2, #6, #7** — adding solo mode and the organizer scoring path. Tasks 11–12 add verification tests confirming the existing `completeCypherPhase` flow works correctly for a solo-mode competition.

## Tasks / Subtasks

- [x] Task 1: DB migration + schema — `solo_mode` flag on competitions (AC: #1, #6, #7)
  - [x] `packages/db/migrations/0012_add_solo_mode.sql` (NEW):
    ```sql
    -- Migration 0012 — Story 4.4: Solo Scoring Mode & Phase Transition Control
    -- Adds a boolean flag enabling organizer-as-scorer mode for small/solo events.
    -- When true: judge link generation is bypassed at startCypherPhase, and the
    -- organizer can submit scores directly via submitOrganizerScore.
    ALTER TABLE competitions ADD COLUMN solo_mode BOOLEAN NOT NULL DEFAULT FALSE;
    ```
  - [x] `packages/db/schema/competitions.ts` — add the column to the Drizzle schema:
    ```ts
    soloMode: boolean('solo_mode').notNull().default(false),
    ```
    Import `boolean` from `'drizzle-orm/pg-core'` (currently the import only includes `pgTable, text, timestamp, pgEnum, integer`).
  - [x] No new export from `packages/db/schema/index.ts` is needed — `export * from './competitions'` already covers the new field.

- [x] Task 2: Shared validation schemas (AC: #1, #6, #7)
  - [x] `packages/shared/validation/competition.schema.ts` — append:
    ```ts
    export const setSoloModeSchema = z.object({
      competitionId: z.string().min(1, 'Competition ID is required'),
      soloMode: z.boolean(),
    });
    export type SetSoloModeInput = z.infer<typeof setSoloModeSchema>;
    ```
  - [x] `packages/shared/validation/score.schema.ts` — append (re-exporting the existing `criterionScoreSchema`):
    ```ts
    export const submitOrganizerScoreSchema = z.object({
      competitionId: z.string().min(1, 'Competition ID is required'),
      competitorId: z.string().min(1, 'Competitor ID is required'),
      scores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
      idempotencyKey: z.string().min(1, 'Idempotency key is required'),
    });
    export type SubmitOrganizerScoreInput = z.infer<typeof submitOrganizerScoreSchema>;
    ```
  - [x] `packages/shared/index.ts` — re-export already happens via `export * from './validation/competition.schema'` and `'./validation/score.schema'`. No edits needed.

- [x] Task 3: New error codes (AC: #1, #6, #7)
  - [x] `packages/shared/errors/error-codes.ts` — add:
    - `SOLO_MODE_NOT_ENABLED: 'SOLO_MODE_NOT_ENABLED'` (returned when `submitOrganizerScore` is called on a non-solo-mode competition)
    - `SOLO_MODE_LOCKED: 'SOLO_MODE_LOCKED'` (returned when `setSoloMode` is called on a competition past `draft` status)

- [x] Task 4: tRPC mutation — `tournament.setSoloMode` (AC: #1, #7)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — new `protectedProcedure` near `setJudgeConfig`:
    - Input: `setSoloModeSchema`
    - Logic (RLS transaction):
      1. Ownership SELECT (same pattern as `setJudgeConfig` lines 535-544).
      2. Guard: if `competition.status !== 'draft'`, throw `BAD_REQUEST` with `SOLO_MODE_LOCKED` ("Solo mode can only be toggled before the competition starts").
      3. UPDATE `competitions.solo_mode = $input.soloMode`. Set `updatedAt: new Date()` (project rule).
      4. Return `{ id, soloMode }`.
  - [x] **Why a separate mutation rather than folding into `setJudgeConfig`?** Solo mode toggling has different validation gates (must be draft) than judge config (can be set during draft as well, but UX-wise these are different decisions). Keeping them separate makes the API clearer and lets the UI present "Solo mode" as a single toggle.

- [x] Task 5: Update `startCypherPhase` to bypass judge-link guard in solo mode (AC: #7)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts:712-800` (`startCypherPhase`):
    - At line 720 (the SELECT for the competition), add `soloMode: competitions.soloMode` to the projection.
    - At line 794 (the `INSUFFICIENT_JUDGE_LINKS` check), wrap in: `if (!comp.soloMode && allJudgeSessions.length < groupCount) { throw ... }`.
    - Group count default for solo mode: when `comp.soloMode === true`, force `groupCount = 1` regardless of `comp.cypherGroupCount`. (The organizer is one judge covering one group of all competitors.) Update `groupCount` derivation accordingly:
      ```ts
      const groupCount = comp.soloMode ? 1 : comp.cypherGroupCount;
      ```
      And update the prior config-missing guard so solo-mode competitions don't require `cypherGroupCount` to be set.
    - Round-robin assignment for `allCompetitors` and `allJudgeSessions` still runs — for solo mode, all competitors map to group 0 and there are no judge sessions to assign yet (they'll be auto-created on first organizer score).

- [x] Task 6: tRPC mutation — `tournament.submitOrganizerScore` (AC: #1, #2, #6)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — new `protectedProcedure`. Modeled tightly on `submitScore` (lines 1220-1418), with these critical differences:
    - No token validation (organizer is authenticated via Clerk).
    - Auto-create or fetch the organizer's judge session.
    - Skip the COMPETITOR_NOT_ASSIGNED check (organizer scores any competitor in their solo competition).
  - [x] Logic (RLS transaction):
    1. `SET LOCAL session.current_organizer_id = ${ctx.userId}`.
    2. Load the competition + ownership check (`organizer_clerk_id = ctx.userId`):
       ```ts
       SELECT id, status, soloMode FROM competitions WHERE id = $competitionId AND organizer_clerk_id = $ctx.userId
       ```
       Throw `NOT_FOUND` if zero rows.
    3. Guard: `competition.status !== 'active'` → `BAD_REQUEST` with `PHASE_NOT_ACTIVE`.
    4. Guard: `competition.soloMode !== true` → `BAD_REQUEST` with `SOLO_MODE_NOT_ENABLED` (AC #6).
    5. Verify competitor belongs to this competition: SELECT competitors.id WHERE `id = $competitorId AND competition_id = $competitionId AND status = 'active'`. Throw `NOT_FOUND` with `COMPETITOR_NOT_FOUND` (reuses code from Story 4.3) if zero rows. (Withdrawn competitors cannot be scored — Story 4.3 AC #1.)
    6. **Find or create the organizer's judge session**:
       ```ts
       const [existing] = await tx
         .select({ id: judgeSessions.id })
         .from(judgeSessions)
         .where(
           and(
             eq(judgeSessions.competitionId, input.competitionId),
             eq(judgeSessions.createdBy, ctx.userId),
             eq(judgeSessions.label, 'Organizer'),
           ),
         );
       let organizerSessionId: string;
       if (existing) {
         organizerSessionId = existing.id;
       } else {
         // Generate a random token (never returned to the client — organizer
         // never uses the judge token flow). The unique tokenHash satisfies
         // the NOT NULL UNIQUE constraint.
         const { hash } = generateJudgeToken();
         const [created] = await tx
           .insert(judgeSessions)
           .values({
             competitionId: input.competitionId,
             tokenHash: hash,
             label: 'Organizer',
             createdBy: ctx.userId,
             groupIndex: 0,
           })
           .returning({ id: judgeSessions.id });
         organizerSessionId = created!.id;
       }
       ```
       The unique `tokenHash` constraint protects against rare collisions (try/catch on `23505` and retry — but `randomBytes(32)` collisions are astronomically unlikely; document the risk only).
    7. Idempotency check: same `(organizerSessionId, idempotencyKey)` already in scores → return `{ success: true, idempotent: true }`.
    8. Validate criteria scores via shared `validateCriteriaScores(criteriaForComp, input.scores)` helper — same as `submitScore` line 1313-1323. On failure, throw `BAD_REQUEST` with mapped error code.
    9. Get next event sequence (same pattern as submitScore).
    10. INSERT score row with `judgeSessionId = organizerSessionId`. Use ON CONFLICT semantics if scores has a unique `(judge_session_id, competitor_id)` index — check schema; if so, on conflict update. Otherwise, do an idempotency-by-key + insert pattern.
    11. INSERT `score.submitted` event with payload (judgeSessionId is the organizer's auto-created session). Use try/catch on pg `23505` for sequence collision (retry message).
    12. Stash `broadcastPayload`. After commit:
        - `gateway.broadcastScoreSubmitted(competitionId, payload)` (admin room — same as judge submission).
        - Recompute standings with active-only filter (Story 4.3 pattern) and call `gateway.broadcastStandingsUpdated(...)`.
    13. Return `{ success: true, idempotent: false }`.
  - [x] **Critical**: the organizer judge session, once created, persists. Subsequent `submitOrganizerScore` calls reuse it (step 6 SELECT). This means the organizer's judge session label/createdBy combo is the de-facto unique key. There is no DB-level constraint enforcing that — but the SELECT-then-INSERT inside the transaction is correct for single-organizer-single-competition (no race because both come from the same Clerk session within the same RLS transaction).

- [x] Task 7: Update `getCompetition` and `getDashboardSnapshot` to include `soloMode` (AC: #1)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts:374` (`getCompetition`) — add `soloMode: competitions.soloMode` to the projection.
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` (`getDashboardSnapshot` — search for the line projecting `cypherCompletedAt`) — add `soloMode: competitions.soloMode` to the projection. Include `soloMode` in the returned shape.

- [x] Task 8: Frontend — `SoloModeToggle` in competition setup (AC: #1, #7)
  - [x] `apps/web/src/components/admin/judge-groups-manager.tsx` (Story 2.4 component — current judge config UI):
    - Add a checkbox: "Solo mode (I'll score directly as the organizer — no separate judges)".
    - Visible only when `competition.status === 'draft'` (server enforces this; UI hides when not editable).
    - Wire to `trpc.tournament.setSoloMode.useMutation`. On success, invalidate `getCompetition` so the rest of the UI re-renders with the new flag.
    - When `soloMode === true`, GREY OUT the per-judge-count and group-count inputs (organizer is implicitly 1 judge × 1 group), with a note "Judge counts are managed automatically in solo mode".

- [x] Task 9: Frontend — `SoloScoringPanel` component (AC: #1, #2)
  - [x] `apps/web/src/components/admin/solo-scoring-panel.tsx` (NEW client component):
    - `'use client'` directive.
    - Props: `{ competitionId: string }`.
    - Reads `trpc.tournament.getCompetition.useQuery({ competitionId })` and `trpc.tournament.listCompetitorsWithStatus.useQuery({ competitionId })` (Story 4.3 endpoint — gives competitor list with status).
    - Reads `trpc.tournament.listCriteria.useQuery({ competitionId })` for criterion definitions.
    - Reads `trpc.tournament.getStandings.useQuery({ competitionId })` to display already-submitted-by-organizer scores (filter standings entries by `competitorId` to pre-fill UI when re-opening).
    - Renders **only** when `competition.soloMode === true` AND `competition.status === 'active'`.
    - For each ACTIVE competitor (filter `status === 'active'`), render a row with:
      - Competitor name + Participant ID
      - Per-criterion `<input type="number" step="0.01" min={c.min} max={c.max}>` for the score
      - "Submit Score" button
    - On submit:
      - Convert numeric inputs to `.toFixed(2)` strings (project-context rule #7).
      - Generate idempotency key with `crypto.randomUUID()` (project rule — no client-side score calculation).
      - Call `trpc.tournament.submitOrganizerScore.useMutation`.
      - On success: invalidate `getStandings`, `getDashboardSnapshot`, and clear the row's input state.
      - On error: render inline `<p className="text-destructive text-sm">{err.message}</p>` below the row.
    - Disable Submit button until: every criterion has a parseable value within range. Use derived state (no `useEffect` setState — see project-context rule on TanStack Query v5).
    - Show submitted-state indicator per competitor (✓ green check) when the standings already include that competitor with `judgeCount > 0`.
  - [x] Place the panel above the existing `<CypherResultsPanel />` and `<StartCypherPhasePanel />` on the admin competition page.

- [x] Task 10: Frontend — admin page integration (AC: #1)
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — import `SoloScoringPanel` and render it conditionally between the header and `<CypherResultsPanel />`. The component itself returns `null` when not in solo mode, so the parent can render it unconditionally. Example:
    ```tsx
    import { SoloScoringPanel } from '@/components/admin/solo-scoring-panel';
    // ...
    <SoloScoringPanel competitionId={id} />
    <CypherResultsPanel competitionId={id} />
    <StartCypherPhasePanel competitionId={id} />
    ```

- [x] Task 11: Verification — `completeCypherPhase` works in solo mode (AC: #3, #4, #5)
  - [x] No code change required — this is a **test-only task** confirming Story 3.6 behavior in a solo-mode scenario.
  - [x] Manual verification path (document in completion notes):
    1. Create a competition with `soloMode = true`.
    2. Set criteria, register competitors, set advancement threshold.
    3. Call `startCypherPhase` → succeeds without judge links.
    4. Submit `submitOrganizerScore` for each competitor.
    5. Call `completeCypherPhase` → returns `finalStandings` containing top N.
    6. Verify `phase.transitioned` event is appended (AC #3).
    7. Without calling `completeCypherPhase`, verify the competition stays at `cypherCompletedAt = null` indefinitely (AC #4, #5 — pure observation; no auto-advancement code path exists).

- [x] Task 12: Tests — backend (AC: #1, #2, #6, #7)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts`:
    - **`setSoloMode` tests:**
      - Auth: `caller(null).tournament.setSoloMode(...)` → `UNAUTHORIZED`.
      - Zod: missing `soloMode`, missing `competitionId` → `BAD_REQUEST`.
      - Phase guard: `status = 'active'` → `BAD_REQUEST` with `cause.errorCode = 'SOLO_MODE_LOCKED'`.
      - Happy path: draft competition → UPDATE persists `solo_mode = true`. Verify via spy on `update.set`.
    - **`submitOrganizerScore` tests:**
      - Auth: unauthenticated → `UNAUTHORIZED`.
      - Zod: empty `scores` array → `BAD_REQUEST`.
      - Competition not found / cross-organizer → `NOT_FOUND`.
      - Phase guard: `status = 'draft'` → `BAD_REQUEST` with `PHASE_NOT_ACTIVE`.
      - Solo mode guard: `soloMode = false` → `BAD_REQUEST` with `cause.errorCode = 'SOLO_MODE_NOT_ENABLED'` (AC #6).
      - Withdrawn competitor: status='withdrawn' → `NOT_FOUND` with `COMPETITOR_NOT_FOUND` (Story 4.3 integration).
      - Happy path FIRST submission: organizer judge session is auto-created (assert one INSERT into `judgeSessions` with `label = 'Organizer'`, `createdBy = userId`, `groupIndex = 0`); score row inserted; `score.submitted` event appended; `broadcastScoreSubmitted` + `broadcastStandingsUpdated` called.
      - Happy path SECOND submission: organizer session reused (zero new judge_sessions inserts; one new score row).
      - Idempotency: same `(organizerSessionId, idempotencyKey)` → returns `{ success: true, idempotent: true }`, no second event/score insert.
      - Validation reuse: out-of-range value → `BAD_REQUEST` with mapped `SCORE_OUTSIDE_RANGE` (proves the shared validator runs).
    - **`startCypherPhase` solo-mode tests:**
      - When `soloMode = true` AND zero judge sessions → succeeds (no `INSUFFICIENT_JUDGE_LINKS` thrown).
      - When `soloMode = false` AND zero judge sessions → still throws `INSUFFICIENT_JUDGE_LINKS` (regression guard).
      - When `soloMode = true` → `groupCount` is forced to 1 regardless of `cypherGroupCount` (verify by inspecting the competitor group assignments inserted: all competitors map to group 0).

- [x] Task 13: Tests — solo mode end-to-end (AC: #3, #4, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — solo mode scenario verifying Story 3.6 flow:
    - `completeCypherPhase` for a solo-mode competition returns standings with the organizer's submitted scores aggregated correctly. The test mocks: solo competition active + cypherCompletedAt null + advancementThreshold set + scores rows from organizer judge session. After call: `phase.transitioned` event appended, `cypherCompletedAt` updated, `gateway.broadcastPhaseTransitioned` invoked. (Reuses existing `completeCypherPhase` mocks — just confirms the flow works without judge-side scoring.)

- [x] Task 14: CI verification — `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — all green.

## Dev Notes

### Why "solo mode" deserves a dedicated flag

A previous draft considered making organizer scoring _always_ available (no flag). That would conflate two different operating models:

- **Multi-judge events** (the default): scoring authority is distributed; organizer is a configuration role, not a scoring role. An admin scoring panel that's always visible would tempt accidental admin scoring during a normal multi-judge event, polluting the standings.
- **Solo events** (small-stage runs, drop-in workshops, training): no judges configured, organizer is the sole scorer. Discoverable, deliberate, auditable.

The `solo_mode` boolean turns this into an explicit, opt-in decision made at draft time. The mutation `setSoloMode` is gated to draft status precisely so that a running competition cannot be retroactively flipped — that would corrupt the audit trail (FR44) by introducing an organizer judge session mid-event with no events to back it.

[Source: epic 4.4 AC #1 ("solo operation mode (no separate judge accounts)") + project-context.md NFR21 — append-only event store]

### The auto-created organizer judge session

`submitOrganizerScore` lazily creates a single `judge_sessions` row labeled `'Organizer'` with `createdBy = ctx.userId` (organizer's Clerk ID) on first call. This row:

- Has a `tokenHash` (NOT NULL constraint requires one), generated from `randomBytes(32)`. The raw token is **never returned to the client** — the organizer never uses the judge token flow. The token exists solely to satisfy the schema's NOT NULL UNIQUE constraint.
- Has `groupIndex = 0` — solo mode is single-group by definition (AC: groupCount forced to 1 in `startCypherPhase`).
- Is **idempotent**: subsequent calls find this row via `(competitionId, createdBy, label='Organizer')` and reuse its id.

This approach means **all existing scoring infrastructure works unchanged**: `score.submitted` events carry the organizer's session id; `computeStandings` aggregates the organizer's scores like any other judge's; Story 4.2 score override applies; Story 4.3 withdrawn-competitor filter applies. Zero changes to aggregation logic.

[Source: `apps/api/src/trpc/routers/tournament.router.ts:1220+` (submitScore reference); `packages/db/schema/judge-sessions.ts`]

### Why skip COMPETITOR_NOT_ASSIGNED check in `submitOrganizerScore`

The judge-side `submitScore` (line 1281-1300) guards against judges scoring competitors outside their assigned group. In solo mode, the organizer scores ALL competitors — they're the sole judge with one group. Skipping the assignment check is correct here because:

- The organizer's session has `groupIndex = 0` (set at creation).
- All competitors are assigned to group 0 by `startCypherPhase` (Task 5).
- An explicit assignment check would still pass, but the SELECT would be wasted DB work.

The competitor-belongs-to-competition check (step 5 of Task 6) is still mandatory — the organizer must not score a competitor from a different competition (RLS would block it via the JOIN, but explicit NOT_FOUND beats silent zero-rows).

[Source: project-context.md "Two layers of defense" rule]

### AC #3, #4, #5 are already implemented (Story 3.6)

Story 3.6 (`completeCypherPhase`) at `apps/api/src/trpc/routers/tournament.router.ts:892` already implements:

- AC #3: confirms top N advancement, locks `cypherCompletedAt`, appends `phase.transitioned` event.
- AC #4: until `completeCypherPhase` is called, the competition stays in cypher review state. The `cypherCompletedAt` column is `null` and the UI shows the standings indefinitely.
- AC #5: there is no auto-advancement code path. Phase transition only happens via the explicit `completeCypherPhase` call. Verified by code search — no scheduled job, no event-handler, no time-based trigger references `phase.transitioned`.

Story 4.4's role for these ACs is **integration verification** (Task 11, Task 13) — ensuring the existing flow works correctly when the only scorer is the organizer (no judges). No new implementation is required for AC #3-5.

[Source: `apps/api/src/trpc/routers/tournament.router.ts:892-1102` (completeCypherPhase); _bmad-output/implementation-artifacts/3-6-cypher-phase-completion-and-advancement-review.md]

### Drizzle `boolean` import gotcha

The current `packages/db/schema/competitions.ts` does not import `boolean`. When adding `soloMode`, the import line needs to be updated:

```ts
import { pgTable, text, timestamp, pgEnum, integer, boolean } from 'drizzle-orm/pg-core';
```

Easy to miss — the typecheck will fail immediately if not added. The migration SQL uses `BOOLEAN NOT NULL DEFAULT FALSE`, which Drizzle's `boolean('solo_mode').notNull().default(false)` matches exactly.

[Source: project-context.md "pgEnum creates a Postgres TYPE" rule (analogous discipline applies to all column types) + `packages/db/schema/competitions.ts`]

### Frontend gating: where solo mode appears

The `SoloScoringPanel` returns `null` unless BOTH:

1. `competition.soloMode === true`
2. `competition.status === 'active'`

Combined with the `SoloModeToggle` in `judge-groups-manager.tsx` which only enables the toggle in `'draft'` status, the UI flow is:

- **Draft**: organizer can toggle solo mode on/off; no scoring panel.
- **Active (solo mode = true)**: scoring panel visible; existing `CypherResultsPanel` and `StartCypherPhasePanel` work as in multi-judge mode.
- **Active (solo mode = false)**: no scoring panel; same as today.
- **Completed/archived**: scoring panel disappears (no scoring after phase completion).

[Source: `apps/web/src/app/(admin)/competitions/[id]/page.tsx`; Story 3.6 `CypherResultsPanel` for advancement UI]

### Idempotency key generation in solo mode

The organizer's UI is a single-tab interactive form, not an offline-queue system like the judge UI (Story 3.5). The simplest correct idempotency key is `crypto.randomUUID()` generated per submit click. The key is scoped per (organizerSessionId, idempotencyKey) — meaning even if the organizer triple-clicks the Submit button by accident, only the first network round-trip wins; the rest get `idempotent: true` back.

If the user retries after a network error, they get a NEW idempotency key — which means a fresh score row would be inserted. This is the correct semantics for "submit again after error" (the previous attempt may not have committed). The duplicate-prevention is at the (judgeSessionId, competitorId) level via the existing scores unique index — submitScore's pattern handles this.

[Source: project-context.md "Every score submission must include a client-generated idempotency key" rule + `apps/api/src/trpc/routers/tournament.router.ts:1259-1270` (submitScore idempotency check)]

## Dev Agent Record

### Implementation Plan

Implemented in 14 tasks following the BMAD red-green-refactor cycle. Key technical choices:

- **`solo_mode` boolean column** on `competitions` (default false). Migration `0012_add_solo_mode.sql` + Drizzle schema update with `boolean` import added.
- **`setSoloMode` mutation** gated to `draft` status (throws `SOLO_MODE_LOCKED` otherwise) — no retroactive flips after the competition starts.
- **`startCypherPhase` patched** to skip the `INSUFFICIENT_JUDGE_LINKS` check when `soloMode = true`, and force `groupCount = 1` regardless of `cypherGroupCount`.
- **`submitOrganizerScore` mutation** is a `protectedProcedure` mirroring `submitScore` but with three differences: no token validation, lazy auto-creation of the "Organizer" judge session, and skips `COMPETITOR_NOT_ASSIGNED` (organizer scores all competitors). Reuses `validateCriteriaScores` helper for criterion validation parity.
- **Auto-created organizer session** uses `randomBytes(32)` for the unique tokenHash (never returned to client) and `groupIndex = 0`. SELECT-by-`(competitionId, createdBy, label='Organizer')` ensures idempotency across calls.
- **`getCompetition` and `getDashboardSnapshot`** projections updated to include `soloMode` so the frontend can gate UI accordingly.
- **`SoloScoringPanel` component** renders only when `soloMode === true && status === 'active'`. Per-competitor row with criterion inputs, derived-state validation (no `useEffect` setState), `crypto.randomUUID()` for idempotency keys.
- **`JudgeGroupsManager`** received a "Solo mode" toggle Card at the top with `setSoloMode` mutation; judge-count inputs disabled when solo mode is on.

### Completion Notes

✅ All 14 tasks complete.
✅ 19 backend tests (post-review) — covering `setSoloMode` (5), `submitOrganizerScore` (10), `startCypherPhase` solo-mode (3 — bypass guard, regression, groupCount forced to 1), `completeCypherPhase` solo-mode (1 — organizer scores aggregate into advancement).
✅ Total: 191 API tests + 45 web tests passing — no regressions.
✅ Full CI: lint + typecheck + test — 13/13 turbo tasks green.

AC #3, #4, #5 (phase transition control) are satisfied by Story 3.6's existing `completeCypherPhase`. Dev Notes document this with code references for verification — no implementation work required for those ACs.

## File List

- `packages/db/migrations/0012_add_solo_mode.sql` (NEW)
- `packages/db/schema/competitions.ts` (MODIFIED — added `boolean` import + `soloMode` column)
- `packages/shared/validation/competition.schema.ts` (MODIFIED — added `setSoloModeSchema`)
- `packages/shared/validation/score.schema.ts` (MODIFIED — added `submitOrganizerScoreSchema`)
- `packages/shared/errors/error-codes.ts` (MODIFIED — added `SOLO_MODE_NOT_ENABLED`, `SOLO_MODE_LOCKED`)
- `apps/api/src/trpc/routers/tournament.router.ts` (MODIFIED — `setSoloMode` mutation, `submitOrganizerScore` mutation, `startCypherPhase` solo-mode bypass, `getCompetition`/`getDashboardSnapshot` `soloMode` projection)
- `apps/api/src/trpc/routers/tournament.router.spec.ts` (MODIFIED — 17 new tests)
- `apps/web/src/components/admin/judge-groups-manager.tsx` (MODIFIED — solo mode toggle Card + auto-fill on save)
- `apps/web/src/components/admin/solo-scoring-panel.tsx` (NEW)
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx` (MODIFIED — render `SoloScoringPanel`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED)

## Change Log

- 2026-04-29: Story 4.4 implemented — solo scoring mode (`solo_mode` flag, `setSoloMode` mutation, organizer-as-judge `submitOrganizerScore` mutation), `startCypherPhase` bypass for solo mode, frontend toggle + scoring panel. AC #3-5 satisfied by Story 3.6's existing `completeCypherPhase`. 17 new tests, full CI green.
- 2026-04-29: Code review (Opus 4.6) — 1 HIGH + 3 MEDIUM + 1 LOW found. All HIGH+MEDIUM fixed: [H1] Added missing Task 13 `completeCypherPhase` solo-mode verification test. [H2-new] Fixed `startCypherPhase` TypeError crash when 0 judge sessions — empty `reduce()` on judge assignment CASE update; guarded with `if (judgeAssignmentResults.length > 0)`. [M1] Added "groupCount forced to 1" test verifying all competitors assigned to group 0. [M2] `SoloScoringPanel` now hides after cypher completion (`cypherCompletedAt` check). [M3] Added `pg_advisory_xact_lock` before organizer session SELECT-then-INSERT to prevent theoretical race on duplicate session creation. Existing startCypherPhase test strengthened from error-exclusion to success assertion. 191 API + 45 web tests, 13/13 CI green.
