# Story 7.2: Organizer Runs Full Simulation as All Roles

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to act as all roles — organizer, all judges — from the admin panel during a simulation,
so that I can walk through the complete Cypher → Battles flow and validate every step before going live.

## Acceptance Criteria

1. **Given** a simulation competition is in Cypher phase, **when** I open the admin scoring panel, **then** I can submit scores for any participant as any judge group — without needing separate judge sessions open (FR51).

2. **Given** I have scored all participants across all judge groups, **when** I confirm advancement, **then** the top N participants are identified and the Battles bracket generates — identical to live competition behavior (FR52).

3. **Given** the Battles phase is active in simulation, **when** I open the admin voting panel, **then** I can cast votes for any matchup as any judge — progressing the bracket until a winner is determined (FR52).

4. **Given** I am running the simulation, **when** I use the admin scoring/voting panel, **then** all real-time WebSocket events fire normally — standings update, bracket progresses, public URL reflects changes — exactly as in a live competition.

5. **And** simulation uses the identical code paths as live competitions — no special simulation-only logic branches in scoring, aggregation, advancement, bracket generation, or vote tally code.

## Prerequisites

- **Story 7.1 done** ✓ — `competitions.is_simulation` column exists; create-simulation flow returns competitions with `isSimulation: true`.
- **Story 4.4 done** ✓ — `submitOrganizerScore` + `submitOrganizerVote` tRPC procedures exist (currently gated by `comp.soloMode === true`); single-Organizer-judge-session pattern with advisory lock established.
- **Story 5.x done** ✓ — Battles bracket generation, `processMatchupOutcome`, and `getBracket` all live and unchanged.
- **No DB migration required** — sessions for simulated judges reuse the existing `judge_sessions` table; the only differentiator is `created_by = organizerClerkId` and `label LIKE 'Sim Judge%'`.

## Tasks / Subtasks

- [x] Task 1: Backend — extend organizer-score/vote schemas with simulated judge identity (AC: #1, #3, #5)
  - [x] `packages/shared/validation/score.schema.ts` — extend `submitOrganizerScoreSchema`:
    ```typescript
    export const submitOrganizerScoreSchema = z.object({
      competitionId: z.string().min(1, 'Competition ID is required'),
      competitorId: z.string().min(1, 'Competitor ID is required'),
      scores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
      idempotencyKey: z.string().min(1, 'Idempotency key is required'),
      // NEW (optional — only used when competition.isSimulation === true)
      simulatedGroupIndex: z.number().int().min(0).max(25).optional(), // A..Z
      simulatedJudgeIndex: z.number().int().min(0).max(31).optional(),
    });
    ```
  - [x] Extend `submitOrganizerVoteSchema` the same way (no `simulatedGroupIndex` — battles judges are not group-scoped):
    ```typescript
    export const submitOrganizerVoteSchema = z.object({
      // ... existing fields ...
      simulatedJudgeIndex: z.number().int().min(0).max(31).optional(),
    });
    ```
  - [x] **Why optional + bounded:** Solo-mode (live) callers don't pass these — they get the single legacy "Organizer" session. Simulation callers always pass them. The bounds (`0..25` for group, `0..31` for judge) match the practical limits of `cypherGroupCount` and `cypherJudgeCount`/`battlesJudgeCount` (project supports up to ~24 groups, judge counts well under 32). Server still enforces `< comp.cypherGroupCount` / `< comp.cypherJudgeCount` (Task 3).

- [x] Task 2: Backend — helper `resolveOrganizerJudgeSession` for find-or-create logic (AC: #1, #3, #5)
  - [x] **New file:** `apps/api/src/trpc/routers/helpers/resolve-organizer-judge-session.ts` — extract the find-or-create logic that exists inline in `submitOrganizerScore`/`submitOrganizerVote` so both call sites and the new simulation path share one implementation:
    ```typescript
    export interface ResolveOrganizerJudgeSessionInput {
      tx: PgTransaction; // Drizzle tx type — match existing helpers
      competitionId: string;
      organizerClerkId: string;
      mode: 'solo' | 'simulation';
      simulatedGroupIndex?: number; // required when mode === 'simulation'
      simulatedJudgeIndex?: number; // required when mode === 'simulation'
    }
    ```
    Returns `{ judgeSessionId: string }`.
  - [x] Solo branch: existing behaviour — find/create one session with `label: 'Organizer'`, `groupIndex: 0`.
  - [x] Simulation branch: find/create session with:
    - `label: \`Sim Judge G\${String.fromCharCode(65 + simulatedGroupIndex)}-J\${simulatedJudgeIndex + 1}\``(e.g.,`Sim Judge GA-J1`).
    - `groupIndex: simulatedGroupIndex`.
    - `createdBy: organizerClerkId`.
    - `tokenHash: generateJudgeToken().hash` (the hash is unused for simulation — sessions are accessed only via the organizer procedures — but `tokenHash` is `NOT NULL UNIQUE` so we must populate it).
  - [x] **Advisory lock key** (prevents concurrent duplicate session creation):
    - Solo: `org-session-${competitionId}-${organizerClerkId}` (unchanged).
    - Simulation: `org-session-${competitionId}-${organizerClerkId}-G${simulatedGroupIndex}-J${simulatedJudgeIndex}`.
  - [x] Find query criteria:
    - Solo: `createdBy = organizerClerkId AND label = 'Organizer'`.
    - Simulation: `createdBy = organizerClerkId AND label = '<sim-label>'`.
  - [x] Refactor `submitOrganizerScore` (existing line ~3084-3120) and `submitOrganizerVote` (existing line ~3289-3326) to call this helper. Solo behavior stays bit-identical (regression risk addressed in Task 7).

- [x] Task 3: Backend — update `submitOrganizerScore`/`submitOrganizerVote` guards to allow simulation mode (AC: #1, #3, #4, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — `submitOrganizerScore`:
    - Add `isSimulation: competitions.isSimulation`, `cypherGroupCount: competitions.cypherGroupCount`, `cypherJudgeCount: competitions.cypherJudgeCount` to the competition SELECT (line ~3025-3037).
    - **Replace** the `if (!comp.soloMode)` guard at line ~3055 with:
      ```typescript
      if (!comp.soloMode && !comp.isSimulation) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Organizer scoring requires solo mode or simulation mode',
          cause: { errorCode: ErrorCodes.ORGANIZER_SCORING_NOT_ENABLED },
        });
      }
      ```
    - Determine `mode`: `comp.isSimulation ? 'simulation' : 'solo'`. Solo and simulation are mutually exclusive — solo is only valid for live single-judge competitions; simulation always implies multi-judge mock. If both flags are somehow true on the same row, prefer `'simulation'` (it's a stricter validation path).
    - For `mode === 'simulation'`: validate `input.simulatedGroupIndex` is defined AND `< comp.cypherGroupCount`; validate `input.simulatedJudgeIndex` is defined AND `< comp.cypherJudgeCount`. Throw `BAD_REQUEST` with `ErrorCodes.SIMULATION_JUDGE_INDEX_OUT_OF_RANGE` otherwise.
    - For `mode === 'solo'`: ignore `simulatedGroupIndex`/`simulatedJudgeIndex` even if passed (defensive — solo always uses the legacy single Organizer session).
    - Replace the inline find-or-create block with `await resolveOrganizerJudgeSession({ tx, competitionId, organizerClerkId: ctx.userId, mode, simulatedGroupIndex, simulatedJudgeIndex })`.
    - Rest of the procedure (idempotency check, validation, INSERT scores, INSERT events, broadcast) is unchanged. **This is the critical "no special branches" requirement** — past the session resolution, the code path is identical to solo/live.
  - [x] `submitOrganizerVote` — apply the same shape of changes:
    - Extend SELECT to include `isSimulation`, `battlesJudgeCount`.
    - Replace `if (!comp.soloMode)` (line ~3280) with `if (!comp.soloMode && !comp.isSimulation)`.
    - Determine `mode`. For simulation, validate `simulatedJudgeIndex` defined AND `< comp.battlesJudgeCount`. (No `simulatedGroupIndex` — battles voting is competition-wide, not group-scoped per project model.)
    - Replace the inline find-or-create with `resolveOrganizerJudgeSession({ ..., simulatedGroupIndex: 0, simulatedJudgeIndex })` — group index is always 0 for battles sessions because battles judges are unassigned to cypher groups.

- [x] Task 4: Backend — `startCypherPhase` bypass for simulations + auto-create sim sessions (AC: #1, #2, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` `startCypherPhase` (line ~1488):
    - Add `isSimulation: competitions.isSimulation`, `cypherJudgeCount: competitions.cypherJudgeCount` to SELECT.
    - Update step 6's INSUFFICIENT_JUDGE_LINKS guard to bypass for simulations:
      ```typescript
      if (!comp.soloMode && !comp.isSimulation && allJudgeSessions.length < groupCount) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: ..., cause: { errorCode: ErrorCodes.INSUFFICIENT_JUDGE_LINKS } });
      }
      ```
    - **NEW**: For simulations, before the round-robin step (step 7), pre-create exactly `cypherGroupCount × cypherJudgeCount` simulated judge sessions if they don't already exist:
      ```typescript
      if (comp.isSimulation) {
        const desiredSessions: NewJudgeSessionRow[] = [];
        for (let g = 0; g < comp.cypherGroupCount; g++) {
          for (let j = 0; j < comp.cypherJudgeCount; j++) {
            const { hash } = generateJudgeToken();
            desiredSessions.push({
              competitionId: input.competitionId,
              tokenHash: hash,
              label: `Sim Judge G${String.fromCharCode(65 + g)}-J${j + 1}`,
              createdBy: ctx.userId,
              groupIndex: g,
            });
          }
        }
        await tx.insert(judgeSessions).values(desiredSessions);
        // Re-load for round-robin (simulations now have judges to assign).
        allJudgeSessions = await tx
          .select({ id: judgeSessions.id })
          .from(judgeSessions)
          .where(eq(judgeSessions.competitionId, input.competitionId))
          .orderBy(asc(judgeSessions.createdAt));
      }
      ```
    - **Why pre-create here, not lazily on first submit:** the round-robin assignment of judges to groups (steps 7–9) happens at phase start. To match live behavior, simulated judges must already exist with `groupIndex` set, so the assignment writes the same shape of `competition.started` event payload. This keeps the event sourcing and downstream aggregation IDENTICAL between simulation and live.
    - **Note on `tokenHash` uniqueness:** `generateJudgeToken()` generates random tokens — collision probability is astronomically low (collision space is 256 bits via `crypto.randomBytes(32)`). The unique constraint TOCTOU (`23505`) is handled by the existing helper pattern; if it ever fires, retry the simulation create end-to-end (rare enough that we don't add explicit retry logic in v1).
  - [x] **soloMode + isSimulation interaction:** these flags are mutually exclusive by domain definition. `createSimulation` (Story 7.1) does not set `soloMode`, and the `setSoloMode` procedure (Story 4.4) operates only on live competitions in the existing flow. Add a defensive check at the top of `setSoloMode`: reject with `BAD_REQUEST` if `comp.isSimulation`. (Search for `setSoloMode` in `tournament.router.ts` — apply guard before the existing draft-status check.)

- [x] Task 5: Backend — error codes (AC: #1, #3)
  - [x] `packages/shared/errors/error-codes.ts` — add:
    ```typescript
    ORGANIZER_SCORING_NOT_ENABLED: 'ORGANIZER_SCORING_NOT_ENABLED',
    SIMULATION_JUDGE_INDEX_OUT_OF_RANGE: 'SIMULATION_JUDGE_INDEX_OUT_OF_RANGE',
    SIMULATION_NOT_ENABLED: 'SIMULATION_NOT_ENABLED',
    ```
  - [x] **Replace** `SOLO_MODE_NOT_ENABLED` usages in `submitOrganizerScore`/`submitOrganizerVote` with `ORGANIZER_SCORING_NOT_ENABLED` (the more general code). Keep `SOLO_MODE_NOT_ENABLED` in the codes file (other tests may reference it; deletion is out of scope).

- [x] Task 6: Frontend — new simulation control route (AC: #1, #3, #4)
  - [x] **New file:** `apps/web/src/app/(admin)/competitions/[id]/simulation/page.tsx` — server component:
    ```tsx
    export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      return <SimulationClient competitionId={id} />;
    }
    ```
  - [x] **New file:** `apps/web/src/components/admin/simulation-client.tsx` — client component (`'use client'`):
    - Fetches `trpc.tournament.getCompetition.useQuery({ competitionId })`.
    - **Guards** (in order — render whichever fires first, hide others):
      1. If `!competition` → loading skeleton.
      2. If `!competition.isSimulation` → redirect to `/competitions/${id}` (use `useRouter().replace(...)` in an effect, NOT in render — split-component pattern from Story 7.1 H1 fix).
      3. If `competition.status === 'draft'` → render "Configure & Start" panel: `<StartCypherPhasePanel>` (existing) — works because `startCypherPhase` now bypasses INSUFFICIENT_JUDGE_LINKS for sims.
      4. If `competition.status === 'active' && !competition.cypherCompletedAt` → render `<SimulationCypherPanel>` (Task 6c).
      5. If `competition.status === 'active' && competition.cypherCompletedAt` → render `<SimulationBattlesPanel>` (Task 6d) AND `<BracketViewPanel>` (existing).
      6. If `competition.status === 'completed'` → render results / champion view (reuse `<BracketViewPanel>` showing the final bracket).
    - **Header**: prominent amber banner with "SIMULATION" badge + competition name + reset link to `/competitions/[id]` (settings).
    - **Phase progression controls** (visible per phase): `<StartCypherPhasePanel>`, `<CypherResultsPanel>` (existing — handles "Confirm Advancement" → `completeCypherPhase` → bracket generation).
  - [x] **New file:** `apps/web/src/components/admin/simulation-cypher-panel.tsx` (`'use client'`):
    - Props: `competitionId: string`.
    - Queries: `getCompetition` (for `cypherJudgeCount`, `cypherGroupCount`), `listCompetitorsWithStatus`, `listCriteria`, `getStandings`, **new** `listSimulatedJudgeSessions` (Task 6e).
    - **State:** `selectedGroupIndex` (number, default 0), `selectedJudgeIndex` (number, default 0).
    - **UI:**
      - Top bar: two `<select>` dropdowns:
        - Group: `Group A`, `Group B`, ..., up to `cypherGroupCount`.
        - Judge: `Judge 1`, `Judge 2`, ..., up to `cypherJudgeCount`.
      - Below: list of competitors **assigned to selectedGroupIndex** (filter `listCompetitorsWithStatus` by `groupIndex` from `competitorGroupAssignments`; query `listCompetitorsByGroup` already exists — verify; if not, extend `listCompetitorsWithStatus` to include `groupIndex` from the join).
      - Each competitor row: criterion inputs + "Submit" button — calls `trpc.tournament.submitOrganizerScore.useMutation()` with `{ competitionId, competitorId, scores, idempotencyKey, simulatedGroupIndex: selectedGroupIndex, simulatedJudgeIndex: selectedJudgeIndex }`.
      - "Already scored" indicator per competitor for the selected judge (look up via `listScoresForCompetition` filtered by `judgeSessionId === sim session for this G+J`).
    - **Pattern reuse:** the row-level structure mirrors `solo-scoring-panel.tsx:CompetitorScoringRow`. Extract a shared `<CompetitorScoringRow>` if it would be the third consumer; otherwise inline (per project conventions — one cross-consumer is fine).
    - **Progress indicator:** "Scored: 3 of 8 competitors as Judge G**A**-J**1**" — derived from filtered scores.
  - [x] **New file:** `apps/web/src/components/admin/simulation-battles-panel.tsx` (`'use client'`):
    - Props: `competitionId: string`.
    - Queries: `getCompetition` (for `battlesJudgeCount`), `getBracket`, `listScoresForCompetition` (for vote-state per matchup — actually use a new `listVotesForMatchup` if it exists; verify in router; if missing, add or reuse `getBracket` data).
    - **State:** `selectedJudgeIndex`.
    - **UI:**
      - Top bar: judge selector `<select>` `Judge 1` to `Judge N` (N = `battlesJudgeCount`).
      - Per open matchup (filter `bracket.matchups` for `!isBye && winnerCompetitorId === null && competitorA && competitorB`): `<JudgeVoteInput>` (existing format component) → `submitOrganizerVote` mutation with `simulatedJudgeIndex: selectedJudgeIndex`.
      - Per matchup: progress indicator "Voted: 1 of 3 judges". Tally not shown to organizer (matches live judge UX).
    - **Pattern reuse:** mirrors `battles-voting-panel.tsx:MatchupCard` — same `<JudgeVoteInput>` component, just adds the `simulatedJudgeIndex` to the mutation payload.

- [x] Task 7: Frontend — wire simulation route into existing competition pages (AC: #1, #3, #4)
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — when `competition.isSimulation === true`:
    - Hide `<SoloScoringPanel>` (it's gated by `competition.soloMode` which is false for sims — already correctly hidden, no change needed).
    - Hide `<BattlesVotingPanel>` (same — already gated by `competition.soloMode`).
    - Hide `<SimulateConfigLink>` (already done in Story 7.1 — verify).
    - **Add** a prominent CTA: `<Link href="/competitions/[id]/simulation" className={buttonVariants({ variant: 'default' })}>Open Simulation Control</Link>` — visible only when `competition.isSimulation === true`. Place next to `<LiveDashboardLink>` in the header row.
    - **Why we keep both routes:** the existing `/competitions/[id]` page is for setup/configuration (criteria, participants, judge groups). The new `/competitions/[id]/simulation` is for running the simulation. Mirrors how live competitions use `/live` for the running dashboard.
  - [x] **Component:** make this a small new client component `<OpenSimulationLink competitionId={id} />` that fetches `getCompetition` and conditionally renders the link. Keep the server page server.

- [x] Task 8: Backend — `listSimulatedJudgeSessions` query (AC: #1, #3) — used by frontend to verify which sim sessions exist for the dropdown labels and to count submissions per (group, judge)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add:
    ```typescript
    listSimulatedJudgeSessions: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('session.current_organizer_id', ${ctx.userId}, true)`);
          // Ownership SELECT (RLS + explicit) — must verify competition belongs to organizer.
          const [comp] = await tx.select({ id: competitions.id, isSimulation: competitions.isSimulation })
            .from(competitions).where(eq(competitions.id, input.competitionId));
          if (!comp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
          if (!comp.isSimulation) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a simulation competition', cause: { errorCode: ErrorCodes.SIMULATION_NOT_ENABLED } });
          }
          return tx.select({
            id: judgeSessions.id,
            label: judgeSessions.label,
            groupIndex: judgeSessions.groupIndex,
          }).from(judgeSessions)
            .where(and(
              eq(judgeSessions.competitionId, input.competitionId),
              like(judgeSessions.label, 'Sim Judge%'),
            ))
            .orderBy(asc(judgeSessions.label));
        });
      }),
    ```
  - [x] **Why filter by `label LIKE 'Sim Judge%'`** rather than a separate `is_simulated` column: avoids a DB migration. The label prefix is server-controlled (only `resolveOrganizerJudgeSession` and `startCypherPhase`'s sim path produce it). If we later need stronger structure, add a `is_simulated boolean` column (separate story).

- [x] Task 9: Backend — `listCompetitorsByGroup` (or extend `listCompetitorsWithStatus` to include `groupIndex`) (AC: #1)
  - [x] Check if `listCompetitorsWithStatus` already returns `groupIndex` (search for the procedure definition in `tournament.router.ts`). If it joins `competitorGroupAssignments`, we're done — Task 6c just filters client-side.
  - [x] If `groupIndex` is NOT in the result, extend the SELECT to LEFT JOIN `competitorGroupAssignments` and return `groupIndex: competitorGroupAssignments.groupIndex`. This is additive — existing consumers (cypher results panel, etc.) ignore the new field.
  - [x] **Note:** `competitorGroupAssignments` is populated only after `startCypherPhase`. Pre-cypher, `groupIndex` is null and the simulation panel shows nothing — guard in Task 6c handles this (`competition.status === 'active'`).

- [x] Task 10: Backend tests (AC: #1, #2, #3, #4, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add tests:
    1. **Auth:** `caller(null).tournament.submitOrganizerScore({ ..., simulatedGroupIndex: 0, simulatedJudgeIndex: 0 })` → UNAUTHORIZED.
    2. **Zod:** reject `simulatedGroupIndex: -1` and `simulatedGroupIndex: 26`. Reject non-integer.
    3. **Zod:** reject `simulatedJudgeIndex: -1` and `simulatedJudgeIndex: 32`.
    4. **Mode guard:** non-solo, non-simulation competition → BAD_REQUEST `ORGANIZER_SCORING_NOT_ENABLED`.
    5. **Group bound:** simulation with `cypherGroupCount: 2`, call with `simulatedGroupIndex: 2` → BAD_REQUEST `SIMULATION_JUDGE_INDEX_OUT_OF_RANGE`.
    6. **Judge bound:** simulation with `cypherJudgeCount: 3`, call with `simulatedJudgeIndex: 3` → BAD_REQUEST.
    7. **Happy path Cypher:** simulation with `cypherGroupCount: 2`, `cypherJudgeCount: 3`. Submit score with `simulatedGroupIndex: 1, simulatedJudgeIndex: 0`. Assert: a judgeSession with label `Sim Judge GB-J1`, groupIndex `1`, createdBy `ctx.userId` was created; score row is linked to that session.
    8. **Session reuse:** submit twice as `(G1, J0)` for two different competitors. Assert: only ONE judge session created (find-or-create works); two scores link to the same session.
    9. **Distinct sessions per (G, J):** submit as `(G0, J0)` then `(G0, J1)`. Assert: two distinct sessions, both labeled `Sim Judge GA-J*`.
    10. **Solo regression:** existing solo-mode test passes unchanged — call without `simulatedGroupIndex`/`simulatedJudgeIndex` on a soloMode competition → still uses single `Organizer` session, score recorded normally.
    11. **Idempotency:** same `idempotencyKey` from same `(G, J)` → `idempotent: true`, no second insert.
    12. **`startCypherPhase` for simulation:** simulation with `cypherGroupCount: 2`, `cypherJudgeCount: 3` and ZERO judge sessions → succeeds, auto-creates 6 sim sessions, assigns groupIndex via round-robin, broadcasts `competition.started` with `judgeAssignments` of length 6.
    13. **`startCypherPhase` for live without sessions:** non-sim, non-solo, 0 sessions → still fails with `INSUFFICIENT_JUDGE_LINKS` (regression check).
    14. **Battles AC#3:** simulation past cypher with `battlesJudgeCount: 3`, three matchups. Submit votes as `(J0)`, `(J1)`, `(J2)` for one matchup → matchup resolves with majority winner; `processMatchupOutcome` advances bracket — assert next round generated.
    15. **Battles judge bound:** `simulatedJudgeIndex: battlesJudgeCount` → BAD_REQUEST.
    16. **`listSimulatedJudgeSessions`:** auth test, non-sim competition → BAD_REQUEST `SIMULATION_NOT_ENABLED`, sim competition with 4 sim sessions → returns 4 entries sorted by label.
    17. **`setSoloMode` simulation guard:** call `setSoloMode({ soloMode: true })` on a simulation → BAD_REQUEST.
  - [x] **Pattern:** all tests follow existing `mockDb` + `caller()` shape. Mock `tx.select`/`tx.insert` per the find-or-create branches. See Story 7.1 spec lines 7200+ in compiled spec for template.

- [x] Task 11: Frontend tests (AC: #1, #3, #4)
  - [x] **New file:** `apps/web/src/components/admin/simulation-client.spec.tsx`:
    1. `competition.isSimulation === false` → redirects (assert `router.replace` called with `/competitions/${id}`).
    2. `status === 'draft'` → renders `StartCypherPhasePanel`.
    3. `status === 'active', cypherCompletedAt: null` → renders `SimulationCypherPanel`.
    4. `status === 'active', cypherCompletedAt: <date>` → renders `SimulationBattlesPanel` + `BracketViewPanel`.
  - [x] **New file:** `apps/web/src/components/admin/simulation-cypher-panel.spec.tsx`:
    1. Group dropdown shows `cypherGroupCount` options (e.g., 2 → "Group A", "Group B").
    2. Judge dropdown shows `cypherJudgeCount` options.
    3. Selecting (Group B, Judge 2) → submit button calls `submitOrganizerScore` with `simulatedGroupIndex: 1, simulatedJudgeIndex: 1`.
    4. Already-scored indicator: when `listScoresForCompetition` returns a score for `(competitor X, sim session matching current G+J)`, that row shows "✓ Scored".
    5. Competitors filtered by `groupIndex === selectedGroupIndex`.
  - [x] **New file:** `apps/web/src/components/admin/simulation-battles-panel.spec.tsx`:
    1. Judge dropdown count = `battlesJudgeCount`.
    2. Vote click → `submitOrganizerVote` called with `simulatedJudgeIndex: selectedJudgeIndex`.
    3. No matchups open → renders "All matchups voted on" message (mirrors live).
  - [x] **Pattern:** mirror `battles-voting-panel.spec.tsx` and `solo-scoring-panel` patterns. Mock tRPC via existing test harness.

- [x] Task 12: CI gate
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — green.
  - [x] No new migration in this story; nothing to apply locally.
  - [x] Run `pnpm exec turbo run build` to verify no Next.js 16 build issues with the new route group entry.

## Dev Notes

### The "No Special Branches" Constraint (AC #5)

Story 7.2's most subtle AC: simulation must use **identical code paths** as live. This is not a vague guideline — it is a measurable architectural rule (Architecture L36): "simulation and live share identical code paths, differentiated only by data source."

**What we DO branch on:**

- Session resolution (`resolveOrganizerJudgeSession`): `mode === 'solo' | 'simulation'` picks which session (label + group) to find-or-create.
- Phase-start sim session pre-creation in `startCypherPhase`: only fires when `comp.isSimulation`.
- `INSUFFICIENT_JUDGE_LINKS` bypass: only for sim or solo (mirrors existing solo bypass).

**What we MUST NOT branch on:**

- Score insertion, validation, idempotency check, event sequencing — same code as `submitScore` / `submitOrganizerScore` solo path.
- Vote insertion, matchup outcome processing (`processMatchupOutcome`), bracket advancement.
- WebSocket broadcasts (`broadcastScoreSubmitted`, `broadcastVoteSubmitted`, `broadcastEnrichedStandings`, etc.).
- Cypher round-robin assignment, advancement threshold logic, bracket generation.
- Public standings/bracket views — they query the same tables and don't filter on `is_simulation` (already established in Story 7.1).

**The trick:** by pre-creating sim judge sessions at `startCypherPhase` and resolving them by label at score/vote time, the live aggregation pipeline sees N judge sessions per group × M groups — exactly the same shape as a real competition with N×M judges. No downstream code knows or cares it's a simulation.

[Source: `_bmad-output/planning-artifacts/architecture.md` L36, L1119, L1175]

### Why Reuse `submitOrganizerScore` / `submitOrganizerVote` Instead of New Procedures

Three options were considered:

1. **NEW procedures `submitSimulationScore` / `submitSimulationVote`** — clean separation, but duplicates ~300 lines of logic (idempotency, criteria validation, event sequencing, broadcast). Violates DRY and creates two code paths to keep in sync.

2. **Make organizer call `submitScore` (the public judge endpoint) with a generated token** — would route through the live judge flow, achieving "identical code paths" perfectly. But: requires exposing or fabricating tokens in the frontend, breaks the protected/public auth boundary, and complicates idempotency-per-judge.

3. **Extend `submitOrganizerScore`/`submitOrganizerVote`** ✓ — tiny diff in the procedures (mode determination + helper extraction), reuses the entire score/vote/event/broadcast pipeline, satisfies AC #5 with the smallest blast radius. Helper extraction (`resolveOrganizerJudgeSession`) is good cleanup regardless.

We chose option 3.

### `judge_sessions.token_hash` for Sim Sessions

`judge_sessions.token_hash` is `TEXT NOT NULL UNIQUE`. For real judges, the hash corresponds to a one-time URL token an organizer hands out. For sim sessions, **nobody ever uses the token** — the organizer authenticates via Clerk and uses `submitOrganizerScore`/`submitOrganizerVote`. The hash exists only to satisfy the NOT NULL UNIQUE constraint.

**Two options:**

- **Generate a random hash via `generateJudgeToken().hash`** ✓ — chosen; matches the format and uniqueness guarantee with no schema change.
- **Make `token_hash` nullable** — schema change, broader migration risk, no functional benefit.

If we ever need to disambiguate sim sessions from real ones at the DB level, a `is_simulated boolean` column on `judge_sessions` is a future, separate story.

### Why Pre-Create Sim Sessions at Phase Start (Not Lazily)

Cypher's `startCypherPhase` round-robin-assigns judges to groups (steps 7–9) and emits a `competition.started` event with the full `judgeAssignments` payload. If we created sim sessions lazily (on first submit), the event would fire with 0 judges, and the live aggregation code that reads `competitorGroupAssignments × judgeSessions` would see a degenerate state mid-simulation.

**Pre-creating at phase start** keeps the `competition.started` event byte-shape identical to live, keeps round-robin assignment deterministic, and keeps the `processMatchupOutcome` and standings code paths blissfully unaware that this is a simulation.

### `listCompetitorsWithStatus` `groupIndex` Inclusion

Verify whether the existing query already returns `groupIndex`. The cypher results panel needs to know group assignments — it likely already joins. If it does, Task 9 is a no-op. If not, the join is a 3-line LEFT JOIN addition.

```typescript
.leftJoin(
  competitorGroupAssignments,
  and(
    eq(competitorGroupAssignments.competitionId, competitors.competitionId),
    eq(competitorGroupAssignments.competitorId, competitors.id),
  ),
)
```

This is additive — pre-cypher rows have `groupIndex: null`, post-cypher rows have the assigned value.

### Battles Voting: No Group Index

Battles voting in this project is competition-wide, not group-scoped. `battles_judge_count` is the number of judges who vote on every matchup — not per-group. So the simulation battles panel only has a single judge selector (1..N), no group selector. This matches `battles-voting-panel.tsx`'s mental model.

The sim battles judge sessions reuse the cypher sessions created at phase start? **No — they are separate.** Cypher sim sessions have `groupIndex` set; battles sim sessions are conceptually different judges. **Resolution:** for battles, the helper creates sessions with label `Sim Judge B-J1`...`Sim Judge B-JN` (the `B` distinguishes them from cypher's `GA`...`GZ`). They are also pre-creatable at the start of the battles phase, but **lazy creation is fine here** because no round-robin assignment runs at battles entry — the matchups don't care which judges exist, only that `battlesJudgeCount` votes resolve each matchup. So we let `resolveOrganizerJudgeSession` create them on first vote. Update `Sim Judge` label format:

- Cypher: `Sim Judge G{A-Z}-J{1-N}` (group-scoped, pre-created at startCypherPhase).
- Battles: `Sim Judge B-J{1-N}` (no group, lazy-created on first organizer vote).

This requires Task 2 to accept a `phase: 'cypher' | 'battles'` discriminator instead of just `simulatedGroupIndex`. Simpler API:

```typescript
mode: 'solo' | 'simulation-cypher' | 'simulation-battles';
```

Update Task 2 helper signature accordingly. The simulation battles helper ignores `simulatedGroupIndex` (always `null`) and uses label `Sim Judge B-J{N}`.

### Project Structure Notes

**New files:**

```
apps/api/src/trpc/routers/helpers/resolve-organizer-judge-session.ts        (Task 2 — extract find-or-create)
apps/web/src/app/(admin)/competitions/[id]/simulation/page.tsx              (Task 6 — server route)
apps/web/src/components/admin/simulation-client.tsx                         (Task 6 — client guard/router)
apps/web/src/components/admin/simulation-cypher-panel.tsx                   (Task 6c)
apps/web/src/components/admin/simulation-battles-panel.tsx                  (Task 6d)
apps/web/src/components/admin/open-simulation-link.tsx                      (Task 7)
apps/web/src/components/admin/simulation-client.spec.tsx                    (Task 11)
apps/web/src/components/admin/simulation-cypher-panel.spec.tsx              (Task 11)
apps/web/src/components/admin/simulation-battles-panel.spec.tsx             (Task 11)
```

**Modified files:**

```
packages/shared/validation/score.schema.ts                  (Task 1 — schema extensions)
packages/shared/errors/error-codes.ts                       (Task 5 — new codes)
apps/api/src/trpc/routers/tournament.router.ts              (Tasks 3, 4, 8 — guards, sim session pre-create, listSimulatedJudgeSessions)
apps/api/src/trpc/routers/tournament.router.spec.ts         (Task 10 — backend tests)
apps/web/src/app/(admin)/competitions/[id]/page.tsx         (Task 7 — Open Simulation Control link)
_bmad-output/implementation-artifacts/sprint-status.yaml    (story status: backlog → ready-for-dev)
```

**Alignment with unified project structure:**

- New `(admin)/[id]/simulation/` route was reserved by the architecture doc (L896) — this story finally implements it. ✓
- Helpers folder convention: existing helpers live next to routers (e.g., `score-validation.ts` in `apps/api/src/trpc/routers/`). New helper goes in same folder OR a `helpers/` subfolder — choose `helpers/` if creating it doesn't already exist; otherwise inline next to the router. Verify directory existence.
- No new packages, no new dependencies, no new migrations.
- Shared schema/types/errors extended in canonical locations.

**Detected variances:**

- Architecture L1119 maps FR50-FR55 to `(admin)/[id]/simulation/` — Story 7.2 implements this route. ✓ No variance.
- The original `submitOrganizerScore`/`submitOrganizerVote` were named for solo mode (Story 4.4); Story 7.2 generalises them. Naming kept (no rename) to avoid massive client diff.

### CRITICAL Gotchas (From project-context.md — Apply, Don't Re-Discover)

1. **`proxy.ts` not `middleware.ts`** — new `/competitions/[id]/simulation/` route is under `(admin)/`, already Clerk-protected. No proxy changes.
2. **Server params are Promise** — `params: Promise<{ id: string }>; const { id } = await params;` (Next.js 16). Story 7.1's pattern is the reference.
3. **IDs server-generated with `nanoid(21)`** — sim judge session IDs use `judgeSessions.id.$defaultFn(() => nanoid(21))` (already on the schema). Don't pass `id` in `.values()`.
4. **Scores stored as strings `"X.XX"`** — `JudgeVoteInput` already produces correctly formatted scores; the simulation cypher panel reuses the existing `parseFloat(...).toFixed(2)` pattern from `solo-scoring-panel.tsx:65`.
5. **RLS transaction** — every new procedure (`listSimulatedJudgeSessions`) wraps in `db.db.transaction` with `SET LOCAL session.current_organizer_id`.
6. **Ownership SELECT** — `listSimulatedJudgeSessions` does an explicit `SELECT id FROM competitions WHERE id = $competitionId` with RLS; throws NOT_FOUND on miss.
7. **`updatedAt` on UPDATEs** — `startCypherPhase`'s sim path INSERTs only (no `competitions` UPDATE beyond the existing `status: active`); existing `updatedAt: new Date()` line at ~1621 already covers it.
8. **TOCTOU on `judge_sessions.token_hash` UNIQUE** — `generateJudgeToken()` produces 256-bit randomness; collision is astronomically unlikely. Don't add a try/catch retry loop — keep behaviour identical to the existing `submitOrganizerScore` find-or-create.
9. **TanStack Query v5 `onSuccess`/`onError` removed from `useQuery`** — for the sim simulation panels, derive UI state from `data` directly. Mutations still have `onSuccess`/`onError` (used).
10. **Split-component pattern when initialising `useState` from query data** — Task 6 redirect-on-non-simulation uses `useEffect` for `router.replace`, NOT `setState` in render (Story 7.1 H1 fix is the cautionary tale).
11. **`<Button>` does not support `asChild`** — link-as-button pattern: `<Link href="..." className={buttonVariants({ variant: 'default' })}>` (already used in Story 7.1's "New Simulation" button at `competitions/page.tsx`).
12. **No `comp.soloMode && comp.isSimulation`** — defensive check in `setSoloMode` (Task 4) prevents the impossible-but-test-it state. `createSimulation` does not set `soloMode: true`.

### Previous Story Intelligence

**Story 7.1 — Create a Simulation Competition (done 2026-05-08):**

- Established `competitions.is_simulation` column, `Competition.isSimulation` shared type, `createSimulationSchema` with mock-participant generation, "SIMULATION" badge UX. Story 7.2 builds entirely on this foundation — does NOT add a column, does NOT touch participant generation.
- **Code review fix H1** taught us: never call `setState` in the render body of a component derived from query data. Use the split-component pattern. **Apply directly to Task 6's `<SimulationClient>`** redirect logic — use `useEffect` for `router.replace`, not direct invocation.
- **Code review fix M2** taught us: never cast `Record<string, unknown>` on Drizzle INSERTs. Use typed spreads. Apply to Task 4's bulk `judgeSessions` insert — values are typed via `NewJudgeSessionRow`, no cast needed.

**Story 4.4 — Solo Scoring Mode (done):**

- Established `submitOrganizerScore`/`submitOrganizerVote`, the find-or-create-with-advisory-lock pattern for organizer judge sessions, the "Organizer" label convention, and `SOLO_MODE_NOT_ENABLED` error code. Story 7.2 extracts this pattern into a helper and adds the simulation branch.
- **Reuses:** the entire score/vote/event/broadcast pipeline downstream of session resolution.

**Story 5.3 — Bracket Progression (done):**

- Established `processMatchupOutcome` for tally-and-advance after each vote. Story 7.2's simulation battles panel benefits transparently — no changes needed in `processMatchupOutcome`.

**Story 5.1 — Battles Bracket Generation (done):**

- Established `completeCypherPhase` → bracket generation. Triggered identically for sim and live. Story 7.2 verifies via Test #14.

### Git Intelligence (Recent Commits)

```
bf69cb8 chore: checkpoint Story 7.1 simulation competitions + Epic 6 retro
f98b56c chore: checkpoint Epic 6 — public standings, bracket view, presenter mode
```

Local `main` is 2 commits ahead of `origin/main` (per sprint-status discovery). No outstanding refactors or in-progress work blocks Story 7.2. Story 7.1's code is the direct foundation; the diff base is the current `main`.

### Testing Standards

- **Backend (Vitest, node):** `mockDb` + `caller()` from `tournament.router.spec.ts`. Mock `tx.select`/`tx.insert` per branch. Reuse the simulation-creation test scaffolding from Story 7.1.
- **Frontend (Vitest, jsdom):** mock `trpc.tournament.*` mutations and queries. Mock `useRouter` for redirect tests. Mirror `battles-voting-panel.spec.tsx` and `create-competition-form.spec.tsx` shape.
- **Coverage targets:**
  - Backend: 17 tests added (auth, Zod, mode/bound guards, happy paths, regression, idempotency, sim session pre-creation, battles flow, listSimulatedJudgeSessions, setSoloMode guard).
  - Frontend: 12 tests added across 3 panels.
- **No E2E in scope** — TEA-side workflow handles E2E if Story 7.3 needs full simulation acceptance.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L993-1017 — Story 7.2 ACs and FR mapping]
- [Source: `_bmad-output/planning-artifacts/epics.md` L73-77 — FR50-FR55 simulation requirements]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L36 — "simulation and live share identical code paths"]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L896 — `(admin)/[id]/simulation/` route slot]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L1119 — FR50-FR55 module mapping]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L62 — "Simulation as onboarding"]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L525 — "Simulation-to-live identity"]
- [Source: `_bmad-output/project-context.md` — 52 implementation rules]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:3015-3236` — existing `submitOrganizerScore`]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:3238-3466` — existing `submitOrganizerVote`]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1488-1669` — existing `startCypherPhase` (judge session round-robin)]
- [Source: `apps/web/src/components/admin/solo-scoring-panel.tsx` — pattern for cypher per-competitor scoring rows]
- [Source: `apps/web/src/components/admin/battles-voting-panel.tsx` — pattern for matchup voting cards]
- [Source: `packages/shared/validation/score.schema.ts:43-71` — existing `submitOrganizerScoreSchema`/`submitOrganizerVoteSchema`]
- [Source: `packages/db/schema/judge-sessions.ts` — `judge_sessions` table with `token_hash NOT NULL UNIQUE`]
- [Source: `packages/shared/errors/error-codes.ts` — error code conventions]
- [Source: `_bmad-output/implementation-artifacts/7-1-create-a-simulation-competition.md` — Story 7.1 spec + review findings]
- [Source: `_bmad-output/implementation-artifacts/4-4-solo-scoring-mode-and-phase-transition-control.md` — Story 4.4 (find-or-create pattern origin)]

### Open Questions for Implementation

1. **Battles judge session label format:** Dev Notes proposes `Sim Judge B-J{N}` (no group). Confirm during implementation that this doesn't collide with any existing label convention. If `cypherGroupCount` is `26` (Z) some day, the `B` could ambiguously read as "Group B". Mitigation: use `Sim Judge BAT-J{N}` for battles to avoid any collision risk. Defer the decision to Task 2 implementation — pick the unambiguous form.
2. **`listCompetitorsWithStatus` already returns `groupIndex`?** — verify before writing Task 9. If yes, Task 9 collapses to a no-op note in the PR description.
3. **Does battles voting need pre-creation too?** — Dev Notes argues lazy creation is fine for battles since no round-robin runs. Confirm during Task 4 review that no downstream code (e.g., a "judge participation" report) expects all battles judges to exist before any vote arrives.
4. **`SOLO_MODE_NOT_ENABLED` deprecation** — Task 5 keeps the code in the registry. If no other consumer references it after this story, a follow-up cleanup story can remove it. Don't bundle that into 7.2 (scope creep).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7

### Debug Log References

None — clean implementation. One web test required `nativeInputValueSetter` to fire React's controlled-component onChange (existing project pattern from `create-competition-form.spec.tsx`).

### Completion Notes List

- Task 1: Extended `submitOrganizerScoreSchema` with `simulatedGroupIndex` (int 0-25) and `simulatedJudgeIndex` (int 0-31). `submitOrganizerVoteSchema` got `simulatedJudgeIndex` only.
- Task 2: Created `apps/api/src/trpc/routers/helpers/resolve-organizer-judge-session.ts` — find-or-create helper supporting modes `'solo' | 'simulation-cypher' | 'simulation-battles'`. Cypher labels are `Sim Judge G{A-Z}-J{N}`; battles labels are `Sim Judge BAT-J{N}` (separate namespace per Open Question #1 to avoid GA/GB ambiguity).
- Task 3: Refactored `submitOrganizerScore`/`submitOrganizerVote` to call the helper. Lifted `!soloMode` guard to `!soloMode && !isSimulation`. New `ORGANIZER_SCORING_NOT_ENABLED` error code. Sim mode validates `simulatedGroupIndex < cypherGroupCount` and `simulatedJudgeIndex < cypherJudgeCount` (or `< battlesJudgeCount` for vote).
- Task 4: `startCypherPhase` now bypasses `INSUFFICIENT_JUDGE_LINKS` for simulations and pre-creates `cypherGroupCount × cypherJudgeCount` sim judge sessions before round-robin assignment, so the `competition.started` event payload is byte-identical to live competitions. Defensive guard in `setSoloMode` rejects toggling solo on a simulation competition.
- Task 5: Added `ORGANIZER_SCORING_NOT_ENABLED`, `SIMULATION_JUDGE_INDEX_OUT_OF_RANGE`, `SIMULATION_NOT_ENABLED` to `error-codes.ts`. Existing `SOLO_MODE_NOT_ENABLED` retained.
- Task 6: New `(admin)/[id]/simulation/page.tsx` route. `SimulationClient` gates by phase: draft → `StartCypherPhasePanel`; active pre-cypher-complete → `SimulationCypherPanel` + `CypherResultsPanel`; active post-cypher-complete → `SimulationBattlesPanel` + `BracketViewPanel`. Redirect-on-non-simulation uses `useEffect` (split-component pattern from Story 7.1 H1 fix).
- Task 6c: `SimulationCypherPanel` — group + judge dropdowns drive scoring. Uses `listSimulatedJudgeSessions` to derive "✓ Scored" indicator per (G, J) by joining with `listScoresForOverride.judgeSessionId`.
- Task 6d: `SimulationBattlesPanel` — judge dropdown only (battles voting is competition-wide, not group-scoped). Reuses existing `<JudgeVoteInput>` component.
- Task 7: New `OpenSimulationLink` component. Added to `competitions/[id]/page.tsx` header so simulations get a prominent CTA to the simulation control page.
- Task 8: New `listSimulatedJudgeSessions` tRPC procedure, returns sim sessions filtered by `label LIKE 'Sim Judge%'`.
- Task 9: Extended `listCompetitorsWithStatus` SELECT with `groupIndex` via LEFT JOIN with `competitorGroupAssignments`. Pre-cypher rows have `groupIndex: null`.
- Task 10: 20 new backend tests added (auth, Zod bounds, mode/judge bounds, happy path with sim session creation, session reuse, idempotent retry, sim battles bounds, `startCypherPhase` sim auto-creation, live INSUFFICIENT_JUDGE_LINKS regression, `listSimulatedJudgeSessions` flows, `setSoloMode` simulation guard). Two pre-existing tests updated to assert `ORGANIZER_SCORING_NOT_ENABLED` (replacing `SOLO_MODE_NOT_ENABLED`).
- Task 11: 14 new frontend tests across 3 specs (`simulation-client`, `simulation-cypher-panel`, `simulation-battles-panel`).
- Task 12: API typecheck ✓, API tests 333/333 ✓, API build ✓, web tests 181/181 ✓, web lint clean (only pre-existing warnings). Web typecheck shows the same pre-existing `(admin)/layout.tsx` Clerk-API errors waived in Story 7.1 — unchanged by this story.

### File List

**New files:**

- `apps/api/src/trpc/routers/helpers/resolve-organizer-judge-session.ts`
- `apps/web/src/app/(admin)/competitions/[id]/simulation/page.tsx`
- `apps/web/src/components/admin/simulation-client.tsx`
- `apps/web/src/components/admin/simulation-cypher-panel.tsx`
- `apps/web/src/components/admin/simulation-battles-panel.tsx`
- `apps/web/src/components/admin/open-simulation-link.tsx`
- `apps/web/src/components/admin/simulation-client.spec.tsx`
- `apps/web/src/components/admin/simulation-cypher-panel.spec.tsx`
- `apps/web/src/components/admin/simulation-battles-panel.spec.tsx`

**Modified files:**

- `packages/shared/validation/score.schema.ts`
- `packages/shared/errors/error-codes.ts`
- `apps/api/src/trpc/routers/tournament.router.ts`
- `apps/api/src/trpc/routers/tournament.router.spec.ts`
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Senior Developer Review (AI)

**Reviewer:** Claude Sonnet 4.6 on 2026-05-09  
**Outcome:** Changes Requested → Fixed inline

**Findings resolved:**

- **H1 (fixed):** `startCypherPhase` sim session insertion used `g`-outer / `j`-inner loop order, causing `roundRobinAssign` (which assigns `session[i] → group (i % groupCount)`) to scramble `groupIndex`. For 2 groups × 3 judges, sessions GA-J2 and GB-J2 ended up with swapped group assignments, corrupting standings bucketing and violating AC #2 and AC #5. Fixed by swapping to `j`-outer / `g`-inner loop so insertion order matches round-robin expectations. Test label-order expectation and groupIndex assertion updated accordingly.

- **M1 (fixed):** `setSoloMode` simulation guard used `ORGANIZER_SCORING_NOT_ENABLED` (wrong semantic: "scoring not enabled") instead of `SIMULATION_NOT_ENABLED` (correct: "operation incompatible with simulation competition type"). Error code and its test updated.

- **M2 (fixed):** Added missing spec test #9 — "distinct sessions per (G, J)": submitting as `(G0, J1)` creates a separate `Sim Judge GA-J2` session (not reusing the `(G0, J0)` session). Covers the find-or-create boundary between same-group judges.

- **M3 (fixed):** Added missing spec test #14 (battles happy path): first vote as `simulatedJudgeIndex: 1` creates `Sim Judge BAT-J2` session, inserts vote linked to it, calls `broadcastVoteSubmitted`. Verifies end-to-end wiring of simulation-battles mode.

**Final CI:** API 335/335 ✓, API typecheck ✓, Web 181/181 ✓

### Change Log

- 2026-05-09: Story 7.2 implemented — multi-judge organizer scoring/voting for simulations. Backend reuses `submitOrganizerScore`/`submitOrganizerVote` with a new `resolveOrganizerJudgeSession` helper that creates per-(group, judge) and per-judge sim sessions on demand. `startCypherPhase` pre-creates `cypherGroupCount × cypherJudgeCount` sim sessions so the live aggregation pipeline sees identical state shape (AC #5 satisfied). New `(admin)/[id]/simulation/` route with phase-aware client. 33 new tests (20 backend + 13 frontend).
- 2026-05-09: Code review fixes — H1 loop order bug in sim session pre-creation, M1 wrong error code in setSoloMode guard, M2 missing distinct-(G,J)-sessions test, M3 missing battles happy-path test. API tests now 335/335.
