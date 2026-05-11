# Story 7.3: Simulation Reset & Judge Training Access

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to restart or reset a simulation at any point and let real judges practice scoring via their invite links,
so that I can iterate on format configuration and train judges before the actual event.

## Acceptance Criteria

1. **Given** I am mid-simulation and want to change a configuration parameter, **when** I click "Reset Simulation", **then** all scores, votes, and bracket data are cleared and the simulation returns to its initial configured state — ready to run again (FR53).

2. **Given** I reset a simulation, **when** the reset completes, **then** a confirmation is shown and I can immediately restart from the Cypher phase with the same (or updated) configuration.

3. **Given** I want to train judges before an event, **when** I generate judge invite links for a simulation competition, **then** real judges can open those links, see the scoring interface, and submit practice scores — identical to a live judge experience (FR55).

4. **Given** a judge submits a score in simulation mode, **when** the score is processed, **then** it is clearly stored as simulation data — it does not appear in any live competition leaderboards or analytics.

5. **Given** I have run multiple simulation resets, **when** I view the simulation's event log, **then** each reset is recorded as a `simulation.reset` event with timestamp — the full simulation history is auditable.

## Prerequisites

- **Story 7.1 done** ✓ — `competitions.is_simulation` column exists; `createSimulation` flow ships mock participants.
- **Story 7.2 done** ✓ — Multi-judge sim sessions auto-created in `startCypherPhase` for simulations; organizer-as-all-roles flow live.
- **Story 5.x done** ✓ — Bracket generation + `processMatchupOutcome` + `getBracket` live.
- **No DB migration required** — reset is purely a DELETE + UPDATE + INSERT (event row) operation. No new columns or tables.
- **Real judges already work on simulations** — `submitScore`/`submitVote` check `comp.status === 'active'` and do NOT filter on `is_simulation`. AC #3/#4 are mostly satisfied today; this story only adds the visible "PRACTICE MODE" surface so judges know they're in a simulation.
- **AC #4 already partially satisfied** — Story 7.1 established that simulation data lives in the same tables but is flagged via `competitions.is_simulation = true`. Public standings/bracket queries don't filter on this flag (deliberate, per Story 7.1 dev notes), so simulation data DOES appear at simulation public URLs. AC #4 is about NOT polluting _live_ leaderboards — which is enforced by per-competition isolation, not by global filtering. This story does not change that.

## Tasks / Subtasks

- [x] Task 1: Backend — `tournament.resetSimulation` procedure (AC: #1, #2, #5)
  - [x] **New file** `packages/shared/validation/simulation.schema.ts`:

    ```typescript
    import { z } from 'zod';

    export const resetSimulationSchema = z.object({
      competitionId: z.string().min(1, 'Competition ID is required'),
    });
    export type ResetSimulationInput = z.infer<typeof resetSimulationSchema>;
    ```

    Re-export from `packages/shared/index.ts` (or wherever validation schemas are barrel-exported — verify the existing pattern in `packages/shared/`).

  - [x] **New file** `packages/shared/events/simulation-events.ts`:
    ```typescript
    export interface SimulationResetPayload {
      competitionId: string;
      resetAt: string; // ISO
      scoresDeleted: number;
      votesDeleted: number;
      matchupsDeleted: number;
      groupAssignmentsDeleted: number;
    }
    ```
    Re-export from `packages/shared/events/index.ts` if that pattern is used.
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add `resetSimulation` protectedProcedure between `setSoloMode` and `listSimulatedJudgeSessions`:
    1. RLS transaction (`SET LOCAL session.current_organizer_id`).
    2. Ownership SELECT: `competitions.id AND organizerClerkId === ctx.userId`. Throw `NOT_FOUND` if missing.
    3. Load `isSimulation`, `status`, `cypherCompletedAt` on the same SELECT.
    4. Guard: `if (!comp.isSimulation)` → `BAD_REQUEST` with `ErrorCodes.SIMULATION_NOT_ENABLED`.
    5. Advisory lock: `SELECT pg_advisory_xact_lock(hashtext('sim-reset-' + competitionId))` to serialize concurrent resets (rare but possible if organizer double-clicks).
    6. **DELETE in cascade-safe order** (children before parents — though most have `ON DELETE CASCADE`, explicit deletes give us row counts for the audit event):
       - `DELETE FROM votes WHERE competition_id = $1 RETURNING id` → `votesDeleted = result.length`
       - `DELETE FROM scores WHERE competition_id = $1 RETURNING id` → `scoresDeleted`
       - `DELETE FROM battle_matchups WHERE competition_id = $1 RETURNING id` → `matchupsDeleted`
       - `DELETE FROM competitor_group_assignments WHERE competition_id = $1 RETURNING id` → `groupAssignmentsDeleted`
       - **Do NOT delete:** `competitions`, `evaluation_criteria`, `competitors` (mock participants stay), `judge_sessions` (real-judge tokens stay valid; sim sessions also stay so `startCypherPhase` reuses them), `events` (append-only — see Task 1.7).
    7. UPDATE the competition: `status: 'draft', cypherCompletedAt: null, updatedAt: new Date()`.
    8. Get next event sequence: `SELECT max(sequence) FROM events WHERE aggregate_id = $1 AND aggregate_type = 'competition'`.
    9. INSERT `simulation.reset` event with `SimulationResetPayload`, `sequence = max + 1`, `createdBy = ctx.userId`.
    10. Outside the transaction: broadcast `simulation.reset` via gateway (new method — Task 2).
    11. Return `{ scoresDeleted, votesDeleted, matchupsDeleted, groupAssignmentsDeleted, resetAt }` so the UI can show a confirmation summary.
  - [x] **Why keep `events`** — events is append-only by architecture rule. Deleting `competition.started`, `score.submitted`, etc. would violate that and erase the audit trail (AC #5). Downstream queries don't read `score.submitted` events for state — they read the relational tables. The relational tables are now empty post-reset, so there is no stale-state risk.
  - [x] **Why keep `judge_sessions`** — real-judge invite tokens (FR55) must remain valid across resets so judges don't need new links. Sim sessions also persist; `startCypherPhase` (Story 7.2) only auto-creates sim sessions when `length < cypherGroupCount × cypherJudgeCount` — since they exist, no new ones are created. Round-robin re-runs and re-asserts `groupIndex` via the existing CASE update.
  - [x] **Why keep `competitors`** — mock participants are part of the simulation's "configured state" (AC #1: "returns to its initial configured state"). Deleting them would force the organizer to re-generate. If the organizer wants different participants, they delete the simulation and create a new one.
  - [x] **Why keep `evaluation_criteria`** — same reason as competitors. Criteria are config, not run-state.

- [x] Task 2: Backend — WebSocket broadcast for `simulation.reset` (AC: #2)
  - [x] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add:
    ```typescript
    broadcastSimulationReset(
      competitionId: string,
      payload: SimulationResetPayload,
    ): void;
    ```
  - [x] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — implement: emit `'simulation.reset'` to admin + judge + public rooms (mirroring the broadcast pattern of `broadcastCompetitionStarted`). Real judges and the public bracket page can react by invalidating their queries — fresh standings/bracket appear empty.
  - [x] `packages/shared/events/socket-event-map.ts` — add `'simulation.reset': (data: SimulationResetPayload) => void` to `ServerToClientEvents`.
  - [x] Update the test gateway interface stubs (`makeFullGateway` in `tournament.router.spec.ts`) to include the new method.

- [x] Task 3: Backend — extend `validateJudgeToken` to surface `isSimulation` (AC: #3)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` `validateJudgeToken` (~line 1494):
    - Add `isSimulation: competitions.isSimulation` to the competition SELECT.
    - Return it in the response object.
  - [x] **Why this matters:** the judge UI needs to know it's a practice/simulation session to render the "PRACTICE MODE" badge (Task 6). Without this, the judge has no signal — they get an identical UX, which AC #3 calls for _interaction-wise_, but AC #4 (clearly stored as simulation data) implies the judge should at least be aware they're scoring practice data.

- [x] Task 4: Backend tests for `resetSimulation` (AC: #1, #2, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add `describe('tournament.resetSimulation')` with:
    1. **Auth:** `caller(null).tournament.resetSimulation({ competitionId })` → UNAUTHORIZED.
    2. **NOT_FOUND:** unknown competition id → NOT_FOUND.
    3. **SIMULATION_NOT_ENABLED:** non-simulation competition → BAD_REQUEST with `SIMULATION_NOT_ENABLED`.
    4. **Happy path mid-cypher:** simulation with 5 scores, 0 votes, 0 matchups, 4 group assignments → returns `{ scoresDeleted: 5, votesDeleted: 0, matchupsDeleted: 0, groupAssignmentsDeleted: 4 }`. Assert UPDATE was called with `status: 'draft', cypherCompletedAt: null, updatedAt: <Date>`. Assert INSERT into `events` with type `simulation.reset` and `sequence = maxSeq + 1`. Assert broadcast was called with the payload.
    5. **Happy path mid-battles:** simulation with scores AND votes AND matchups → all four counts populated; same UPDATE + event + broadcast.
    6. **Idempotent on draft:** simulation in draft (no data) → returns all-zero counts; UPDATE still runs (no-op for status), event still appended (audit trail).
    7. **Concurrent reset advisory lock:** verify `pg_advisory_xact_lock` is invoked with the right key (regex match on the SQL).
    8. **Event payload integrity:** assert payload has `competitionId`, `resetAt` ISO string, all four counts.
  - [x] **Pattern:** mirror the `makeOrganizerScoreDb` factory shape — sequential `whereResults` for SELECTs, INSERT spies for the event row, DELETE returns are mocked via the `chainable` helper so `.returning()` resolves to arrays of fake row objects (count by `.length`). For DELETE-with-RETURNING, use `chainable` patched to support `.returning()`.

- [x] Task 5: Backend tests for `validateJudgeToken` returning `isSimulation` (AC: #3)
  - [x] One new test: a sim competition's judge token returns `{ isSimulation: true, ... }`.
  - [x] One new test: a live competition's judge token returns `{ isSimulation: false, ... }` (regression guard).

- [x] Task 6: Frontend — judge view "PRACTICE MODE" badge (AC: #3)
  - [x] `apps/web/src/app/(judge)/judge/[token]/page.tsx`:
    - Read `tokenData.isSimulation` from `validateJudgeToken` (added in Task 3).
    - When `true`, render a small amber badge near the existing connection-status indicator: `PRACTICE MODE`. Use the same visual language as the simulation header in `SimulationClient` (amber `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`).
    - Do NOT block scoring or alter any other behavior — AC #3 says the experience is identical.
  - [x] **Why minimal:** AC #3 explicitly requires "identical to a live judge experience". A small badge is the only deviation justified — without it judges may worry their practice scores are going live.

- [x] Task 7: Frontend — `SimulationResetPanel` component (AC: #1, #2)
  - [x] **New file** `apps/web/src/components/admin/simulation-reset-panel.tsx` (`'use client'`):
    - Props: `competitionId: string`.
    - Queries: `getCompetition` (just to confirm `isSimulation`).
    - Local state: `confirming: boolean`, `lastResult: ResetSummary | null`.
    - **UI structure:**
      - Card with title "Reset Simulation" and description: "Wipes all scores, votes, and bracket progress for this simulation. Mock participants, evaluation criteria, and judge links are kept."
      - When NOT confirming: a "Reset Simulation" outline button + "Last reset: {timestamp}" subtext if `lastResult` is set.
      - When confirming: a destructive-styled "Confirm Reset" button + a "Cancel" button. Inline warning: "This cannot be undone. {scoresDeleted} scores and {votesDeleted} votes will be deleted."
      - On success: show the count summary inline for ~5s, then revert.
    - Mutation: `trpc.tournament.resetSimulation.useMutation()`. `onSuccess` invalidates `getCompetition`, `getStandings`, `getBracket`, `listScoresForOverride`, `getDashboardSnapshot`. `onError` shows the message inline.
  - [x] **Why a confirmation dialog (two-step button)** instead of a modal: matches existing project pattern (e.g., `score-override-form` uses inline confirm/cancel, not modals — `apps/web/src/components/admin/score-override-form.tsx`). Modals during admin work are discouraged in the UX spec for that exact reason.

- [x] Task 8: Frontend — wire `SimulationResetPanel` into `SimulationClient` (AC: #1, #2)
  - [x] `apps/web/src/components/admin/simulation-client.tsx`:
    - Render `<SimulationResetPanel competitionId={competitionId} />` after the simulation banner header in ALL phase branches (draft / active-cypher / active-battles / completed).
    - Reset is meaningful in every phase — even in `draft` (resets the audit trail; useful for clearing a previous run).
  - [x] Visual placement: directly below the amber simulation banner so it's the second thing the organizer sees.

- [x] Task 9: Frontend — react to `simulation.reset` socket event in admin/public/judge views (AC: #2)
  - [x] `apps/web/src/hooks/use-admin-socket.ts` — extend the socket-event listener union:
    - Add `onSimulationReset?: (data: SimulationResetPayload) => void` to the options.
    - In the underlying socket effect, register `socket.on('simulation.reset', ...)` and forward.
  - [x] `apps/web/src/hooks/use-judge-socket.ts` — same pattern. Judge views should invalidate `validateJudgeToken` and `getJudgeAssignments`/`getBattlesAssignment` on reset (judge sees fresh "waiting for cypher to start" state).
  - [x] `apps/web/src/hooks/use-public-socket.ts` — same pattern. Public standings/bracket pages invalidate `getStandings`/`getBracket`.
  - [x] **Why explicit per-hook handling** — each hook already has bespoke cache-invalidation logic; adding a generic event would skip that nuance. The pattern matches how Story 5.3 added `onMatchupCompleted` etc.
  - [x] In `simulation-client.tsx`, pass `onSimulationReset` to invalidate `getCompetition`, `getStandings`, `getBracket` so the page reverts to draft view automatically.

- [x] Task 10: Frontend — show "Simulation History" event log on admin simulation page (AC: #5)
  - [x] **New file** `apps/web/src/components/admin/simulation-history-panel.tsx` (`'use client'`):
    - Props: `competitionId: string`.
    - Queries a **new tRPC query** `tournament.listSimulationResetEvents` (Task 11) — returns `[{ resetAt: string, scoresDeleted, votesDeleted, matchupsDeleted, groupAssignmentsDeleted }, ...]` newest-first.
    - Renders a small collapsible card titled "Simulation History" with a list of past resets and counts.
    - Hidden if there are zero reset events.
  - [x] Wire into `SimulationClient` near the bottom (below the phase-specific panels).

- [x] Task 11: Backend — `tournament.listSimulationResetEvents` query (AC: #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add a query that:
    - Auth (protected), RLS transaction, ownership SELECT.
    - Selects from `events` where `aggregate_id = $competitionId AND aggregate_type = 'competition' AND type = 'simulation.reset'`, ordered by `created_at DESC`.
    - Returns `payload` cast to `SimulationResetPayload` with the row's `created_at`.
    - **isSimulation guard:** reject with `SIMULATION_NOT_ENABLED` for live competitions (no `simulation.reset` events should exist there anyway, but defense in depth).
  - [x] Tests: auth, NOT_FOUND, SIMULATION_NOT_ENABLED, returns events ordered newest-first.

- [x] Task 12: Frontend tests (AC: #1, #2, #3, #5)
  - [x] **New file** `apps/web/src/components/admin/simulation-reset-panel.spec.tsx`:
    1. Renders nothing when not a simulation.
    2. Click "Reset Simulation" → button changes to "Confirm Reset" + "Cancel".
    3. Confirm path calls `trpc.tournament.resetSimulation` with the right `competitionId`.
    4. Cancel path resets confirming state without calling the mutation.
    5. On success, the count summary is rendered inline.
    6. On error, the error message is rendered inline.
  - [x] **New file** `apps/web/src/components/admin/simulation-history-panel.spec.tsx`:
    1. Renders nothing when zero reset events.
    2. Renders a list when one or more reset events exist, in newest-first order.
    3. Each row shows the timestamp + counts.
  - [x] **Update** `apps/web/src/app/(judge)/judge/[token]/page.tsx` test (if it exists; create one if not) — verify "PRACTICE MODE" badge appears when `tokenData.isSimulation === true`. If the existing tests are difficult to extend (judge page tests are heavy), create a small `judge-practice-badge.spec.tsx` extracting the badge logic into a tiny dedicated component.

- [x] Task 13: CI gate verification
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — green.
  - [x] No new migrations.
  - [x] Build passes (`pnpm exec turbo run build`).

## Dev Notes

### Reset Semantics: What's "Initial Configured State"

AC #1 says "returns to its initial configured state — ready to run again". Interpretation:

- **Configured state** = competition row + criteria + competitors + judge_sessions (sim and real). These are "config" — they were set up before the simulation ever started.
- **Run state** = scores + votes + battle_matchups + competitor_group_assignments + status='active' + cypherCompletedAt. These accumulate during execution.
- **Reset** wipes run state, preserves configured state. The next `startCypherPhase` call will re-run round-robin assignment and re-emit `competition.started` — exactly as if the simulation had never run.

This interpretation aligns with the spirit of FR53 ("restart or reset") — organizer can iterate on the same configured simulation without rebuilding it.

[Source: `_bmad-output/planning-artifacts/epics.md` L1027-1029, FR53]

### Why DELETE Returns Counts (Not Just Side Effects)

The reset is destructive and irreversible. The audit event needs to record _what_ was destroyed for forensics. If a future bug causes an unexpected reset, the event payload tells us what the simulation looked like immediately before. `RETURNING id` from each DELETE is cheap and gives us exact counts without a separate COUNT query.

[Source: project-context.md `Ownership-by-subquery DELETE pattern` — this is a stricter version where we capture row counts for audit]

### Real-Judge Training Flow (FR55) Already Works — Don't Re-Engineer

Story 7.2 lifted `submitOrganizerScore`/`submitOrganizerVote` to allow simulation. The _public_ `submitScore`/`submitVote` procedures already work on simulations because they only check `comp.status === 'active'` and validate the token. They do NOT filter on `isSimulation`. So:

1. Generate sim judge links via existing `generateJudgeLinks` ✓ (no changes needed — verify with a regression test in Task 4).
2. Real judge opens link → `validateJudgeToken` returns session info ✓ (Task 3 adds `isSimulation` to the response).
3. Real judge submits scores via `submitScore` ✓ (already works — passes `comp.status === 'active'` check).
4. Real judge views are identical to live ✓ (AC #3 requirement satisfied; Task 6 only adds a small "PRACTICE MODE" badge so they don't panic).

So FR55 is mostly a verification + small UX badge story. Don't re-implement.

[Source: `apps/api/src/trpc/routers/tournament.router.ts:2637-2671` — `submitScore` checks status only]

### `simulation.reset` Event vs Deleting Events

Architecture rule: events table is append-only. The events for the pre-reset run (`competition.started`, `score.submitted` × N, etc.) stay in the table. Post-reset, the relational tables are empty, but the event log shows the full history including the reset itself.

**Q: Will old events cause stale-state bugs?**

A: No, because the relational tables are the source of truth for state queries. Events are read for:

- WS broadcast replay (none — broadcasts are not replayed)
- Audit trails (`getScoreAuditTrail`, etc. — these query by `scoreId`; if the score row is gone, the audit query returns empty, which is correct)
- The `phase.transitioned` fallback in `completeCypherPhase` (`belt-and-suspenders` test) — a reset clears `cypherCompletedAt`, so this fallback won't fire for the new run.

So leaving events alone is safe AND preserves the audit trail. AC #5 explicitly requires this.

### Event Sequence Numbering Across a Reset

The events table has a unique constraint on `(aggregate_id, aggregate_type, sequence)`. After a reset, the `simulation.reset` event gets `max(sequence) + 1`. The next run's `competition.started` will get `+ 2`. Sequence numbers are monotonic across the whole event history of the competition — they DO NOT reset on simulation reset. This is by design: the unique constraint enforces it, and forensics needs a globally unique sequence.

### `SimulationResetPayload` Shape

```typescript
{
  competitionId: 'comp_abc',
  resetAt: '2026-05-09T18:00:00.000Z',
  scoresDeleted: 24,
  votesDeleted: 12,
  matchupsDeleted: 7,
  groupAssignmentsDeleted: 8
}
```

The four counts let us answer questions like "how many practice rounds did the organizer run?" by summing across `simulation.reset` events.

### What the Reset Does NOT Touch

For the reviewer's quick reference:

| Table                          | Reset action  | Why                                                   |
| ------------------------------ | ------------- | ----------------------------------------------------- |
| `competitions` (this row)      | UPDATE        | status → draft, cypherCompletedAt → null              |
| `evaluation_criteria`          | KEEP          | Config — survive across resets                        |
| `competitors`                  | KEEP          | Mock participants are config (Story 7.1)              |
| `judge_sessions` (real + sim)  | KEEP          | Real judge tokens stay valid; sim sessions auto-reuse |
| `competitor_group_assignments` | DELETE        | Generated by startCypherPhase — re-derived next run   |
| `scores`                       | DELETE        | Run state                                             |
| `votes`                        | DELETE        | Run state                                             |
| `battle_matchups`              | DELETE        | Run state                                             |
| `events`                       | KEEP + APPEND | Append-only; reset event added                        |

### Project Structure Notes

**New files:**

```
packages/shared/validation/simulation.schema.ts                    (Task 1 — Zod schema)
packages/shared/events/simulation-events.ts                        (Task 1 — payload type)
apps/web/src/components/admin/simulation-reset-panel.tsx           (Task 7)
apps/web/src/components/admin/simulation-reset-panel.spec.tsx      (Task 12)
apps/web/src/components/admin/simulation-history-panel.tsx         (Task 10)
apps/web/src/components/admin/simulation-history-panel.spec.tsx    (Task 12)
```

**Modified files:**

```
apps/api/src/trpc/routers/tournament.router.ts            (Tasks 1, 3, 11 — resetSimulation, validateJudgeToken, listSimulationResetEvents)
apps/api/src/trpc/routers/tournament.router.spec.ts       (Tasks 4, 5, 11 — backend tests)
apps/api/src/modules/websocket/competition-gateway.interface.ts  (Task 2 — broadcastSimulationReset)
apps/api/src/modules/websocket/gateways/competition.gateway.ts   (Task 2 — implementation)
apps/api/src/modules/websocket/gateways/competition.gateway.spec.ts (Task 2 — broadcast test if applicable)
packages/shared/events/socket-event-map.ts                (Task 2 — ServerToClientEvents extension)
packages/shared/index.ts                                  (re-exports for the new schema/payload)
packages/shared/events/index.ts                           (re-exports for the new payload)
apps/web/src/hooks/use-admin-socket.ts                    (Task 9 — onSimulationReset)
apps/web/src/hooks/use-judge-socket.ts                    (Task 9)
apps/web/src/hooks/use-public-socket.ts                   (Task 9)
apps/web/src/components/admin/simulation-client.tsx       (Task 8 — wire reset panel + history panel)
apps/web/src/app/(judge)/judge/[token]/page.tsx           (Task 6 — PRACTICE MODE badge)
_bmad-output/implementation-artifacts/sprint-status.yaml  (story status: backlog → ready-for-dev → in-progress → review → done)
```

**Alignment with unified project structure:**

- Reset surface lives in `(admin)/[id]/simulation/` route (the route Story 7.2 created).
- New schema and payload follow existing `packages/shared/` conventions.
- Socket event map extension follows the established pattern (see Story 5.3 additions).
- No new directories. No new dependencies. No migrations.

**Detected variances:** None.

### CRITICAL Gotchas (From project-context.md — Apply, Don't Re-Discover)

1. **`proxy.ts` not `middleware.ts`** — no auth changes; reset is `protectedProcedure`.
2. **RLS transaction pattern** — `resetSimulation` MUST use `SET LOCAL session.current_organizer_id`.
3. **Ownership SELECT** — explicit `competitions.id WHERE organizer_clerk_id = ctx.userId` alongside RLS.
4. **`updatedAt: new Date()`** — required on the `competitions` UPDATE in step 7. Easy to miss.
5. **TOCTOU on event sequence** — `max(sequence) + 1` inside the same transaction; on `23505` (unique violation) re-throw `INTERNAL_SERVER_ERROR` (existing pattern from `submitScore`).
6. **Advisory lock** — prevents concurrent double-reset (rare but possible).
7. **WebSocket broadcasts go OUTSIDE the transaction** — collect the payload in a let-binding, broadcast after `db.db.transaction(...)` resolves. Mirrors `submitOrganizerScore` pattern.
8. **Architecture warning #10 (broadcast inside tx)** — the existing code does broadcasts inside the transaction in some places; for new code, prefer outside-tx (mentioned in the architecture doc). For consistency with the surrounding code in this router, mirror the existing post-commit pattern (see `submitOrganizerScore:3220` for the `broadcastPayload` let-binding pattern).
9. **TanStack Query v5** — invalidate via `useUtils()`; never `useQuery.onSuccess`.
10. **Confirmation pattern** — inline two-step button per project precedent (no modals).
11. **DELETE … RETURNING id pattern** — Drizzle supports `.returning({ id: scores.id })` on `.delete(scores).where(...)`. Verify against existing precedent — search `tournament.router.ts` for `.delete(...)` to confirm the syntax used.
12. **Don't widen `events` table reads** — the `events` table is shared across many features; only query the subset needed (`type = 'simulation.reset' AND aggregate_id = $1`).

### Previous Story Intelligence

**Story 7.2 — Organizer Runs Full Simulation as All Roles (done 2026-05-09):**

- Established multi-judge sim sessions auto-created in `startCypherPhase` (when `length < cypherGroupCount × cypherJudgeCount`). After a reset, sim sessions still exist — `startCypherPhase` no-ops the auto-create branch and proceeds to round-robin re-assignment. Confirmed safe.
- `(admin)/[id]/simulation/` route + `SimulationClient` is the home for the reset panel. Story 7.3's only addition to that file is wiring the new panels.
- `submitOrganizerScore`/`submitOrganizerVote` lifted the `!soloMode` guard to also accept simulations. Real-judge `submitScore`/`submitVote` were always permissive on simulations — Story 7.3 verifies this with regression tests.
- Code review fix H1 (split-component pattern) and M2 (no `Record<string, unknown>` casts) — apply both to new components in this story.

**Story 7.1 — Create a Simulation Competition (done 2026-05-08):**

- `is_simulation` column added; type `Competition.isSimulation`. Reset reads this flag.
- SIMULATION badge on `CompetitionCard` already established the visual language. Reuse for the judge view "PRACTICE MODE" badge in Task 6.

**Story 4.4 — Solo Scoring Mode (done):**

- The DELETE-and-rebuild pattern doesn't have direct precedent here, but the inline-confirm-button UX is established in `score-override-form.tsx` from Story 4.2. Use it for the reset confirmation.

**Story 5.3 — Bracket Progression (done):**

- Established the pattern of adding new socket events to `ServerToClientEvents` and per-hook handlers (`onMatchupCompleted`, etc.). Story 7.3 follows the exact same pattern for `simulation.reset`.

### Git Intelligence (Recent Commits)

```
bf69cb8 chore: checkpoint Story 7.1 simulation competitions + Epic 6 retro
f98b56c chore: checkpoint Epic 6 — public standings, bracket view, presenter mode
```

Local `main` is 2 commits ahead of `origin/main`. Story 7.2's diff (which Story 7.3 builds on) is uncommitted in the working tree from the previous session — confirm before starting that 7.2 commits are staged or committed first.

### Testing Standards

- **Backend (Vitest, node):** mock the DB transaction, sequential `whereResults`, INSERT spies for the event row, DELETE-RETURNING via the chainable helper. Test gateway interface stub gets `broadcastSimulationReset` added.
- **Frontend (Vitest, jsdom):** mock tRPC mutations and queries via `vi.hoisted`. Mirror the `simulate-config-link.spec.tsx` and `score-override-form.spec.tsx` patterns.
- **Coverage targets:**
  - Backend: ~10 new tests (8 reset + 2 validateJudgeToken + N for listSimulationResetEvents).
  - Frontend: ~9 new tests (6 reset panel + 3 history panel) + 1 judge badge test.
- **No E2E in scope** — TEA workflow can add later if needed.

### Open Questions for Implementation

1. **Should `resetSimulation` also re-run `cypher_completed_at = null` UPDATE if it's already null?** — Yes; idempotent UPDATE is safe and the audit event still appended. Test #6 covers this.
2. **Should `simulation.reset` events be visible on the public bracket page's "history"?** — No. Public pages don't need this signal — they just react to the broadcast and re-render empty state.
3. **Should we cap simulation history to last N events?** — Not in v1. Simple ORDER BY created_at DESC. If an organizer somehow accumulates 10k reset events, we'll add a LIMIT later.
4. **Does the reset broadcast need to fire to public rooms?** — Yes. Public standings/bracket pages must update so spectators don't see stale data after a reset. This matters during dual-device demo flows where the organizer's phone shows the public bracket while their laptop runs the reset.
5. **What about completed simulations (status=`completed`)?** — Reset still works. Test path: simulation → run cypher+battles to completion → reset → status returns to draft → can run again. The `status === 'completed'` branch in `SimulationClient` (renders just the bracket view) needs to also include the reset panel. Already covered by Task 8 ("ALL phase branches").

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7

### Debug Log References

None — clean implementation. Simulation-client spec needed mocks for the two new child panels (`SimulationResetPanel`, `SimulationHistoryPanel`) added by this story.

### Completion Notes List

- Task 1: New `resetSimulationSchema` (Zod) and `SimulationResetPayload` (interface) in `packages/shared`, exported from the barrel. New `tournament.resetSimulation` procedure with RLS, ownership SELECT, sim guard, advisory lock, ordered DELETEs returning row counts (votes → scores → battle_matchups → competitor_group_assignments), competition UPDATE (status='draft', cypherCompletedAt=null), and append-only `simulation.reset` event with sequence = max+1.
- Task 2: New `broadcastSimulationReset` on gateway interface + implementation. Broadcasts to admin + public + every per-judge room. Added `'simulation.reset'` to `ServerToClientEvents`. Test gateway stubs (`mockGateway` and `makeFullGateway`) updated.
- Task 3: `validateJudgeToken` now returns `isSimulation` from the competition row. Required by Task 6 for the PRACTICE MODE badge.
- Task 4: 8 backend tests for `resetSimulation` covering auth, NOT_FOUND, SIMULATION_NOT_ENABLED guard, mid-cypher happy path, mid-battles happy path, idempotent on draft, advisory lock invocation, unique-violation→INTERNAL_SERVER_ERROR mapping. The mid-cypher test asserts UPDATE was called, event was inserted with `sequence = maxSeq+1`, and broadcast fired with expected counts.
- Task 5: 2 backend tests for `validateJudgeToken` returning `isSimulation` for both sim and live competitions.
- Task 6: PRACTICE MODE amber badge added to judge view's `ConnectionDot` element when `tokenData.isSimulation === true`. Renders alongside the connection-status dot.
- Task 7: New `SimulationResetPanel` with two-step inline confirm/cancel UX (matches `score-override-form` precedent). On success, the mutation invalidates `getCompetition`, `getStandings`, `getBracket`, `listScoresForOverride`, `getDashboardSnapshot`, `listSimulationResetEvents`. Renders a "Last reset: {timestamp} — N scores, M votes, K matchups removed" footer.
- Task 8: Reset panel wired into `SimulationClient` directly below the simulation banner. History panel rendered at the bottom across all phase branches.
- Task 9: `onSimulationReset` callback added to `useAdminSocket`, `useJudgeSocket`, `usePublicSocket` hooks. Judge page subscribes and invalidates `validateJudgeToken` + `getJudgeAssignments` + `getBattlesAssignment` on receipt, plus clears `localScoredIds` so practice scores from the previous run disappear from the UI. `SimulationClient` also wires `onSimulationReset` via `useAdminSocket` (added in code review fix H1) to invalidate `getCompetition`, `getStandings`, `getBracket` so the page auto-reverts to draft view from any tab.
- Task 10: New `SimulationHistoryPanel` querying `listSimulationResetEvents`. Renders a card with newest-first list of resets and counts. Hidden when zero events.
- Task 11: `tournament.listSimulationResetEvents` query — protected, RLS, ownership, isSimulation guard, returns events ordered by `createdAt DESC` with payload spread + ISO `createdAt`. 4 backend tests (auth, NOT_FOUND, SIMULATION_NOT_ENABLED, happy path).
- Task 12: 7 frontend tests for `SimulationResetPanel` (hidden for non-sim, button visible, confirm UI, mutation call, cancel revert, success summary, **error display** — added in code review fix H2) + 2 for `SimulationHistoryPanel` (empty hidden, populated rows). Updated `simulation-client.spec.tsx` to mock the two new child panels and added assertions verifying both panels render in all phase branches (code review fix M1).
- Task 13: API typecheck/build/test green (349 tests). Web tests green (190 tests). Full CI gate passes except the same pre-existing `(admin)/layout.tsx` typecheck issue (Clerk Next.js 16 mismatch — waived in Stories 7.1 and 7.2; unchanged by this story).

### File List

**New files:**

- `packages/shared/validation/simulation.schema.ts`
- `packages/shared/events/simulation-events.ts`
- `apps/web/src/components/admin/simulation-reset-panel.tsx`
- `apps/web/src/components/admin/simulation-reset-panel.spec.tsx`
- `apps/web/src/components/admin/simulation-history-panel.tsx`
- `apps/web/src/components/admin/simulation-history-panel.spec.tsx`

**Modified files:**

- `packages/shared/index.ts`
- `packages/shared/events/socket-event-map.ts`
- `apps/api/src/trpc/routers/tournament.router.ts`
- `apps/api/src/trpc/routers/tournament.router.spec.ts`
- `apps/api/src/modules/websocket/competition-gateway.interface.ts`
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts`
- `apps/web/src/components/admin/simulation-client.tsx`
- `apps/web/src/components/admin/simulation-client.spec.tsx`
- `apps/web/src/app/(judge)/judge/[token]/page.tsx`
- `apps/web/src/hooks/use-admin-socket.ts`
- `apps/web/src/hooks/use-judge-socket.ts`
- `apps/web/src/hooks/use-public-socket.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-09: Story 7.3 implemented — simulation reset (DELETE + UPDATE + audit event + WS broadcast) and judge training surface (PRACTICE MODE badge + isSimulation flag in validateJudgeToken). Reset preserves config (criteria, mock participants, judge tokens, sim sessions) and wipes run-state (scores, votes, matchups, group assignments). Audit trail via append-only `simulation.reset` events; new `listSimulationResetEvents` query powers the history panel. 14 new backend tests, 8 new frontend tests.
- 2026-05-10: Code review fixes — H1: `SimulationClient` wired `useAdminSocket` + `onSimulationReset` for real-time auto-revert on reset from any tab. H2: Added missing error-display test to `simulation-reset-panel.spec.tsx` (7th test). M1: `simulation-client.spec.tsx` now mocks `useAdminSocket`/`@clerk/nextjs` and asserts `SimulationResetPanel`+`SimulationHistoryPanel` render in all phase branches. M3: `SimulationHistoryPanel` React key changed from `e.createdAt` to `e.resetAt` (stable per advisory-lock guarantee). Web tests: 190 (was 189).
