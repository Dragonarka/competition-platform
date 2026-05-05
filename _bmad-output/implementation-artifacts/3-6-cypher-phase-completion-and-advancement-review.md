# Story 3.6: Cypher Phase Completion & Advancement Review

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to review the final Cypher standings and confirm which participants advance to Battles,
so that I have visibility and control before the competition moves to the elimination phase.

## Acceptance Criteria

1. Given all judges have submitted scores for all their assigned participants, when I view the Cypher results screen, then I see all participants ranked by their final aggregated score with a clear top-N highlight showing who advances (FR16, FR17, FR19).

2. Given the participant format is "pairs" and partner rotation is configured, when scores are aggregated, then each individual's score is calculated independently across all partners they were evaluated with (FR18). [Implementation note: existing `aggregateCompetitorScores` already aggregates per `competitorId` regardless of judge or partner — this AC is a regression-test obligation, not new code.]

3. Given I am reviewing Cypher results, when I am satisfied with the standings, then I click "Confirm Advancement" and the top N participants are locked in for the Battles bracket.

4. Given I confirm advancement, when the transition is triggered, then a `phase.transitioned` domain event is emitted to the event store recording: from phase, to phase, advanced competitor IDs, trigger type ("admin_confirmed").

5. Given confirmation has already happened, when the organizer clicks Confirm Advancement again, then the mutation is idempotent — no duplicate event is emitted, no second `cypher_completed_at` write, and the same advanced-competitor list is returned.

6. Given a competition has fewer participants than the configured `advancementThreshold`, when the organizer confirms, then advancement promotes ALL remaining ranked participants (cap top-N at the actual standings length — never throw on under-population).

## Tasks / Subtasks

- [x] Task 1: DB schema — add `cypher_completed_at` timestamp column (AC: #3, #4, #5)
  - [x] `packages/db/schema/competitions.ts` — added `cypherCompletedAt: timestamp('cypher_completed_at', { withTimezone: true })` (nullable, no default).
  - [x] `packages/db/migrations/0010_add_cypher_completed_at.sql` (new) — `ALTER TABLE competitions ADD COLUMN cypher_completed_at TIMESTAMPTZ;`
  - [x] No RLS change needed (column inherits competition-row RLS policy).

- [x] Task 2: Define event payload + socket event (AC: #4)
  - [x] `packages/shared/events/tournament-events.ts` — add:
    ```ts
    export interface PhaseTransitionedPayload {
      competitionId: string;
      fromPhase: 'cypher';
      toPhase: 'battles';
      advancedCompetitorIds: string[];
      triggerType: 'admin_confirmed';
      transitionedAt: string; // ISO 8601
    }
    ```
  - [x] `packages/shared/events/socket-event-map.ts` — add `'phase.transitioned': (data: PhaseTransitionedPayload) => void;` to `ServerToClientEvents`.
  - [x] `packages/shared/index.ts` — re-export `PhaseTransitionedPayload`.

- [x] Task 3: Add validation schema + error codes (AC: #3, #4, #5, #6)
  - [x] `packages/shared/validation/competition.schema.ts` — add:
    ```ts
    export const completeCypherPhaseSchema = z.object({
      competitionId: z.string().min(1),
    });
    export type CompleteCypherPhaseInput = z.infer<typeof completeCypherPhaseSchema>;
    ```
    Re-export from `packages/shared/index.ts`.
  - [x] `packages/shared/errors/error-codes.ts` — add:
    - `CYPHER_NOT_ACTIVE: 'CYPHER_NOT_ACTIVE'` (status not `'active'`)
    - `CYPHER_ALREADY_COMPLETED: 'CYPHER_ALREADY_COMPLETED'` (idempotency conflict — only thrown if a future variant wants strict failure; default mutation returns existing state)
    - `ADVANCEMENT_THRESHOLD_NOT_SET: 'ADVANCEMENT_THRESHOLD_NOT_SET'`

- [x] Task 4: WebSocket gateway — `broadcastPhaseTransitioned` (AC: #4)
  - [x] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add to interface:
    ```ts
    broadcastPhaseTransitioned(competitionId: string, payload: PhaseTransitionedPayload): void;
    ```
  - [x] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — implement: emit to admin AND public rooms (organizer dashboard + spectator standings page both want to know cypher is locked).

- [x] Task 5: Implement `completeCypherPhase` mutation (AC: #1, #3, #4, #5, #6)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add `protectedProcedure` mutation:
    1. RLS transaction (`SET LOCAL session.current_organizer_id`).
    2. Load `{ id, status, advancementThreshold, cypherCompletedAt }` for the competition. Throw `NOT_FOUND` if zero rows (RLS).
    3. **Idempotency**: if `cypherCompletedAt !== null`, look up the existing `phase.transitioned` event for this competition (`aggregateId = competitionId AND aggregateType = 'competition' AND type = 'phase.transitioned'`), return its `advancedCompetitorIds` + standings without writing new state. Do NOT throw.
    4. Validate `status === 'active'` (else `BAD_REQUEST` with `CYPHER_NOT_ACTIVE`).
    5. Validate `advancementThreshold !== null && advancementThreshold > 0` (else `BAD_REQUEST` with `ADVANCEMENT_THRESHOLD_NOT_SET`).
    6. Reuse existing `computeStandings` helper (do NOT duplicate logic) — load score rows joined with competitors, call helper.
    7. Compute `advancedCount = Math.min(advancementThreshold, standings.length)` (AC #6 — never overflow).
    8. `advancedCompetitorIds = standings.slice(0, advancedCount).map(s => s.competitorId)`.
    9. UPDATE `competitions` set `cypherCompletedAt = NOW()` AND `updatedAt = NOW()` where `id = input.competitionId`. (Status remains `'active'`; Battles phase will own the next status transition in Epic 5.)
    10. Determine next event sequence: `SELECT max(sequence) FROM events WHERE aggregate_id = $1 AND aggregate_type = 'competition'` then `+1`.
    11. INSERT into `events`: type=`'phase.transitioned'`, payload as `PhaseTransitionedPayload`, sequence, createdBy=ctx.userId.
    12. Call `gateway.broadcastPhaseTransitioned(competitionId, payload)` INSIDE the transaction (matches existing gotcha pattern from `startCypherPhase`).
    13. Return `{ advancedCompetitorIds, advancedCount, totalParticipants: standings.length, finalStandings: standings, idempotent: false }`.

- [x] Task 6: Extend `getCompetition` to expose `cypherCompletedAt` (AC: #1, #3, #5)
  - [x] Add `cypherCompletedAt: competitions.cypherCompletedAt` to the SELECT in `getCompetition`. The frontend uses this to switch between "Confirm" and "Locked" UI states.

- [x] Task 7: Frontend — Cypher Results Panel (AC: #1, #3, #5, #6)
  - [x] `apps/web/src/components/admin/cypher-results-panel.tsx` (new client component):
    - Props: `{ competitionId: string }`
    - Queries: `trpc.tournament.getCompetition.useQuery({ competitionId })`, `trpc.tournament.getStandings.useQuery({ competitionId })`
    - Renders only when `competition.status === 'active'`. Hide otherwise (parent renders the right panel based on status).
    - Renders standings table mirroring `apps/web/src/app/(public)/[competitionId]/standings/page.tsx` style (rank, name, participantId, total, judgeCount).
    - **Top-N highlight**: rows where `rank <= advancementThreshold` get `bg-green-50 dark:bg-green-950/20` + an `Advances ✓` badge. Rows beyond get default styling.
    - Header shows: `"Top {advancementThreshold} of {standings.length} advance"` (or `"All {standings.length} advance"` when standings.length ≤ threshold per AC #6).
    - Confirm button:
      - State A (`cypherCompletedAt === null`): primary "Confirm Advancement" button. Click opens an inline confirmation card (NOT a modal — match the existing `start-cypher-phase-panel` pattern of inline confirm) with text: `"Lock the top N competitors for Battles? This cannot be undone via this UI."` and a destructive-style "Yes, confirm advancement" + "Cancel" pair.
      - State B (`cypherCompletedAt !== null`): green success banner: `"Advancement locked at {timestamp}. {N} competitors advance to Battles."` Plus a disabled "Confirm Advancement" button with a checkmark icon.
    - Mutation: `trpc.tournament.completeCypherPhase.useMutation({ onSuccess: () => { utils.tournament.getCompetition.invalidate({ competitionId }); utils.tournament.getStandings.invalidate({ competitionId }); }, onError: setError })`.
  - [x] WebSocket subscription: extend `usePublicSocket` (or reuse pattern) to listen for `phase.transitioned` and invalidate getCompetition + getStandings. (See Task 8 for socket integration details.)

- [x] Task 8: Wire Cypher Results into competition detail page (AC: #1)
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — render `<CypherResultsPanel competitionId={id} />` ABOVE the existing `<StartCypherPhasePanel />` (the start panel will hide itself when status !== 'draft' anyway, but ordering puts results first when active).
  - [x] Pre-flight check: when `competition.status === 'active'` AND `cypherCompletedAt === null`, also display a soft warning if not all judge-competitor pairings have a score yet — derived from `assignments.length * groups - submittedScoresForActiveAssignments`. For MVP, the warning is text-only (e.g., `"Note: 3 expected scores still pending. You can confirm anyway."`); the button is NOT disabled.

- [x] Task 9: Connection-resilience for the new socket event (AC: #4 — completeness)
  - [x] Existing `usePublicSocket` hook already exists. Either extend it with an `onPhaseTransitioned` callback prop (preferred — same pattern as `onStandingsUpdated`) OR introduce a new admin-side hook later in Epic 4. For Story 3.6 scope: add `onPhaseTransitioned?: (payload: PhaseTransitionedPayload) => void` to `usePublicSocket`'s options and consume it in `cypher-results-panel.tsx`.

- [x] Task 10: Tests (AC: #1, #2, #4, #5, #6)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add at minimum:
    - **Auth test**: `caller(null).tournament.completeCypherPhase({ competitionId: 'x' })` → rejects with `UNAUTHORIZED`.
    - **Zod validation**: empty `competitionId` rejects with `BAD_REQUEST`.
    - **Status guard**: competition with `status='draft'` rejects with `CYPHER_NOT_ACTIVE`.
    - **Threshold guard**: competition with `advancementThreshold=null` rejects with `ADVANCEMENT_THRESHOLD_NOT_SET`.
    - **Happy path**: 5 competitors, threshold=3 → returns top-3, emits `phase.transitioned` event with `advancedCompetitorIds.length === 3`, sets `cypherCompletedAt`.
    - **Under-population (AC #6)**: 2 competitors, threshold=3 → returns all 2, emits event with 2 IDs, no error.
    - **Idempotency (AC #5)**: call mutation twice → second call returns same `advancedCompetitorIds` with `idempotent: true` (or equivalent), only one `phase.transitioned` event in `events` table.
    - **Pairs aggregation regression (AC #2)**: seed two pairs (4 competitors), submit scores from multiple judge sessions across the 4 individuals (simulating partner rotation), call `completeCypherPhase`, assert each individual's `totalScore` reflects ALL their submitted scores summed — independent of who their partner was.
    - **Event sequence**: `phase.transitioned` event has `sequence = max(existing) + 1`.
    - **Broadcast**: gateway mock asserts `broadcastPhaseTransitioned` called once with the correct payload.
  - [x] Frontend test (optional given limited test infra): if time permits, add a Vitest+JSDOM render test of `cypher-results-panel.tsx` verifying top-N highlight class is applied to the right rows. If not, defer to manual verification.

- [x] Task 11: CI verification — `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — 13/13 tasks pass.

## Dev Notes

### Architecture Decision: `cypher_completed_at` timestamp column (not enum)

The competitions table already has a `competition_status` enum: `'draft' | 'active' | 'completed' | 'archived'`. Three options were considered for representing the "cypher locked" state:

1. **Add `'cypher-completed'` enum value** — clean status-driven UI, but requires `ALTER TYPE ADD VALUE` migration which cannot run inside a transaction in PostgreSQL (forces a separate ad-hoc migration step). Also commits us to enum proliferation as Battles/Final phases land.
2. **Use event log only** — `SELECT 1 FROM events WHERE type = 'phase.transitioned' AND aggregate_id = $1`. No schema change. Slightly more expensive at read time and complicates idempotency logic.
3. **Add `cypher_completed_at` timestamp column** — single nullable column, plain `ALTER TABLE`, transaction-safe migration, carries the WHEN audit value, easy idempotency check (`if (cypherCompletedAt !== null) ...`). Status remains `'active'` until Battles phase explicitly transitions it in Epic 5.

**Decision: Option 3 (timestamp column).** Smallest, safest schema change. Aligns with Story 3.5's principle of "minimum schema for the AC".

[Source: existing schema `packages/db/schema/competitions.ts`; PostgreSQL ALTER TYPE limitation re transactions.]

### Idempotency Pattern

Story 3.5 established the client-key-based idempotency pattern for score submissions. Story 3.6 uses a **server-state-based** idempotency check (no client key needed for an admin-confirm action):

```ts
if (existing.cypherCompletedAt !== null) {
  const [priorEvent] = await tx.select(...).from(events)
    .where(and(
      eq(events.aggregateId, input.competitionId),
      eq(events.aggregateType, 'competition'),
      eq(events.type, 'phase.transitioned'),
    ))
    .orderBy(desc(events.sequence))
    .limit(1);
  // Return prior payload, do NOT emit new event
  return { advancedCompetitorIds, ..., idempotent: true };
}
```

This is essential because:

- Double-clicks of "Confirm Advancement" must not double-emit the event (NFR11: append-only events table is the source of truth — duplicate events would corrupt replay).
- The user might refresh the page and re-confirm without realizing the prior call succeeded.
- Tests for AC #5 explicitly assert no duplicate event row exists.

### Score Aggregation for Pairs (AC #2)

Reading the existing implementation in `packages/formats/cypher-battles/src/scoring/aggregation.ts`:

```ts
export function aggregateCompetitorScores(payloads: ScorePayload[]): AggregatedResult {
  // ... groups by judgeId, aggregates total per competitor
}
```

The aggregation is keyed entirely by `competitorId`. For the **pairs** participant format:

- Each individual is a separate `competitors` row (the schema models individuals, not pairs).
- A "pair" is just a relationship between two competitors who happened to perform together in a round (modelled later via judge-group assignments + round metadata).
- Partner rotation means: across rounds 1, 2, 3 a single individual performs with different partners.
- Each judge submits a score for **the individual** (not the pair) for each round they observe them.
- The aggregation already correctly sums all of an individual's scores across all judges and all rounds, regardless of which partner they had.

**Therefore: AC #2 requires NO new aggregation code.** It requires a regression test that proves the existing aggregation handles pairs correctly. The test seeds 4 competitors (2 pairs), simulates partner rotation by attributing scores to varied judge sessions, and verifies each individual's total reflects all their scores.

[Source: `packages/formats/cypher-battles/src/scoring/aggregation.ts`; `packages/db/schema/competitors.ts`; epics.md FR18.]

### Event Store Pattern (Reused from Story 3.2)

Mirror the `startCypherPhase` event-emit pattern exactly:

```ts
// 1. Determine next sequence
const [seqRow] = await tx
  .select({ maxSeq: max(events.sequence) })
  .from(events)
  .where(and(eq(events.aggregateId, input.competitionId), eq(events.aggregateType, 'competition')));
const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

// 2. Emit
const payload: PhaseTransitionedPayload = {
  competitionId: input.competitionId,
  fromPhase: 'cypher',
  toPhase: 'battles',
  advancedCompetitorIds,
  triggerType: 'admin_confirmed',
  transitionedAt: new Date().toISOString(),
};
await tx.insert(events).values({
  type: 'phase.transitioned',
  aggregateId: input.competitionId,
  aggregateType: 'competition',
  payload: payload as unknown as Record<string, unknown>,
  sequence: nextSeq,
  createdBy: ctx.userId,
});

// 3. Broadcast
gateway.broadcastPhaseTransitioned(input.competitionId, payload);
```

**Sequence uniqueness** is enforced by `uq_events_aggregate_sequence` (see `packages/db/schema/events.ts`). Concurrent confirmations would both attempt `nextSeq`; the second insert would fail with `23505`. Wrap the INSERT in try/catch and on duplicate, re-read the now-existing `phase.transitioned` event and return its payload (idempotency-by-conflict). This is the same TOCTOU pattern documented in `project-context.md`.

[Source: `apps/api/src/trpc/routers/tournament.router.ts:828-865` — startCypherPhase event-emit reference.]

### Frontend Pattern: Confirmation UX

The existing `start-cypher-phase-panel.tsx` uses a single primary button with no confirmation step. For "Confirm Advancement" the action is more consequential (it locks the bracket), so use a **two-step inline confirm** pattern (no modal — judges and organizers in this app don't see modals; they are mobile-friendly sticky overlays would over-complicate state):

```tsx
{
  !isConfirming ? (
    <Button onClick={() => setIsConfirming(true)}>Confirm Advancement</Button>
  ) : (
    <div className="border border-destructive rounded p-3 space-y-2">
      <p className="text-sm font-medium">Lock the top {advancedCount} competitors for Battles?</p>
      <p className="text-xs text-muted-foreground">This cannot be undone via this UI.</p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={() => mutate({ competitionId })}
          disabled={isPending}
        >
          {isPending ? 'Confirming...' : 'Yes, confirm'}
        </Button>
        <Button variant="ghost" onClick={() => setIsConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

After successful confirmation, the local state plus invalidated `getCompetition` query will swap the panel to State B (locked).

### TanStack Query v5 Reactivity (Re-stated for safety)

Per `project-context.md`: `useQuery` does NOT support `onSuccess`/`onError`. Derive state from `data` directly. For `cypher-results-panel.tsx`:

```tsx
const { data: competition } = trpc.tournament.getCompetition.useQuery({ competitionId });
const { data: standings = [] } = trpc.tournament.getStandings.useQuery({ competitionId });
const isLocked =
  competition?.cypherCompletedAt !== null && competition?.cypherCompletedAt !== undefined;
const advancedCount = competition?.advancementThreshold
  ? Math.min(competition.advancementThreshold, standings.length)
  : 0;
```

No `useEffect`-based state mirroring. No `setQueryData` for standings (the standings updates flow via Story 3.4's `standings.updated` socket event already).

### Existing Infrastructure (Verified — do NOT re-implement)

From Story 3.2 (already shipping):

- `startCypherPhase` mutation transitions `competitions.status` `'draft' → 'active'` and emits `competition.started`.
- Event store INSERT pattern with sequence uniqueness.
- Gateway broadcast inside transaction.

From Story 3.4 (already shipping):

- `getStandings` public query with rate limiting, returns `StandingsEntry[]`.
- `computeStandings` helper at `tournament.router.ts:88-130` — REUSE; do NOT duplicate.
- `usePublicSocket` hook with `onStandingsUpdated` — extend with `onPhaseTransitioned`.
- `sanitizeCriteriaScores` defensive runtime guard against malformed jsonb.

From Story 3.5 (just shipped):

- `lib/network-error.ts` and `lib/judge-draft.ts` extracted helper pattern — apply same approach for any cypher-results helpers if extracted.
- TanStack Query invalidation on socket events.
- Defensive type-guard pattern for runtime data validation.

### Project Structure Notes

**New files:**

```
packages/db/migrations/0010_add_cypher_completed_at.sql            (new — migration)
apps/web/src/components/admin/cypher-results-panel.tsx              (new — admin UI)
```

**Modified files:**

```
packages/db/schema/competitions.ts                                  (add cypherCompletedAt column)
packages/shared/events/tournament-events.ts                         (add PhaseTransitionedPayload)
packages/shared/events/socket-event-map.ts                          (add 'phase.transitioned')
packages/shared/validation/competition.schema.ts                    (add completeCypherPhaseSchema)
packages/shared/errors/error-codes.ts                               (add new ErrorCodes)
packages/shared/index.ts                                            (re-export new types/schemas)
apps/api/src/modules/websocket/competition-gateway.interface.ts     (add broadcastPhaseTransitioned)
apps/api/src/modules/websocket/gateways/competition.gateway.ts      (implement broadcastPhaseTransitioned)
apps/api/src/trpc/routers/tournament.router.ts                      (add completeCypherPhase mutation; extend getCompetition select)
apps/api/src/trpc/routers/tournament.router.spec.ts                 (add tests)
apps/web/src/app/(admin)/competitions/[id]/page.tsx                 (render CypherResultsPanel)
apps/web/src/hooks/use-public-socket.ts                             (add onPhaseTransitioned option)
```

### Critical Edge Cases

1. **Confirmation before all judges have scored** — AC #1 reads "Given all judges have submitted scores", but the implementation does NOT block the mutation on completeness. Reason: organizers may legitimately want to confirm advancement when a judge is offline/missing (pragmatic event running). The UI shows a warning ("3 expected scores still pending") but the button works. The aggregation handles partial scoring: missing scores simply don't contribute. Document this as an explicit organizer-discretion choice, not a bug.

2. **All scores tied at the cutoff** — Two competitors at rank N and N+1 with identical totals. The current sort is `parseFloat(b.totalScore) - parseFloat(a.totalScore)`; equal values produce a stable order based on insertion. AC says "top N" — accept whichever the sort returns; tie-breaking is FUTURE work (the schema has `tieBreakingRule` but enforcement is Epic 5 / Story 5.x scope). Add a TODO comment in the mutation noting this.

3. **No scores submitted at all** — `standings` is empty, threshold whatever. `advancedCount = Math.min(threshold, 0) = 0`. `advancedCompetitorIds = []`. Event still emits with empty array. Mutation succeeds. UI shows "0 of 0 advance". This is a pathological case but should not crash.

4. **`advancementThreshold` is `0`** — Should not be possible per Story 2.4 validation, but defend: the validator already enforces `>= 1`. If somehow zero, the mutation throws `ADVANCEMENT_THRESHOLD_NOT_SET`.

5. **Competition deleted between confirm-click and mutation arrival** — `NOT_FOUND` thrown by ownership SELECT. Frontend treats as a generic error toast.

6. **`cypherCompletedAt` set but no event row exists** — Should be impossible given the transaction, but defend in idempotency path: if the lookup returns no row, fall back to recomputing standings + advanced IDs from the still-present `cypherCompletedAt` competition row. Log a warning. (Belt-and-suspenders for event-store integrity.)

7. **WebSocket broadcast happens INSIDE the transaction** — Same pattern as `startCypherPhase` (gotcha #10 in `project-context.md`-adjacent prior reviews). The risk: if a downstream subscriber acts on the broadcast and the transaction rolls back, the subscriber sees state that wasn't persisted. Acceptable for MVP because: (a) all consumers are read-only refresh triggers; (b) post-MVP can introduce a transactional outbox pattern.

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md` (read this BEFORE writing code):

1. **`postgres-js` runtime, `pg` is devDep only.** Don't import `pg` in app code.
2. **Drizzle defaults still need verification** at INSERT time — but here we INSERT into events (which already has `.$defaultFn`).
3. **`updatedAt: new Date()`** must accompany every UPDATE — set on the competition row when stamping `cypherCompletedAt`.
4. **TOCTOU on unique constraints**: `uq_events_aggregate_sequence` enforces sequence uniqueness; wrap INSERT in try/catch and map postgres `23505` → idempotency fallback (NOT a generic CONFLICT) since two concurrent confirmations should converge to the same outcome.
5. **`SET LOCAL session.current_organizer_id`** is mandatory inside any DB-touching protected procedure.
6. **Explicit ownership SELECT before mutation** — RLS filters silently; the explicit check gives a useful `NOT_FOUND`.
7. **Auth test required**: `caller(null).tournament.completeCypherPhase` → `UNAUTHORIZED`. Recurring adversarial-review finding.
8. **Zod validation test required**: invalid `competitionId` (empty string) rejects.
9. **Scores stored as 'X.XX' strings, NEVER floats.** `aggregateCompetitorScores` already handles this; rely on it.
10. **No client-side score calculation.** All ranking happens in `computeStandings` server-side.
11. **`react-hooks/set-state-in-effect`** rule will fire if you initialize confirm-state from query data via `useEffect`. Use the split-component pattern (outer fetches, inner receives data via props with `key`) OR derive directly from `data ?? defaultValue`.
12. **`@base-ui/react`, NOT Radix** — `<Button asChild>` does NOT exist. Use `buttonVariants()` className helper on `<Link>` if needed.
13. **`proxy.ts` not `middleware.ts`** — admin route remains under `(admin)` group with Clerk auth proxy.
14. **Event-store immutability** — never UPDATE or DELETE event rows. Compensating events only. (This story emits a phase event; never modifies prior `score.submitted` events.)
15. **Idempotency-by-conflict (NEW pattern for this story)** — when the unique sequence INSERT fails with `23505`, re-read the `phase.transitioned` event and return its payload. Do NOT throw `CONFLICT` to the user — the system has converged correctly.

### Testing Standards

- **Test framework**: Vitest. API runs server-side (Node), web runs JSDOM. Both already configured.
- **API test mocking**: use `mockDb` + `caller()` helpers established in `tournament.router.spec.ts`. Do NOT touch a real database.
- **Pairs regression test** for AC #2: seed 4 competitors via mockDb, simulate 3 judges submitting scores for each of the 4 individuals across 3 rounds (varying judge×competitor combinations). Verify `completeCypherPhase`-returned standings have `totalScore` per individual reflecting their full sum, independent of any partner relationship.
- **Idempotency test** for AC #5: invoke mutation twice in sequence; assert `events` table has exactly one `phase.transitioned` row for the competition.
- **Coverage target**: every branch in `completeCypherPhase` (status guard, threshold guard, idempotency-by-state, idempotency-by-conflict, happy path, under-population).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.6 — FR16, FR17, FR18, FR19, FR42]
- [Source: _bmad-output/planning-artifacts/prd.md#FR16-FR19 — ranking, top-N, partner rotation, organizer review]
- [Source: _bmad-output/planning-artifacts/architecture.md#Event Store — append-only events table, sequence uniqueness, NFR21 replay]
- [Source: _bmad-output/planning-artifacts/architecture.md#Tournament router naming — `tournament.*` namespace]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:699-873 — startCypherPhase reference pattern (RLS, ownership SELECT, event emit, broadcast)]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:88-130 — computeStandings helper to REUSE]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:875-894 — getStandings query already public]
- [Source: apps/api/src/modules/websocket/gateways/competition.gateway.ts:142-180 — broadcast methods reference]
- [Source: packages/db/schema/competitions.ts — competitions table, advancementThreshold column already exists]
- [Source: packages/db/schema/events.ts — events table, uq_events_aggregate_sequence]
- [Source: packages/shared/events/tournament-events.ts — CompetitionStartedPayload as model for PhaseTransitionedPayload]
- [Source: packages/shared/events/socket-event-map.ts — ServerToClientEvents type to extend]
- [Source: packages/formats/cypher-battles/src/scoring/aggregation.ts — aggregateCompetitorScores; reused as-is]
- [Source: apps/web/src/components/admin/start-cypher-phase-panel.tsx — admin panel pattern to mirror]
- [Source: apps/web/src/app/(public)/[competitionId]/standings/page.tsx — standings table styling reference]
- [Source: apps/web/src/hooks/use-public-socket.ts — socket hook to extend with onPhaseTransitioned]
- [Source: _bmad-output/implementation-artifacts/3-2-cypher-phase-start-and-judge-group-assignment.md — startCypherPhase implementation reference]
- [Source: _bmad-output/implementation-artifacts/3-4-real-time-score-aggregation-and-live-standings.md — getStandings + WebSocket broadcast pattern]
- [Source: _bmad-output/implementation-artifacts/3-5-offline-score-queue-and-connection-resilience.md — most-recent story; idempotency + defensive guard patterns]
- [Source: _bmad-output/project-context.md — exhaustive list of project-wide rules; READ FIRST]

### Previous Story Intelligence (Story 3.5 — just completed 2026-04-25)

Key learnings from the immediately prior story to apply here:

1. **Idempotency convention** — Story 3.5 used client-generated UUIDs. Story 3.6 uses server-state idempotency (the `cypherCompletedAt` timestamp + event existence). Different problem, different mechanism — both valid.
2. **Defensive runtime guards** — Story 3.5 added `isQueuedSubmission` type guard. Story 3.6 should similarly use type narrowing in the event-payload deserialization in tests (the `events.payload` is `jsonb`).
3. **Extract testable helpers** — Story 3.5's adversarial review found that inline-defined helpers (`isNetworkError`, `parseDraft`) had no unit tests. Pre-empt this for Story 3.6: any non-trivial helper for the cypher-results panel (e.g., `computeAdvancedCount(threshold, total)`) should live in `lib/` with its own spec.
4. **No new dependencies** — Story 3.5 wrote hook tests using React 19 built-in utilities rather than adding `@testing-library/react`. Apply the same constraint here.
5. **No `any` types** — use `unknown` + type guards. The `events.payload` retrieval will need a type guard for `PhaseTransitionedPayload`.
6. **TanStack Query v5 reactivity** — derive state from `data`, no `useEffect` mirroring (`react-hooks/set-state-in-effect`).
7. **Confirmation UX** — Story 3.5 introduced toast-style transient notifications for drain results. Story 3.6's confirm flow uses inline confirm-cards instead (different UX surface, persistent action vs. transient feedback).

[Source: _bmad-output/implementation-artifacts/3-5-offline-score-queue-and-connection-resilience.md — Senior Developer Review section.]

### Git Intelligence (recent commits)

```
72e3df7 chore(ci): bump GitHub Actions to Node 24-compatible majors + gate Deploy
8f367e1 fix(ci): remove pnpm version override that conflicts with packageManager
59cc235 chore: checkpoint Stories 2.2-3.4 + CI scaffolding
efc9ca7 Initial commit: competition platform with Epic 1 & Story 2.1 complete
```

The recent commits are CI/infra-focused, not feature work. Story 3.5 was implemented but not yet committed (uncommitted Cypher 2.x → 3.x work pending). When Story 3.6 lands, the dev should consider a single feature commit covering both Stories 3.5 + 3.6 OR separate commits if the user prefers — defer to user preference at commit time.

### Project Context Reference

This story explicitly defers to and complies with `_bmad-output/project-context.md`. Do NOT duplicate those rules here. If a rule from project-context.md is unclear, read the source story it references (often listed in parentheses, e.g., "Fixed in Story 2.1 [M3]").

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

### Completion Notes List

**Implementation complete — 2026-04-27**

- Added `cypher_completed_at` timestamp column to `competitions` (migration `0010_add_cypher_completed_at.sql`); Drizzle schema kept in sync. Followed the story's chosen design (Option 3) — single nullable `TIMESTAMPTZ`, no enum migration.
- Defined `PhaseTransitionedPayload` and `PhaseTransitionedEvent` types in `tournament-events.ts`; wired the socket event into `ServerToClientEvents`.
- Added `completeCypherPhaseSchema` (Zod), three new error codes (`CYPHER_NOT_ACTIVE`, `CYPHER_ALREADY_COMPLETED`, `ADVANCEMENT_THRESHOLD_NOT_SET`).
- `broadcastPhaseTransitioned` in the gateway emits to BOTH admin and public rooms — payload contains advanced competitor IDs only (no raw scores), so it's public-safe.
- `completeCypherPhase` mutation handles all branches per spec: ownership/RLS, idempotency-by-state (re-reads prior event when `cypherCompletedAt !== null`), idempotency-by-conflict (catches `23505` and re-reads winning event), phase guard, threshold guard, AC #6 cap (`Math.min(threshold, standings.length)`), and a defensive fallback when `cypherCompletedAt` is set but no event exists. `updatedAt` is bumped on the competition row per project rule.
- Reused existing `computeStandings` helper at `tournament.router.ts:88-130` — no logic duplication.
- Extended `getCompetition` SELECT to include `cypherCompletedAt`.
- `usePublicSocket` extended with optional `onPhaseTransitioned` callback (callback-ref pattern matching `onStandingsUpdated`).
- New client component `CypherResultsPanel` renders only when `competition.status === 'active'`. Top-N rows highlighted with `bg-green-50 dark:bg-green-950/20` + `Advances ✓` badge. Two-step inline confirm card (no modal). Locked state shows green success banner with timestamp + count + disabled button. Subscribes to `phase.transitioned` socket events to invalidate competition + standings on broadcast.
- Wired into `(admin)/competitions/[id]/page.tsx` above `StartCypherPhasePanel`.
- 9 new tests added: 2 unit tests (Zod + auth) plus 7 integration tests covering status guard (draft), threshold guards (null + zero), NOT_FOUND, happy path with event sequence + broadcast assertions, AC #6 under-population (2/threshold=3), pathological zero-competitors case, AC #5 idempotency-by-state, idempotency-by-conflict (23505), and AC #2 pairs-aggregation regression (4 individuals × 3 judges with rotated partners — verifies per-individual totals are independent of partner).
- Extended `makeCallerFor` test helper with optional `userId` parameter (default null) for backward compatibility with existing public-procedure tests.
- Full Turborepo CI gate: `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — **13/13 tasks pass**. API: 87/87 tests. Web: 39/39 tests.

### File List

packages/db/schema/competitions.ts (modified — added cypherCompletedAt column)
packages/db/migrations/0010_add_cypher_completed_at.sql (new)
packages/shared/events/tournament-events.ts (modified — added PhaseTransitionedPayload + PhaseTransitionedEvent)
packages/shared/events/socket-event-map.ts (modified — added 'phase.transitioned' to ServerToClientEvents)
packages/shared/validation/competition.schema.ts (modified — added completeCypherPhaseSchema)
packages/shared/errors/error-codes.ts (modified — added 3 new error codes)
apps/api/src/modules/websocket/competition-gateway.interface.ts (modified — added broadcastPhaseTransitioned)
apps/api/src/modules/websocket/gateways/competition.gateway.ts (modified — implemented broadcastPhaseTransitioned)
apps/api/src/trpc/routers/tournament.router.ts (modified — added completeCypherPhase mutation; extended getCompetition select with cypherCompletedAt)
apps/api/src/trpc/routers/tournament.router.spec.ts (modified — 9 new tests; extended makeCallerFor with optional userId)
apps/web/src/hooks/use-public-socket.ts (modified — added onPhaseTransitioned callback)
apps/web/src/components/admin/cypher-results-panel.tsx (new)
apps/web/src/app/(admin)/competitions/[id]/page.tsx (modified — render CypherResultsPanel)

### Change Log

- 2026-04-27: Implemented Story 3.6 — Cypher Phase Completion & Advancement Review. Added `cypher_completed_at` projection column, `phase.transitioned` event + socket broadcast, `completeCypherPhase` tRPC mutation with full idempotency (state + sequence-conflict), and admin Cypher Results panel with top-N highlighting and two-step inline confirmation. 9 new tests including pairs-aggregation regression for AC #2.
- 2026-04-27: Code review fixes — (C1) Added pending-scores warning to CypherResultsPanel derived from uneven judgeCount across standings entries. (H1) Moved phase guard and threshold guard before standings load to fail fast without unnecessary DB queries. (M1) Fixed `update` mock in `makeCompleteCypherPhaseDb` to use a real spy for `.set()` and added SET-value assertion to the happy path test. (M2) Removed premature `CYPHER_ALREADY_COMPLETED` error code (never thrown, violates no-hypothetical-future-features rule). (L1) Added test for belt-and-suspenders fallback path (`cypherCompletedAt` set but no event). (L2) Added `onPhaseTransitioned` handler to public standings page so spectators refresh when phase locks. CI: 13/13 Turbo tasks, 88/88 API tests, 39/39 web tests.
