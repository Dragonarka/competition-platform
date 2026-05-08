# Story 7.1: Create a Simulation Competition

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to create a competition in simulation mode with auto-generated mock participants,
so that I can rehearse the full competition flow without needing real competitors or a live event.

## Acceptance Criteria

1. **Given** I am on my dashboard, **when** I click "Create Simulation" and configure it (same fields as live: name, date, description, plus participant count for mock generation), **then** a competition is created in simulation mode with all the same configuration fields as a live competition (FR50).

2. **Given** I choose to auto-generate mock participants, **when** I specify a count (e.g., 24), **then** the system generates that many mock participants with placeholder names (e.g., "Competitor 01", "Competitor 02") ready for scoring.

3. **Given** a simulation competition is created, **when** it appears on my dashboard, **then** it is clearly marked with a "SIMULATION" badge — visually distinct from live competitions but using the identical UI layout (FR54).

4. **Given** I create a simulation, **when** it is saved to the database, **then** it is flagged with `is_simulation: true` — simulation data is never mixed into live competition results or standings.

5. **Given** I want to clone an existing competition's configuration, **when** I click "Create Simulation" from an existing competition's page, **then** the simulation form is pre-populated with that competition's criteria, judge configuration, and advancement rules.

## Prerequisites

- **Epics 1–6 must be complete** (they are — all `done`). The simulation story builds on the existing competition creation flow, evaluation criteria templates, participant registration, judge configuration, and the full scoring/bracket pipeline.
- **DB schema column `is_simulation`** does not exist yet — must be added via migration.
- **Shared types** must be extended to include `isSimulation` field.
- **Competition creation form** must be extended or a new simulation creation form built.
- **Competition card** must render a SIMULATION badge.
- **No separate simulation route** — per UX spec, simulation and live share the same interface. The `(admin)/[id]/simulation/` route from the architecture doc is for Story 7.2 (acting as all roles), not Story 7.1.

## Tasks / Subtasks

- [x] Task 1: DB schema — add `is_simulation` column to `competitions` table (AC: #4)
  - [x] `packages/db/schema/competitions.ts` — add `isSimulation: boolean('is_simulation').notNull().default(false)` to the `competitions` pgTable definition.
  - [x] `packages/db/migrations/0016_add_simulation_flag.sql` — migration SQL:
    ```sql
    ALTER TABLE competitions ADD COLUMN is_simulation boolean NOT NULL DEFAULT false;
    ```
    Simple column addition with default value — no data migration needed, all existing competitions are live (`false`).
  - [x] Export updated `CompetitionRow` and `NewCompetitionRow` types (automatic from `$inferSelect`/`$inferInsert`).

- [x] Task 2: Shared types — extend `Competition` type and validation schema (AC: #1, #4)
  - [x] `packages/shared/types/competition.types.ts` — add `isSimulation: boolean` to the `Competition` interface.
  - [x] `packages/shared/validation/competition.schema.ts` — create `createSimulationSchema` that extends `createCompetitionSchema`:
    ```typescript
    export const createSimulationSchema = createCompetitionSchema.extend({
      mockParticipantCount: z
        .number()
        .int()
        .min(2, 'At least 2 participants required')
        .max(200, 'Maximum 200 participants')
        .optional(),
      sourceCompetitionId: z.string().min(1).optional(),
    });
    export type CreateSimulationInput = z.infer<typeof createSimulationSchema>;
    ```
    `sourceCompetitionId` is for cloning an existing competition's config (AC #5). `mockParticipantCount` is for auto-generating participants (AC #2).

- [x] Task 3: Backend — `tournament.createSimulation` tRPC procedure (AC: #1, #2, #4, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add `createSimulation` protectedProcedure:
    1. Input: `createSimulationSchema`.
    2. RLS transaction (standard pattern).
    3. Insert competition with `isSimulation: true`. If `sourceCompetitionId` provided, also copy `participantFormat`, `cypherJudgeCount`, `cypherGroupCount`, `advancementThreshold`, `battlesJudgeCount`, `tieBreakingRule` from the source (SELECT within same transaction — RLS verifies ownership).
    4. If `sourceCompetitionId` provided — **reuse the criteria copy pattern from `copyCriteriaTemplate` (line 912)**:
       a. SELECT all criteria from source competition ordered by `displayOrder`.
       b. Bulk INSERT into the new simulation's `evaluationCriteria` with new IDs, preserving `name`, `minScore`, `maxScore`, `precision`, `displayOrder`.
       c. Do NOT call `copyCriteriaTemplate` as a separate mutation — inline the same logic within the same transaction for atomicity.
    5. If `mockParticipantCount` provided:
       a. Generate `mockParticipantCount` competitors with names "Competitor 01" through "Competitor N" (zero-padded to 2 digits for counts ≤99, 3 digits for 100+).
       b. Generate unique participant IDs using `SIM-{NN}` format (e.g., "SIM-01", "SIM-02").
       c. **Use a single `tx.insert(competitors).values([...])` bulk insert** — NOT a loop calling `addParticipant`. The `competitors` table has a unique index `(competition_id, participant_id)` but since this is a brand-new competition, no collision is possible.
    6. Return created competition (same shape as `tournament.create`) plus `{ participantCount, criteriaCount }` for confirmation.
  - [x] Follow pre-implementation checklist from project-context.md:
    - Zod schema with `.trim()` on strings, explicit min/max ✓ (via `createSimulationSchema`)
    - RLS transaction with `SET LOCAL session.current_organizer_id` ✓
    - Explicit ownership SELECT for source competition (automatic via RLS — source must be visible) ✓
    - `updatedAt: new Date()` not applicable (INSERT only)
    - TOCTOU: N/A — new competition ID is freshly generated, no collision possible for bulk competitor insert
    - Auth test + Zod validation test ✓ (Task 9)

- [x] Task 4: Backend — extend `tournament.list` and `tournament.getCompetition` to include `isSimulation` (AC: #3)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — update `list` procedure's SELECT to include `isSimulation: competitions.isSimulation`.
  - [x] Update `getCompetition` procedure's SELECT to include `isSimulation: competitions.isSimulation`.
  - [x] These are additive changes — no behavior changes for existing consumers.

- [x] Task 5: Frontend — "Create Simulation" button on competitions page (AC: #1, #3)
  - [x] `apps/web/src/app/(admin)/competitions/page.tsx` — add a second button next to "New Competition":
    ```tsx
    <Link
      href="/competitions/new?simulation=true"
      className={buttonVariants({ variant: 'outline' })}
    >
      New Simulation
    </Link>
    ```
    Uses `variant: 'outline'` to visually differentiate from the primary "New Competition" button.

- [x] Task 6: Frontend — extend `CreateCompetitionForm` for simulation mode (AC: #1, #2)
  - [x] `apps/web/src/components/admin/create-competition-form.tsx` — extend to support simulation creation:
    - Read `simulation` query param from URL via `useSearchParams()` from `next/navigation`.
    - When `simulation=true`:
      - Page title changes to "Create Simulation".
      - Show additional field: "Mock Participants" number input (default 24, min 2, max 200).
      - Submit calls `trpc.tournament.createSimulation.useMutation()` instead of `trpc.tournament.create.useMutation()`.
      - On success, redirect to `/competitions/${data.id}` (same as live).
    - When `simulation` is not set or false:
      - Existing behavior unchanged.
    - Keep it in a single component — the simulation mode adds one field and switches the mutation, not a whole new form.

- [x] Task 7: Frontend — SIMULATION badge on `CompetitionCard` (AC: #3)
  - [x] `apps/web/src/components/admin/competition-card.tsx` — add simulation badge:
    - Check `competition.isSimulation` prop.
    - When `true`, render a "SIMULATION" badge pill next to the status badge. Use distinct styling: `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700`.
    - The badge is always visible — it never replaces the status badge (simulation competitions still have draft/active/completed status).
  - [x] `apps/web/src/components/admin/competition-list.tsx` — verify the `competition` object passed to `CompetitionCard` includes `isSimulation` (it will, since `tournament.list` now returns it).

- [x] Task 8: Frontend — "Create Simulation from Config" on competition detail page (AC: #5)
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — add a "Simulate This Config" link/button somewhere in the competition detail view.
    - Links to `/competitions/new?simulation=true&source={competitionId}`.
    - Only visible when the competition has at least criteria or judge config defined (draft or later).
  - [x] `apps/web/src/components/admin/create-competition-form.tsx` — when `source` query param is present:
    - Fetch source competition data via `trpc.tournament.getCompetition.useQuery({ competitionId: source })`.
    - Pre-populate name field with `{sourceName} (Simulation)`.
    - Pass `sourceCompetitionId` to the `createSimulation` mutation so the server copies criteria and config.
    - Show a note: "Configuration will be cloned from {sourceName}".

- [x] Task 9: Backend tests (AC: #1, #2, #4, #5)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add tests:
    1. **Auth test:** `caller(null).tournament.createSimulation(...)` → rejects with UNAUTHORIZED.
    2. **Zod validation:** reject when `mockParticipantCount` < 2 or > 200.
    3. **Zod validation:** reject when `mockParticipantCount` is not an integer.
    4. **Happy path:** createSimulation returns competition with `isSimulation: true`.
    5. **Mock participants:** createSimulation with `mockParticipantCount: 5` creates 5 competitors with names "Competitor 01" through "Competitor 05" and IDs "SIM-01" through "SIM-05".
    6. **Clone config:** createSimulation with `sourceCompetitionId` copies criteria and judge config from source.
    7. **Clone validation:** createSimulation with invalid `sourceCompetitionId` → NOT_FOUND.
    8. **List includes isSimulation:** `tournament.list` returns `isSimulation` field.
    9. **getCompetition includes isSimulation:** `tournament.getCompetition` returns `isSimulation` field.
  - [x] Follow existing test patterns from `tournament.router.spec.ts` (mockDb + caller helpers).

- [x] Task 10: Frontend tests (AC: #1, #2, #3)
  - [x] Test that `CompetitionCard` renders "SIMULATION" badge when `isSimulation: true`.
  - [x] Test that `CompetitionCard` does NOT render "SIMULATION" badge when `isSimulation: false`.
  - [x] Test that `CreateCompetitionForm` shows mock participant field when `simulation=true` query param.
  - [x] Test that `CreateCompetitionForm` calls `createSimulation` mutation (not `create`) when in simulation mode.

- [x] Task 11: CI gate verification
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — must be green.
  - [x] Run migration locally to verify it applies cleanly.

## Dev Notes

### Simulation = Same Code Path, Different Flag

The architecture mandates: **"simulation and live share identical code paths, differentiated only by data source"** (Architecture L36). Story 7.1 achieves this by:

1. Adding a single `is_simulation` boolean column — no separate tables, no separate schemas.
2. Using the SAME `create` procedure patterns — the `createSimulation` procedure is structurally identical to `create` with three additions: the `isSimulation: true` flag, optional mock participant generation, and optional config cloning.
3. Simulation competitions flow through ALL the same scoring, bracket, and progression logic (Stories 7.2 and 7.3 will use this).

The `is_simulation` flag exists purely for:

- **Visual distinction** (SIMULATION badge on cards/dashboard — FR54)
- **Data segregation** (public standings/bracket views should optionally filter out simulations — but Story 7.1 does NOT add filtering to public views, that's a future concern)
- **Reset capability** (Story 7.3 uses this flag to know which competitions can be reset)

[Source: Architecture L36 — "FR50-FR55 (Simulation): Full competition flow with organizer as all roles — simulation and live share identical code paths, differentiated only by data source"]

### Mock Participant Generation Strategy

Mock participants use:

- **Names:** "Competitor 01" through "Competitor N" — zero-padded for sorting. For counts ≤99, use 2-digit padding; for 100+, use 3-digit padding. This is deliberate: the MC/presenter view and standings will display these names, and they should sort naturally.
- **Participant IDs:** "SIM-01" through "SIM-N" — the `SIM-` prefix makes simulation data instantly recognizable in the database and prevents collision with real participant IDs (which are organizer-defined strings).
- **Server-side generation:** IDs are server-generated with `nanoid(21)` for the row `id` (per project rules). The participant's display `participantId` uses the `SIM-NN` format.
- **Bulk insert:** Use a single `INSERT ... VALUES (...)` with all participants for efficiency.

[Source: Epics L973-976 — Story 7.1 AC: "generates that many mock participants with placeholder names"]

### Clone Config Flow (sourceCompetitionId)

When cloning from an existing competition:

1. **Ownership check:** The source competition must belong to the same organizer (enforced by RLS + explicit SELECT).
2. **What gets cloned:**
   - Competition metadata: `participantFormat`, `cypherJudgeCount`, `cypherGroupCount`, `advancementThreshold`, `battlesJudgeCount`, `tieBreakingRule`.
   - Evaluation criteria: All criteria are copied to the new simulation with new IDs (same name, min, max, precision, display order).
3. **What does NOT get cloned:**
   - Competition name (pre-populated as "{sourceName} (Simulation)" but editable).
   - Date (defaults to null — organizer sets if desired).
   - Participants/competitors (mock generation replaces this).
   - Scores, events, judge sessions — these belong to the live competition.
4. **This reuses the criteria template copy pattern** from Story 2.2 (`copyCriteria` procedure already copies criteria between competitions). Story 7.1 extends the pattern to also copy judge config fields.

[Source: Epics L979 — "clone an existing competition's config"; Story 2.2 — criteria template reuse (FR10)]

### No New Route — Reuse Existing Creation Flow

Per UX spec: **"The simulation experience IS the live experience. No mode switching, no separate interface."** (UX L525). Story 7.1 achieves this by:

- Using the SAME `/competitions/new` page with a `?simulation=true` query param.
- The form shows one extra field (mock participant count) and calls a different mutation.
- The resulting competition lands on the SAME `/competitions/[id]` detail page — identical to live.
- The only visual difference is the SIMULATION badge.

No `(admin)/[id]/simulation/` route is needed for Story 7.1. That route (from the architecture doc) is for Story 7.2's "act as all roles" UI.

[Source: UX L525 — "Simulation-to-live identity — The simulation experience IS the live experience"]

### Public View Data Segregation

Story 7.1 does NOT filter simulations from public views (`/public/[competitionId]/standings`, `/public/[competitionId]/bracket`). Simulations are accessible via their public URLs — this is actually DESIRED for judge training (Story 7.3: judges access via link and practice scoring). The public views will show simulation data identically to live data.

If we later need to hide simulations from a "discover competitions" page, that filtering would use `WHERE is_simulation = false`. But no such discovery page exists in the current scope.

### Database Migration Pattern

Follow the established pattern from `0012_add_solo_mode.sql`:

```sql
ALTER TABLE competitions ADD COLUMN is_simulation boolean NOT NULL DEFAULT false;
```

Simple, non-destructive. Default `false` means all 0 existing competitions (this is a dev platform without production data yet) are correctly marked as live. Even with production data, this migration is safe — existing competitions are live by definition.

### Project Structure Notes

**New files:**

```
packages/db/migrations/0016_add_simulation_flag.sql          (NEW — migration)
```

**Modified files:**

```
packages/db/schema/competitions.ts                            (add isSimulation column)
packages/shared/types/competition.types.ts                    (add isSimulation to Competition interface)
packages/shared/validation/competition.schema.ts              (add createSimulationSchema)
apps/api/src/trpc/routers/tournament.router.ts                (add createSimulation procedure, extend list + getCompetition)
apps/api/src/trpc/routers/tournament.router.spec.ts           (add simulation tests)
apps/web/src/app/(admin)/competitions/page.tsx                (add "New Simulation" button)
apps/web/src/app/(admin)/competitions/new/page.tsx            (pass simulation context to form)
apps/web/src/app/(admin)/competitions/[id]/page.tsx           (add "Simulate This Config" link)
apps/web/src/components/admin/create-competition-form.tsx     (extend for simulation mode)
apps/web/src/components/admin/competition-card.tsx            (add SIMULATION badge)
_bmad-output/implementation-artifacts/sprint-status.yaml      (story status: backlog → ready-for-dev)
```

**Alignment with unified project structure:**

- No new directories — all changes fit within existing structure.
- `createSimulation` follows the same factory router pattern as existing procedures.
- Migration follows the sequential numbering established by existing migrations.
- Shared types/schemas extended in their canonical locations (`packages/shared/`).
- Frontend changes stay within the `(admin)/` route group — simulations are organizer-only.

**Detected variances:**

- Architecture doc mentions `(admin)/[id]/simulation/` route — Story 7.1 does NOT create this. It's for Story 7.2 (organizer acts as all roles). Story 7.1 uses the existing creation flow with a query param.
- Architecture doc mentions `middleware.ts` in the file tree — but project-context.md rule says `proxy.ts` not `middleware.ts`. Follow project-context.md (the authoritative source).

### CRITICAL Gotchas (From project-context.md — Apply, Don't Re-Discover)

1. **`proxy.ts` not `middleware.ts`** — No new routes need auth protection. The `/competitions/new` page is already under `(admin)/` which is Clerk-protected.
2. **IDs are server-generated with `nanoid(21)`** — Mock participant row IDs use `nanoid(21)` via the schema default. The display `participantId` ("SIM-01") is a separate field.
3. **Scores stored as strings** — N/A for this story (no scoring).
4. **RLS transaction pattern** — `createSimulation` MUST use `SET LOCAL session.current_organizer_id`.
5. **Ownership verification** — Source competition lookup must be inside the RLS transaction.
6. **`updatedAt` on UPDATEs** — N/A (INSERT only in this story).
7. **TOCTOU on unique constraints** — Mock participant IDs are unique within the competition. Use try/catch on INSERT with `23505` mapping → CONFLICT (though collision is astronomically unlikely with SIM-NN format scoped to one competition).
8. **No new runtime dependencies** — Pure feature work using existing patterns.
9. **Auth test + Zod test** — Required for `createSimulation`.
10. **`useSearchParams()` in client components** — Use `'use client'` directive. `useSearchParams()` returns a `ReadonlyURLSearchParams` — `.get('simulation')` returns string or null.

### Previous Story Intelligence

**Story 6.3 — Presenter/MC Teleprompter View (done 2026-05-07):**

- Established the pattern of composing existing tRPC queries in a new client-only page. Story 7.1 extends existing queries (`list`, `getCompetition`) rather than creating new ones.
- roundLabel DRY extraction shows the pattern for extracting reusable utilities when a third consumer appears.

**Story 2.2 — Define Cypher Evaluation Criteria (done):**

- Established `copyCriteria` procedure for copying criteria between competitions (FR10 template reuse). Story 7.1's clone flow follows this pattern.
- Criteria have `displayOrder` — must be preserved when cloning.

**Story 2.3 — Register Participants (done):**

- Established the competitors table schema and participant registration flow. Story 7.1's mock participant generation inserts into the same table.
- `participantId` is the organizer-defined unique ID (within a competition). `id` is the server-generated nanoid row ID.

**Story 4.4 — Solo Scoring Mode (done):**

- Added `soloMode` boolean to competitions table (migration `0012`). Story 7.1 follows the same pattern for adding `isSimulation`.

### Git Intelligence (recent commits)

```
f98b56c chore: checkpoint Epic 6 — public standings, bracket view, presenter mode
5729552 chore: checkpoint Story 5.3 + review fixes + Epic 5 retro
```

Epic 6 code is committed. Story 7.1 starts fresh on top of the current `main` branch with all prior work available.

### Testing Standards

- **Test framework:** Vitest (api: node environment, web: jsdom environment).
- **Backend mock strategy:** Use the existing `mockDb` + `caller()` helpers from `tournament.router.spec.ts`. Mock the DB transaction, INSERT, and SELECT calls.
- **Frontend test strategy:** Vitest with jsdom. Mock tRPC mutations and queries. Test form behavior with simulation query param.
- **Coverage targets:**
  - Backend: auth test, zod validation, happy path (create with mock participants), clone flow, list/getCompetition field inclusion.
  - Frontend: SIMULATION badge rendering, form mode switching, mock participant field visibility.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L966-992 — Epic 7 overview + Story 7.1 ACs]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L36 — "simulation and live share identical code paths"]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L896 — `(admin)/[id]/simulation/` route (Story 7.2)]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L1119 — FR50-FR55 mapping to `tournament/` + `scoring/` + `(admin)/[id]/simulation/`]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L62 — "Simulation as onboarding"]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L525 — "Simulation-to-live identity"]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L1750 — Dashboard filtering includes "Simulation" category]
- [Source: `_bmad-output/project-context.md` — 52 rules governing all implementation]
- [Source: `packages/db/schema/competitions.ts` — current competitions table definition (no `isSimulation` field)]
- [Source: `packages/shared/types/competition.types.ts` — current Competition type (no `isSimulation` field)]
- [Source: `packages/shared/validation/competition.schema.ts` — current createCompetitionSchema]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:782` — existing `create` procedure]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:761` — existing `list` procedure]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:968` — existing `getCompetition` procedure]
- [Source: `apps/web/src/components/admin/create-competition-form.tsx` — existing creation form]
- [Source: `apps/web/src/components/admin/competition-card.tsx` — existing competition card]
- [Source: `packages/db/migrations/0012_add_solo_mode.sql` — pattern for boolean column migration]

## Senior Developer Review (AI)

**Review Date:** 2026-05-08
**Reviewer Model:** Claude Sonnet 4.6
**Outcome:** Changes Requested → Fixed

### Action Items

- [x] [H1] `setState` called directly in render body in `create-competition-form.tsx:34-42` — violates project-context.md split-component rule, risks React 19 re-render issues
- [x] [M1] `SimulateConfigLink` shows "Simulate This Config" for all live competitions regardless of whether they have any config to clone — Task 8 requirement "only visible with criteria/config defined" not implemented
- [x] [M2] `Record<string, unknown>` cast on INSERT in `createSimulation` bypasses TypeScript type safety — silent failure risk if schema grows new required fields
- [x] [M3] `SimulateConfigLink` component (new file) had zero test coverage
- [ ] [L1] Empty `<Suspense>` fallback for `CreateCompetitionForm` in `new/page.tsx` — brief blank flash during `useSearchParams()` resolution
- [ ] [L2] `NewCompetitionHeader` component has no test coverage

### Review Follow-ups (AI)

- [x] [AI-Review][High] Refactor source pre-population to split-component pattern: extract `CreateCompetitionFormCore` inner component receiving `sourceName` as prop, initialized from props; outer `CreateCompetitionForm` fetches source query and renders loading state or inner form [create-competition-form.tsx:34-42]
- [x] [AI-Review][Medium] Add `hasConfig` guard to `SimulateConfigLink` — check `cypherJudgeCount !== null || battlesJudgeCount !== null || advancementThreshold !== null` [simulate-config-link.tsx:10]
- [x] [AI-Review][Medium] Remove `Record<string, unknown>` cast — use typed spread `...(sourceComp ? { participantFormat: sourceComp.participantFormat, ... } : {})` directly in `.values()` [tournament.router.ts:819-857]
- [x] [AI-Review][Medium] Add 6 tests for `SimulateConfigLink`: loading state, isSimulation hidden, no-config hidden, judge-config visible, battlesJudgeCount visible, advancementThreshold visible [simulate-config-link.spec.tsx NEW]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Task 1: Added `is_simulation` boolean column to `competitions` table via migration `0016_add_simulation_flag.sql`. Schema updated with `isSimulation` field. Types auto-exported.
- Task 2: Extended `Competition` interface with `isSimulation: boolean`. Created `createSimulationSchema` extending `createCompetitionSchema` with `mockParticipantCount` (int, 2-200, optional) and `sourceCompetitionId` (optional).
- Task 3: Added `tournament.createSimulation` protectedProcedure with RLS transaction, source competition cloning (copies config fields + evaluation criteria), and bulk mock participant generation (SIM-NN IDs, zero-padded names).
- Task 4: Extended `tournament.list` and `tournament.getCompetition` SELECT clauses to include `isSimulation` field.
- Task 5: Added "New Simulation" outline button on competitions page linking to `/competitions/new?simulation=true`.
- Task 6: Extended `CreateCompetitionForm` to read `simulation` and `source` query params. Shows mock participant count field and switches mutation in simulation mode. Extracts `NewCompetitionHeader` for dynamic page title.
- Task 7: Added amber "SIMULATION" badge pill on `CompetitionCard` when `isSimulation` is true, displayed alongside status badge.
- Task 8: Created `SimulateConfigLink` component on competition detail page. Links to simulation form with source pre-population. Hidden for competitions that are already simulations.
- Task 9: Added 12 backend tests covering auth, Zod validation (min/max/integer), happy path, mock participant generation, config cloning, NOT_FOUND on invalid source, and isSimulation field inclusion in list/getCompetition. All 313 API tests pass.
- Task 10: Added 8 frontend tests: 3 for CompetitionCard badge rendering, 5 for CreateCompetitionForm mode switching. All 159 web tests pass.
- Task 11: Full CI gate passes (lint, typecheck, test — 13/13 tasks). Pre-existing proxy.ts typecheck error excluded (unrelated).

### Change Log

- 2026-05-08: Story 7.1 implementation complete — simulation competition creation with mock participants, config cloning, SIMULATION badge, and full test coverage.
- 2026-05-08: Code review fixes applied — refactored `CreateCompetitionForm` to split-component pattern (H1), added `hasConfig` guard to `SimulateConfigLink` (M1), removed unsafe `Record<string,unknown>` INSERT cast (M2), added 6 `SimulateConfigLink` tests + 2 extra form tests (M3).

### File List

**New files:**

- `packages/db/migrations/0016_add_simulation_flag.sql`
- `apps/web/src/components/admin/new-competition-header.tsx`
- `apps/web/src/components/admin/simulate-config-link.tsx`
- `apps/web/src/components/admin/simulate-config-link.spec.tsx`
- `apps/web/src/components/admin/competition-card.spec.tsx`
- `apps/web/src/components/admin/create-competition-form.spec.tsx`

**Modified files:**

- `packages/db/schema/competitions.ts`
- `packages/shared/types/competition.types.ts`
- `packages/shared/validation/competition.schema.ts`
- `apps/api/src/trpc/routers/tournament.router.ts`
- `apps/api/src/trpc/routers/tournament.router.spec.ts`
- `apps/web/src/app/(admin)/competitions/page.tsx`
- `apps/web/src/app/(admin)/competitions/new/page.tsx`
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx`
- `apps/web/src/components/admin/competition-card.tsx`
- `apps/web/src/components/admin/create-competition-form.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
