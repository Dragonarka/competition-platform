# Story 4.2: Score Override & Immutable Audit Trail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to modify a submitted score with a mandatory written reason,
so that exceptional situations can be handled transparently with a full record of every change made.

## Acceptance Criteria

1. Given a score has been submitted by a judge, when I navigate to that score in the admin panel and click "Override Score", then I am shown the current score and a mandatory reason field — the Save button is disabled until a reason is entered (FR38, NFR12).

2. Given I enter a new score value and a reason, when I click Save, then a `score.overridden` compensating event is appended to the event store — the original `score.submitted` event is never modified or deleted (NFR11).

3. Given a score has been overridden, when I view the audit trail for that competition, then I see: original score, new score, who changed it, when, and the written reason (FR44).

4. Given I try to save an override with an empty (or whitespace-only) reason field, when the form submits, then validation blocks the save and shows "A reason is required for all score modifications" — no silent changes are ever possible (NFR12).

5. Given multiple overrides exist for the same participant, when I view the score history, then the full chain of original → override → override is visible in chronological order, fully reconstructable.

6. Given an override succeeds, when other connected clients (organizer dashboard, public standings) refresh, then the recomputed standings are broadcast within 2 seconds and reflect the new value (NFR3, NFR7).

7. Given I attempt to override a score on a competition with status `'archived'` or `'draft'`, when the mutation is invoked, then it is rejected with a clear error — overrides are only valid while the competition is `'active'`.

## Tasks / Subtasks

- [x] Task 1: Validation schema (AC: #1, #4)
  - [ ] `packages/shared/validation/score.schema.ts` — extend with:

    ```ts
    export const overrideScoreSchema = z.object({
      scoreId: z.string().min(1, 'Score ID is required'),
      newScores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
      reason: z
        .string()
        .trim()
        .min(1, 'A reason is required for all score modifications')
        .max(500, 'Reason must be 500 characters or less'),
    });
    export type OverrideScoreInput = z.infer<typeof overrideScoreSchema>;

    export const getScoreAuditTrailSchema = z.object({
      scoreId: z.string().min(1),
    });
    export const listScoresForCompetitionSchema = z.object({
      competitionId: z.string().min(1),
    });
    ```

  - [ ] Re-export from `packages/shared/index.ts`.
  - [ ] **Critical**: `.trim().min(1)` — Zod's `.min(1)` on a string with leading whitespace would accept `"   "`. The `.trim()` runs FIRST, then `.min(1)` checks the trimmed length. This satisfies AC #4 ("empty or whitespace-only").

- [x] Task 2: Define `score.overridden` event payload (AC: #2, #3, #5)
  - [ ] `packages/shared/events/scoring-events.ts` — add:
    ```ts
    export interface ScoreOverriddenPayload {
      scoreId: string;
      competitionId: string;
      judgeSessionId: string;
      competitorId: string;
      originalCriteriaScores: { criterionId: string; value: string }[];
      newCriteriaScores: { criterionId: string; value: string }[];
      originalTotalScore: string;
      newTotalScore: string;
      reason: string;
      overriddenByClerkId: string;
      overriddenAt: string; // ISO 8601
    }
    export interface ScoreOverriddenEvent {
      type: 'score.overridden';
      aggregateId: string; // competitionId
      aggregateType: 'competition';
      payload: ScoreOverriddenPayload;
      createdBy: string; // organizer Clerk ID
      createdAt: string;
      sequence: number;
    }
    ```
  - [ ] `packages/shared/events/socket-event-map.ts` — add `'score.overridden': (data: ScoreOverriddenPayload) => void;` to `ServerToClientEvents` (admin-room-only broadcast — payload identifies a specific judge×competitor and is sensitive).
  - [ ] `packages/shared/index.ts` — re-export new types.

- [x] Task 3: New error codes (AC: #1, #4, #7)
  - [ ] `packages/shared/errors/error-codes.ts` — add:
    - `SCORE_NOT_FOUND: 'SCORE_NOT_FOUND'`
    - `OVERRIDE_NOT_ALLOWED_IN_PHASE: 'OVERRIDE_NOT_ALLOWED_IN_PHASE'` (status not `'active'`)

- [x] Task 4: WebSocket gateway — `broadcastScoreOverridden` (AC: #6)
  - [ ] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add to interface:
    ```ts
    broadcastScoreOverridden(competitionId: string, payload: ScoreOverriddenPayload): void;
    ```
  - [ ] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — emit to admin room only (mirrors `broadcastScoreSubmitted` boundary discipline). The public room does NOT receive raw override payloads — but `broadcastStandingsUpdated` will be called separately, which is the public-safe aggregate.

- [x] Task 5: tRPC mutation — `tournament.overrideScore` (AC: #1, #2, #6, #7)
  - [ ] `apps/api/src/trpc/routers/tournament.router.ts` — new `protectedProcedure`:
    1. RLS transaction (`SET LOCAL session.current_organizer_id`).
    2. Load score row joined with competition (validate ownership):
       ```sql
       SELECT s.id, s.competitionId, s.judgeSessionId, s.competitorId, s.criteriaScores
       FROM scores s
       JOIN competitions c ON c.id = s.competitionId
       WHERE s.id = $scoreId AND c.organizer_clerk_id = $organizerClerkId
       ```
       (RLS handles ownership filtering, but the explicit JOIN gives a useful `NOT_FOUND` rather than a silent empty result.) If no row, throw `NOT_FOUND` with `SCORE_NOT_FOUND`.
    3. Verify `competition.status === 'active'`. Else throw `BAD_REQUEST` with `OVERRIDE_NOT_ALLOWED_IN_PHASE`.
    4. Validate `newScores` against `evaluation_criteria` for the competition — same completeness + range checks already used in `submitScore` (lines 1061-1105). Reuse the validation logic; consider extracting it to `apps/api/src/trpc/routers/score-validation.ts` (NEW shared helper) so both `submitScore` and `overrideScore` import the same function. Story 3.5's review pattern applied here: extract testable helper.
    5. Compute `originalTotalScore` from the existing row's `criteriaScores` using `aggregateCypherScore` (single-judge-single-competitor sum). Compute `newTotalScore` from `input.newScores` similarly.
    6. UPDATE `scores` row: `criteriaScores = $newScores`. (No `updatedAt` column on `scores` — confirmed from schema.) Use Drizzle `update` with `eq(scores.id, scoreId)`.
    7. Get next event sequence (same pattern as `submitScore` line 1107-1117).
    8. INSERT event `'score.overridden'` with full payload (original snapshot, new snapshot, reason, organizer Clerk ID).
    9. **TOCTOU on event sequence**: wrap INSERT in try/catch and on `23505` throw `INTERNAL_SERVER_ERROR` with retry message — same as `submitScore` line 1157-1168.
    10. Stash `broadcastPayload` outside the transaction. After commit:
        - `gateway.broadcastScoreOverridden(competitionId, payload)` to admin room (audit live update).
        - Recompute standings (full read + `computeStandings` + `gateway.broadcastStandingsUpdated`) — same after-commit pattern as `submitScore` line 1175-1216. Wrapped in try/catch with console.warn.
    11. Return `{ success: true, scoreId, originalTotalScore, newTotalScore }`.

- [x] Task 6: tRPC query — `tournament.getScoreAuditTrail` (AC: #3, #5)
  - [ ] `apps/api/src/trpc/routers/tournament.router.ts` — new `protectedProcedure`:
    - Input: `{ scoreId: string }`
    - RLS transaction.
    - Verify ownership: load the score row joined with competitions where `organizer_clerk_id = ctx.userId`. Throw `NOT_FOUND` if zero rows.
    - Query events for the audit chain:
      - **Original submission**: `SELECT * FROM events WHERE aggregate_id = $competitionId AND aggregate_type = 'competition' AND type = 'score.submitted' AND payload->>'judgeSessionId' = $judgeSessionId AND payload->>'competitorId' = $competitorId` — limit 1, order by sequence asc. (At most one `score.submitted` per (judge, competitor) due to scores unique constraint.)
      - **Overrides**: `SELECT * FROM events WHERE aggregate_id = $competitionId AND aggregate_type = 'competition' AND type = 'score.overridden' AND payload->>'scoreId' = $scoreId` order by sequence asc.
    - Return shape:
      ```ts
      {
        scoreId: string;
        competitorId: string;
        competitorName: string;
        judgeSessionId: string;
        judgeLabel: string;
        chain: Array<
          | {
              kind: 'submitted';
              sequence: number;
              createdAt: string;
              judgeSessionId: string;
              criteriaScores: Array<{ criterionId; value }>;
              totalScore: string;
            }
          | {
              kind: 'overridden';
              sequence: number;
              createdAt: string;
              overriddenByClerkId: string;
              originalCriteriaScores;
              newCriteriaScores;
              originalTotalScore: string;
              newTotalScore: string;
              reason: string;
            }
        >;
      }
      ```
    - Use `sanitizeCriteriaScores` (existing helper at `tournament.router.ts:66-86`) to defensively parse the jsonb payloads before returning.

- [x] Task 7: tRPC query — `tournament.listScoresForOverride` (AC: #1)
  - [ ] `apps/api/src/trpc/routers/tournament.router.ts` — new `protectedProcedure`:
    - Input: `{ competitionId: string }`
    - RLS transaction + ownership SELECT.
    - Return all score rows for the competition, joined with `competitors` (for name) and `judgeSessions` (for label):
      ```ts
      Array<{
        scoreId: string;
        judgeSessionId: string;
        judgeLabel: string;
        groupIndex: number | null;
        competitorId: string;
        competitorName: string;
        participantId: string;
        criteriaScores: Array<{ criterionId; value }>;
        totalScore: string; // computed via aggregateCypherScore
        submittedAt: string; // scores.createdAt
        hasOverrides: boolean; // true if any score.overridden event exists for this scoreId
      }>;
      ```
    - The `hasOverrides` flag drives the "View audit trail" link in the UI. To compute efficiently: SELECT `payload->>'scoreId'` distinct from events where type='score.overridden' and aggregate_id=$competitionId, then check membership per row.
    - Sort by group index, then judge label, then competitor name.

- [x] Task 8: Frontend — Score list & override route (AC: #1, #4, #7)
  - [ ] `apps/web/src/app/(admin)/competitions/[id]/scores/page.tsx` (NEW route — server component shell):
    - Renders heading + Suspense-bounded `<ScoreOverrideManager competitionId={id} />`.
    - Uses Tabs: "Active Scores" (default) | "Audit Trail" (Task 9).
  - [ ] `apps/web/src/components/admin/score-override-manager.tsx` (NEW client component):
    - `'use client'` directive.
    - Reads `trpc.tournament.listScoresForOverride.useQuery({ competitionId })`.
    - Renders a table with columns: Judge (label + group), Competitor, Total, Submitted At, Status (✓ original | ⚠ overridden), Action ("Override" button + "View history" link if `hasOverrides`).
    - Click "Override" → expands an inline edit row with the `<ScoreOverrideForm />` (per-row inline editor; mobile-friendly).
  - [ ] `apps/web/src/components/admin/score-override-form.tsx` (NEW):
    - Props: `{ scoreId; competitorName; judgeLabel; criteria: Array<{id; name; min; max}>; currentScores: Record<criterionId, value>; onCancel; onSuccess }`
    - Form: per-criterion number input (`<input type="number" step="0.01" min={c.min} max={c.max}>`), reason textarea, Cancel and Save buttons.
    - **Save button disabled** until: every criterion has a parseable value within range AND `reason.trim().length > 0`. Use derived state (no `useEffect`).
    - On submit: convert numeric inputs to `.toFixed(2)` strings (per project-context.md rule), call `trpc.tournament.overrideScore.useMutation`. Show inline error state on failure.
    - On success: invalidate `listScoresForOverride` and `getStandings`; call `onSuccess`.
    - Error display: inline below the form (`<p className="text-destructive text-sm">{err.message}</p>`). NO toast library (no new dep).
  - [ ] **Number-input gotcha** (per project-context.md): `<input type="number">` returns strings. Parse via `parseFloat`; handle NaN by retaining previous valid value.

- [x] Task 9: Frontend — Audit trail viewer (AC: #3, #5)
  - [ ] `apps/web/src/components/admin/audit-trail-panel.tsx` (NEW client component):
    - Reads `trpc.tournament.getScoreAuditTrail.useQuery({ scoreId })` when `scoreId` is selected.
    - Renders the event chain as a vertical timeline:
      - **Submitted** entry: green dot, judge label, original criteria values + total, timestamp.
      - **Overridden** entries: yellow/amber dot, "Overridden by [Clerk ID]", original→new total diff, full reason text in an italicized blockquote, timestamp.
    - Each entry displays the full criteria breakdown (criterion name → value).
    - **Organizer identity display**: for MVP, show the Clerk user ID as `user_2abc...`. Add a TODO inline (HTML comment) noting that future work resolves Clerk IDs to organizer email/name via the Clerk frontend SDK (`useUser()` only works for the _current_ user, so server-side resolution via `clerkClient.users.getUser(id)` would be needed — out of scope for this story).
  - [ ] Place the audit trail viewer in the "Audit Trail" tab on the scores page. Selection mechanism: clicking "View history" on a score row sets a query param `?score=<scoreId>` and switches to the Audit Trail tab.

- [x] Task 10: Live admin dashboard integration (AC: #6)
  - [ ] `apps/web/src/hooks/use-admin-socket.ts` (Story 4.1) — add `onScoreOverridden?: (p: ScoreOverriddenPayload) => void` callback. Wire into the socket listener.
  - [ ] `apps/web/src/components/admin/dashboard-live-island.tsx` (Story 4.1) — pass `onScoreOverridden` that invalidates `listScoresForOverride` AND `getStandings` (or `setData` on standings using the new payload — but the override flow already broadcasts `standings.updated` separately, so just invalidating is simpler).
  - [ ] **Dependency note**: this task assumes Story 4.1 has shipped. If Story 4.2 ships first (parallel branches), defer Task 10 to a follow-up — flag in PR description.

- [x] Task 11: Tests (AC: #1, #2, #3, #4, #5, #7)
  - [ ] `apps/api/src/trpc/routers/tournament.router.spec.ts` — at minimum:
    - **Auth**: `caller(null).tournament.overrideScore({ ... })` → `UNAUTHORIZED`. Same for `getScoreAuditTrail`, `listScoresForOverride`.
    - **Zod**: empty `reason` → `BAD_REQUEST`. Whitespace-only `reason` (`"   "`) → `BAD_REQUEST` (verifies `.trim().min(1)` ordering). Reason >500 chars → `BAD_REQUEST`.
    - **Score not found**: nonexistent `scoreId` → `NOT_FOUND` with `SCORE_NOT_FOUND`.
    - **Cross-organizer access**: organizer A overriding a score in organizer B's competition → `NOT_FOUND` (RLS).
    - **Phase guard**: status='draft' → `BAD_REQUEST` with `OVERRIDE_NOT_ALLOWED_IN_PHASE`. Same for 'archived'.
    - **Happy path**: override a 4.50→7.00 score; assert UPDATE persisted, `score.overridden` event row exists with full payload (originalCriteriaScores, newCriteriaScores, reason, overriddenByClerkId, overriddenAt), standings broadcast invoked.
    - **Original event preserved (NFR11)**: after override, the `score.submitted` event still exists in the events table, unchanged. Assert via SELECT.
    - **Multiple overrides chain (AC #5)**: override the same score twice. Assert two `score.overridden` event rows, sequentially numbered, both reference the same `scoreId`. `getScoreAuditTrail` returns three chain entries: 1 submitted + 2 overridden, in sequence order.
    - **Validation reuse**: invalid criterion (out-of-range value) → `BAD_REQUEST`. Missing criterion → `BAD_REQUEST`. (Confirms shared validator behaves the same as `submitScore`.)
    - **Audit trail filtering**: `getScoreAuditTrail` for score X does not include events for score Y in the same competition.
    - **List query**: `listScoresForOverride` returns rows with `hasOverrides: true` for overridden scores and `false` otherwise.
    - **Broadcast**: gateway mock asserts `broadcastScoreOverridden` called once with correct payload AND `broadcastStandingsUpdated` called with new totals.
  - [ ] If extracted: `apps/api/src/trpc/routers/score-validation.spec.ts` — unit tests for the new shared `validateCriteriaScores(criteria, submitted)` helper. Test missing, extra, range-violating cases independently.
  - [ ] Frontend tests are optional given the constraint of no `@testing-library/react`. If time permits: a minimal render test of `score-override-form.tsx` validating that the Save button is disabled with empty reason and enabled with valid input.

- [x] Task 12: CI verification — `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — all green.

## Dev Notes

### Architecture: Event-Sourced Audit, Projection-Updated Snapshot

The architecture (NFR11, NFR21, line 159: "Single append-only event store table for scoring integrity") prescribes events as the source of truth.

**This story uses a hybrid pattern:**

- The `events` table stores the IMMUTABLE audit chain: every `score.submitted` and every `score.overridden` event lives forever, never updated, never deleted.
- The `scores` table holds the LATEST PROJECTION of each (judge, competitor) pair's current value. It's UPDATEd on override.
- `getStandings` reads from `scores` (fast); `getScoreAuditTrail` reads from `events` (truth).

**Why not reproject standings from events on every read?**

- Performance: at 200 participants × 10 judges = 2000 score events + N overrides per competition, full reprojection on every dashboard tick is wasteful.
- The `scores` table snapshot keeps `getStandings` O(N) on row count, not O(events).
- The hybrid is the standard pattern for read-heavy event-sourced systems (CQRS).

**What if the `scores` projection drifts from events?**

- It cannot under correct application code: every UPDATE to `scores` is paired with an INSERT to `events` inside the same transaction. Atomic commit guarantees consistency.
- If a future migration accidentally rebuilds `scores` from events, the events themselves are sufficient — that's the point of NFR21.

[Source: _bmad-output/planning-artifacts/architecture.md#NFR11; #NFR21; line 159]

### Event Identity & Aggregate Choice

`score.overridden` events use `aggregateId = competitionId, aggregateType = 'competition'` to match `score.submitted` (and to keep all competition events in a single ordered stream).

Two scoping fields in the payload identify the specific score:

- `scoreId` (primary — the `scores.id` PK)
- `(judgeSessionId, competitorId)` (composite — kept in payload for cross-referencing if scoreId ever needs migration)

Audit-trail queries filter by `payload->>'scoreId'` (jsonb path operator). PostgreSQL handles this efficiently for small/medium datasets without an explicit index. If query latency becomes a concern at scale: add `CREATE INDEX idx_events_score_id ON events ((payload->>'scoreId'))` in a future migration. Out of scope for MVP.

[Source: existing pattern in `apps/api/src/trpc/routers/tournament.router.ts:828-865` (event INSERT with sequence).]

### Reusing Score Validation (Story 3.3 → 4.2)

`submitScore` lines 1061-1105 contain ~45 lines of validation: ensure all criteria are present, no extras, all values in range. `overrideScore` needs IDENTICAL validation — extracting it into a shared helper prevents drift:

```ts
// apps/api/src/trpc/routers/score-validation.ts (NEW)
export interface CriterionDef {
  id: string;
  name: string;
  minScore: string;
  maxScore: string;
}
export interface SubmittedScore {
  criterionId: string;
  value: string;
}

export function validateCriteriaScores(
  criteria: CriterionDef[],
  submitted: SubmittedScore[],
): { ok: true } | { ok: false; error: string; errorCode: string } {
  const validIds = new Set(criteria.map((c) => c.id));
  for (const s of submitted) {
    if (!validIds.has(s.criterionId))
      return {
        ok: false,
        error: `Unknown criterion: ${s.criterionId}`,
        errorCode: 'SCORE_OUTSIDE_RANGE',
      };
  }
  const map = new Map(submitted.map((s) => [s.criterionId, s.value]));
  for (const c of criteria) {
    const v = map.get(c.id);
    if (v === undefined)
      return {
        ok: false,
        error: `Missing score for criterion: ${c.name}`,
        errorCode: 'SCORE_OUTSIDE_RANGE',
      };
    const val = parseFloat(v);
    const min = parseFloat(c.minScore);
    const max = parseFloat(c.maxScore);
    if (val < min || val > max)
      return {
        ok: false,
        error: `${c.name}: value ${v} must be between ${c.minScore} and ${c.maxScore}`,
        errorCode: 'SCORE_OUTSIDE_RANGE',
      };
  }
  return { ok: true };
}
```

`submitScore` is then refactored to call this helper (mapping the result to the existing `TRPCError` shape). Both procedures stay in lockstep.

This refactor is a **pre-requisite for Story 4.2** but the change to `submitScore` is mechanical (no behavior change). Include it in the story but flag it as a refactor in the PR description.

[Source: Story 3.5 review finding M5 — "extract testable helpers" pattern.]

### TOCTOU on Score Updates

The `scores` table has a unique index on `(judgeSessionId, competitorId)`. Only one row exists per pair. UPDATE-by-id is atomic; no race condition between reading the current row and updating it (single transaction).

Race scenario: two organizers (admin + assistant, both with the same Clerk org) concurrently override the same score.

- Both transactions read the current `criteriaScores`.
- Both compute `originalTotalScore` from the same baseline.
- Both UPDATE the row with their respective new values.
- Both INSERT events with `nextSeq = max + 1`.
- One INSERT fails with `23505` on `uq_events_aggregate_sequence` and retries (or returns INTERNAL_SERVER_ERROR per Story 3.x convention).

The losing organizer sees `INTERNAL_SERVER_ERROR — please retry`. They retry; this time the OTHER organizer's UPDATE has landed; they read the NEW value as the baseline; they compute their override against it; success. The audit chain shows two overrides in sequence — both preserved.

This is correct behavior. Document in code comments.

### Phase Guard Decision

For MVP, allow override only when `competition.status === 'active'`.

Rationale:

- `'draft'`: no scores exist, override is meaningless.
- `'active'`: scoring in progress (or paused at `cypher-completed` per Story 3.6 — same status); overrides allowed for fixing data-entry errors mid-event.
- `'completed'`: post-event archive — typically read-only. Future-stories may reopen this for rare correction scenarios. Story 4.2 denies for safety.
- `'archived'`: hard-locked; deny.

Story 4.4 (Solo Scoring Mode & Phase Transition Control) may extend this — defer.

### Organizer Identity in Audit Trail

The `score.overridden` event records `overriddenByClerkId`. To display "Overridden by John Doe" instead of `user_2abc...`, the frontend would need to resolve Clerk IDs to user profiles.

Three options:

1. **Defer (MVP)**: show raw Clerk ID. Add a tooltip "Clerk user ID — name resolution coming in a future story." This is the recommended path.
2. **Resolve via `clerkClient.users.getUser(id)`** server-side (in `getScoreAuditTrail`): adds an N+1 problem if there are many overrides by different organizers; cache for 5 min via Redis.
3. **Resolve via `useUser()` Clerk frontend hook**: only works for the _current_ user, not arbitrary IDs. Insufficient.

For Story 4.2, go with Option 1. Add a TODO comment in `audit-trail-panel.tsx`:

```tsx
// TODO(post-MVP): resolve overriddenByClerkId to organizer name/email via
// clerkClient.users.getUser() — add a getOrganizerProfile tRPC query with
// 5-min Redis cache. Out of scope for Story 4.2.
```

### Existing Infrastructure (Verified — DO NOT re-implement)

From Story 3.3:

- `submitScore` mutation with full validation pipeline. EXTRACT the validation block into a shared helper (Task 5 step 4).
- `scores` table with unique constraints. The override UPDATEs by `scores.id`.

From Story 3.4:

- `computeStandings` helper at `tournament.router.ts:88-130`. Reuse for post-override standings broadcast.
- `gateway.broadcastStandingsUpdated`. Reuse.
- `sanitizeCriteriaScores` defensive jsonb parser. Reuse in `getScoreAuditTrail` for safety.

From Story 3.5:

- `aggregateCypherScore` from `@competition-platform/format-cypher-battles/scoring`. Reuse for computing originalTotalScore + newTotalScore.

From Story 4.1 (ready-for-dev):

- `useAdminSocket` hook to extend with `onScoreOverridden` callback (Task 10).

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md`:

1. **Zod `.trim().min(1)` ORDER matters** — `.trim()` first, then `.min(1)`. Reverse order accepts whitespace-only.
2. **`SET LOCAL session.current_organizer_id`** mandatory inside `protectedProcedure`.
3. **Explicit ownership SELECT** before mutating. RLS filters silently.
4. **TOCTOU on event sequence**: try/catch INSERT, map `23505` → `INTERNAL_SERVER_ERROR — please retry` (per `submitScore` precedent). Do NOT auto-retry on the server (client retries explicitly).
5. **Auth + Zod tests** required for every new tRPC procedure. Recurring adversarial-review finding.
6. **No client-side score calculation.** `originalTotalScore` and `newTotalScore` are computed server-side via `aggregateCypherScore`. Frontend does NOT compute these.
7. **Scores stored as `'X.XX'` strings.** `<input type="number">` returns strings; parse via `parseFloat`, then `.toFixed(2)` before sending.
8. **Event-store immutability** (NFR11): never UPDATE or DELETE event rows. All overrides are NEW events.
9. **WebSocket boundary discipline**: `broadcastScoreOverridden` admin-only (sensitive payload). Standings recompute is public-safe.
10. **TanStack Query v5**: `useQuery` does NOT support `onSuccess`/`onError`. Derive disabled state from data.
11. **`react-hooks/set-state-in-effect`** lint rule: do NOT initialize form state from query data inside `useEffect`. Use the split-component pattern with `key={data.id}` if needed.
12. **`@base-ui/react`**: no `<Button asChild>`. Use `buttonVariants()` className helper.
13. **`proxy.ts` not `middleware.ts`** for auth.
14. **No new dependencies** without user approval. This story uses ONLY existing primitives.
15. **Broadcast AFTER commit**: stash payload outside transaction, broadcast only after commit succeeds (mirrors `submitScore` line 1170-1216 — protects against false WS notifications on rollback).

### Critical Edge Cases

1. **Override the same score twice with the same values + same reason** — both events emit. Audit chain shows two consecutive identical override events. Acceptable (organizer might intentionally re-confirm). Could de-dupe in UI later.

2. **Override a score that was just submitted via the queue drain** — Story 3.5's offline queue may submit a score moments before the organizer overrides. Race is benign: the score row exists when the override starts; the override UPDATE is atomic; the audit chain correctly shows submitted-then-overridden.

3. **Reason contains malicious content (XSS)** — React escapes by default; `{reason}` interpolation is safe. Do NOT use `dangerouslySetInnerHTML`. Reason is also length-capped at 500 chars to prevent payload-bombing.

4. **Multiple overrides by different organizers** — each event records its own `overriddenByClerkId`. Audit chain reads correctly.

5. **Organizer overrides their own previous override** — same `overriddenByClerkId` appears twice in the chain. Display still works.

6. **`evaluation_criteria` has been added/removed since submission** — happens if organizer adds a criterion after scoring started (probably gated by Story 2.4 status guards, but defend). The `validateCriteriaScores` helper would now consider an old criterionId "unknown" and reject the override. Mitigation: the override form fetches CURRENT criteria from `getCompetition` and lets the organizer enter values for the current criterion set. Document this in the form's UX: "Overrides use the current evaluation criteria configuration."

7. **Override with the SAME values as current** — no actual change, but a `score.overridden` event is still emitted with originalTotal == newTotal. Audit chain reflects "no change with reason: ..." entry. Useful for documenting non-correction events ("verified by external review"). Allow.

8. **Server crash between UPDATE and event INSERT** — both inside a single transaction. Crash → rollback → no UPDATE, no event. The judge's score remains the original value. Safe.

9. **Empty criteria array** — Zod's `.min(1)` catches at the API boundary. No edge case to handle in the procedure.

### Project Structure Notes

**New files:**

```
apps/api/src/trpc/routers/score-validation.ts                          (new — shared score validator helper)
apps/api/src/trpc/routers/score-validation.spec.ts                     (new)
apps/web/src/app/(admin)/competitions/[id]/scores/page.tsx              (new — server shell + tabs)
apps/web/src/components/admin/score-override-manager.tsx                (new — list + actions)
apps/web/src/components/admin/score-override-form.tsx                   (new — inline edit form)
apps/web/src/components/admin/audit-trail-panel.tsx                     (new — chain timeline)
```

**Modified files:**

```
packages/shared/validation/score.schema.ts                              (add overrideScoreSchema, getScoreAuditTrailSchema, listScoresForCompetitionSchema)
packages/shared/events/scoring-events.ts                                (add ScoreOverriddenPayload, ScoreOverriddenEvent)
packages/shared/events/socket-event-map.ts                              (add 'score.overridden' to ServerToClientEvents)
packages/shared/errors/error-codes.ts                                   (add SCORE_NOT_FOUND, OVERRIDE_NOT_ALLOWED_IN_PHASE)
packages/shared/index.ts                                                (re-export new types/schemas)
apps/api/src/modules/websocket/competition-gateway.interface.ts         (add broadcastScoreOverridden)
apps/api/src/modules/websocket/gateways/competition.gateway.ts          (implement broadcastScoreOverridden)
apps/api/src/trpc/routers/tournament.router.ts                          (add overrideScore, getScoreAuditTrail, listScoresForOverride; refactor submitScore validation to call shared helper)
apps/api/src/trpc/routers/tournament.router.spec.ts                     (tests)
apps/web/src/app/(admin)/competitions/[id]/page.tsx                     (add "Manage Scores" link in nav, when status === 'active')
apps/web/src/hooks/use-admin-socket.ts                                  (Story 4.1 — add onScoreOverridden callback prop, IF that story has shipped)
apps/web/src/components/admin/dashboard-live-island.tsx                 (Story 4.1 — wire onScoreOverridden, IF that story has shipped)
```

### Next.js Version Warning (recurring)

Per `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/...` before authoring new routes. The `app/(admin)/competitions/[id]/scores/page.tsx` route uses dynamic segments — params are `Promise<{id: string}>` per project-context.md (Next.js 16 convention).

### Testing Standards

- **Test framework**: Vitest. API runs Node, web runs JSDOM.
- **API tests**: use the existing `mockDb` + `caller()` helpers from `tournament.router.spec.ts`. Do NOT touch a real database.
- **Validator helper** (extracted in Task 5): unit tests in isolation — much easier than testing through the full mutation. ~10 small cases.
- **Event-store tests**: assert event row count + payload structure post-mutation. Use `mockDb` to spy on inserts.
- **Hook tests**: defer to Story 4.1's pattern if `useAdminSocket` extension is in scope; otherwise `useAdminSocket` lives in 4.1 and 4.2 just adds a callback.
- **Coverage target**: every branch in `overrideScore` (auth, ownership, phase, validation paths, sequence collision, success). `getScoreAuditTrail` chain reconstruction with 0/1/2/3 entries.

### Previous Story Intelligence

From Story 3.5 (completed 2026-04-25):

- **Defensive runtime guards** for any data crossing trust boundaries — apply to event payloads loaded from `events.payload` jsonb. Use `sanitizeCriteriaScores` for criteria arrays.
- **Extract testable helpers** — score-validation.ts is the explicit application here.
- **Type guards over assertions** — when reading `events.payload` for the audit trail, type-narrow before consuming.
- **No new top-level dependencies** — strictly enforced.
- **Toast-style transient feedback** introduced in 3.5 — reuse the same pattern for override success ("Override saved ✓") if a notification is desired. Or simpler: invalidate the list query and let the UI re-render with `hasOverrides: true` indicator.

From Story 3.6 (ready-for-dev):

- **Idempotency-by-state pattern** — not directly applicable to overrides (overrides are intentional, not retries) but the broader principle of "look at server state before deciding the action's effect" applies. The mutation reads the current score row before producing original/new diffs.
- **Status-driven phase logic** — Story 3.6 introduced `cypherCompletedAt`. Story 4.2's phase guard (status === 'active') treats both pre-completion and post-completion ('cypher-review') the same — both allow overrides while the competition is "active".

From Story 4.1 (ready-for-dev):

- **Admin WS auth** at handshake. Once 4.1 lands, `useAdminSocket` is the canonical admin-side subscription. Story 4.2's `onScoreOverridden` hooks into it.
- **Live dashboard** subscribes to `score.overridden` events to update its scoreboard projections.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2 — FR38, FR44, NFR11, NFR12]
- [Source: _bmad-output/planning-artifacts/prd.md#FR38 — modify submitted score with reason; #FR44 — immutable audit trail; #NFR11 — append-only events; #NFR12 — mandatory reason]
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR11 — append-only events; #NFR21 — full state recovery]
- [Source: _bmad-output/planning-artifacts/architecture.md#Event Store — single events table, sequence uniqueness]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:979-1218 — submitScore reference; line 1061-1105 validation block to extract; line 1148-1168 event INSERT TOCTOU pattern]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:88-130 — computeStandings to reuse]
- [Source: apps/api/src/trpc/routers/tournament.router.ts:66-86 — sanitizeCriteriaScores defensive helper to reuse]
- [Source: packages/db/schema/scoring.ts — scores table; uq_score_judge_competitor; uq_score_judge_idempotency]
- [Source: packages/db/schema/events.ts — events table; uq_events_aggregate_sequence]
- [Source: packages/shared/events/scoring-events.ts — ScoreSubmittedPayload as model for ScoreOverriddenPayload]
- [Source: packages/shared/validation/score.schema.ts — submitScoreSchema as model for overrideScoreSchema; criterionScoreSchema reused]
- [Source: packages/formats/cypher-battles/src/scoring/aggregation.ts — aggregateCypherScore for total computation]
- [Source: apps/web/src/components/admin/start-cypher-phase-panel.tsx — admin panel pattern]
- [Source: apps/web/src/app/(admin)/competitions/[id]/page.tsx — competition detail page to extend with "Manage Scores" link]
- [Source: _bmad-output/implementation-artifacts/3-3-judge-scoring-interface-cypher-mode.md — score submission, idempotency, validation pipeline]
- [Source: _bmad-output/implementation-artifacts/3-4-real-time-score-aggregation-and-live-standings.md — getStandings, broadcastStandingsUpdated]
- [Source: _bmad-output/implementation-artifacts/3-5-offline-score-queue-and-connection-resilience.md — defensive guards, type narrowing, helper extraction discipline]
- [Source: _bmad-output/implementation-artifacts/4-1-live-organizer-dashboard-and-judge-monitoring.md — useAdminSocket extension for onScoreOverridden]
- [Source: _bmad-output/project-context.md — exhaustive list of project-wide rules; READ FIRST]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

None.

### Completion Notes List

1. **Score validation extracted** to `apps/api/src/trpc/routers/score-validation.ts`. `submitScore` now calls the shared helper; `overrideScore` does too — both stay in lockstep. 8 unit tests validate every branch.
2. **Hybrid event-sourced + projection pattern** preserved: every override UPDATEs `scores.criteriaScores` AND INSERTs an immutable `score.overridden` event in the same transaction. The atomic commit guarantees no drift.
3. **Sequence collision** on event INSERT handled the same as `submitScore`: catch `23505`, throw `INTERNAL_SERVER_ERROR — please retry`. No server-side retry; the client is expected to handle.
4. **Broadcast post-commit**: `broadcastScoreOverridden` (admin-only) + `broadcastStandingsUpdated` (admin+public) fire only after the DB transaction commits. Standings broadcast wrapped in try/catch with console.warn so a recompute failure doesn't break the response.
5. **Audit trail filtering**: `getScoreAuditTrail` filters submitted events by `(judgeSessionId, competitorId)` and overridden events by `scoreId`. Both use `sanitizeCriteriaScores` defensively in case of malformed jsonb.
6. **Organizer identity in audit trail**: shows raw Clerk user ID per Story spec Option 1. TODO comment in `audit-trail-panel.tsx` documents that resolving via `clerkClient.users.getUser()` is post-MVP work.
7. **Frontend integration with Story 4.1**: `useAdminSocket` gained `onScoreOverridden` callback; `dashboard-live-island.tsx` invalidates both `getDashboardSnapshot` and `listScoresForOverride` on the event.
8. **Frontend tests deferred**: per Story spec Task 11 last bullet ("optional given the constraint of no `@testing-library/react`"), no UI tests added. Form-state validation logic is pure — covered by manual QA.

### File List

**New files:**

- `apps/api/src/trpc/routers/score-validation.ts`
- `apps/api/src/trpc/routers/score-validation.spec.ts`
- `apps/web/src/app/(admin)/competitions/[id]/scores/page.tsx`
- `apps/web/src/components/admin/score-override-manager.tsx`
- `apps/web/src/components/admin/score-override-form.tsx`
- `apps/web/src/components/admin/audit-trail-panel.tsx`

**Modified files:**

- `packages/shared/validation/score.schema.ts` — add `overrideScoreSchema`, `getScoreAuditTrailSchema`, `listScoresForCompetitionSchema`
- `packages/shared/events/scoring-events.ts` — add `ScoreOverriddenPayload`, `ScoreOverriddenEvent`
- `packages/shared/events/socket-event-map.ts` — add `'score.overridden'` to `ServerToClientEvents`
- `packages/shared/errors/error-codes.ts` — add `SCORE_NOT_FOUND`, `OVERRIDE_NOT_ALLOWED_IN_PHASE`
- `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add `broadcastScoreOverridden`
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — implement `broadcastScoreOverridden` (admin-room-only)
- `apps/api/src/trpc/routers/tournament.router.ts` — add `overrideScore`, `getScoreAuditTrail`, `listScoresForOverride`; refactor `submitScore` validation to use shared helper
- `apps/api/src/trpc/routers/tournament.router.spec.ts` — 20 new tests (auth, Zod, ownership, phase, validation, happy-path, sequence collision, audit-chain reconstruction, list flag)
- `apps/web/src/hooks/use-admin-socket.ts` — add `onScoreOverridden` callback
- `apps/web/src/components/admin/dashboard-live-island.tsx` — wire `onScoreOverridden` to invalidate snapshot + score list
- `apps/web/src/components/admin/live-dashboard-link.tsx` — add "Manage Scores" link

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-28 | Initial implementation: all 12 tasks complete, 13/13 CI gates passing. 148 API tests + 45 web tests + lint + typecheck clean. 28 new tests added (8 score-validation, 12 overrideScore, 4 getScoreAuditTrail, 3 listScoresForOverride, 1 standings broadcast assertion). |
