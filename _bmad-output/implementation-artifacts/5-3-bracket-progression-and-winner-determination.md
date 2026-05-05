# Story 5.3: Bracket Progression & Winner Determination

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want the bracket to progress automatically as each matchup's votes come in, handling ties according to the configured rules,
so that the competition moves forward without manual intervention until we have a final winner.

## Acceptance Criteria

1. **Given** all assigned judges have voted on a matchup, **when** the votes are tallied, **then** the competitor with strictly more "player1" or "player2" votes is recorded as `winnerCompetitorId`, a `matchup.completed` event is appended to the event store with `{ matchupId, winnerCompetitorId, tally, advancedFromTie: false }`, and the matchup is broadcast on the admin / public / judge rooms within 10 seconds (FR23, FR25, NFR3).

2. **Given** a matchup ends in a tie (equal `player1`/`player2` counts after every assigned judge has voted, OR the `tie` option wins by plurality), **when** the configured `tieBreakingRule = 're_vote'`, **then** every existing `votes` row for that matchup is deleted in the same transaction, a `matchup.revote-required` event is appended, the `matchup.revoteCount` counter on `battle_matchups` is incremented, and judges are prompted to vote again — the same matchup re-appears in `getBattlesAssignment` with no UI navigation step (FR24).

3. **Given** a matchup ends in a tie, **when** the configured `tieBreakingRule = 'organizer_decision'`, **then** the matchup transitions to `tieStatus = 'organizer_decision_pending'`, a `matchup.tie-resolution-required` event is appended, the admin room receives the broadcast within 10 seconds, and the **public** room does NOT (the audience sees no diagnostic until the organizer chooses).

4. **Given** a matchup is `tieStatus = 'organizer_decision_pending'`, **when** the organizer calls `tournament.resolveTie({ matchupId, winnerCompetitorId, reason })` with a non-empty reason ≥ 4 chars, **then** the named competitor is recorded as the winner, `tieStatus` clears to `null`, a `matchup.completed` event is appended with `advancedFromTie: true` and `organizerDecisionReason: reason`, and the broadcast fans out exactly as for an automatic completion. An empty / whitespace reason rejects with `BAD_REQUEST` and `errorCode: TIE_RESOLUTION_REASON_REQUIRED`.

5. **Given** every non-bye matchup in round N has a `winnerCompetitorId IS NOT NULL`, **when** the last winner is recorded inside the same transaction that completed it, **then** round `N+1` matchups are materialized by pairing winners in canonical S-shape order — the winner of `bracketPosition=0` plays the winner of `bracketPosition=1`, position-2 plays position-3, etc. — a `bracket.advanced` event is appended carrying the new round's `BracketMatchupSnapshot[]`, and the new rows obey the same `(competitionId, roundNumber, bracketPosition)` uniqueness as Story 5.1 (idempotent on retry).

6. **Given** the final matchup of the bracket (round `R` where the round contains exactly one non-bye matchup) records a `winnerCompetitorId`, **when** that completion transaction commits, **then** `competitions.status` flips to `'completed'`, `updatedAt` bumps, and a `competition.completed` event is appended with `{ competitionId, championCompetitorId, completedAt }` (FR27).

7. **Given** any of the above state changes occur (matchup completed, bracket advanced, competition completed, tie detected), **when** the corresponding event is committed, **then** the broadcast carries the same payload as the event row, the bracket is reconstructable from `bracket.generated` + the sequence of `vote.submitted` + `matchup.completed` + `matchup.revote-required` + `bracket.advanced` + `competition.completed` events alone (NFR21), and idempotent retries (e.g. duplicate completion calls on the same matchup) are no-ops returning the existing payload.

8. **Given** a vote arrives for a matchup that is already in `tieStatus = 'organizer_decision_pending'` OR is the second submission of the **same** judge's vote (idempotency-by-key path), **when** the server processes it, **then** tally re-evaluation is **skipped** for the organizer-decision case (the matchup is in human-decision limbo) and is **idempotent** for the same-judge case — no duplicate `matchup.completed`, no duplicate round materialization.

9. **Given** I am the organizer in solo mode (`competitions.solo_mode = true`), **when** I cast the deciding vote on a matchup via `submitOrganizerVote` (Story 5.2), **then** completion + advancement + tie handling fire **identically** to the public-judge path — solo mode requires zero special-cased branches in tally / advancement logic.

10. **Given** the organizer or any spectator is connected, **when** the bracket advances to a new round or the competition completes, **then** within 10 seconds (NFR3) `tournament.getBracket` returns the new round's matchups (admin) and `competitions.status === 'completed'` plus `championCompetitorId` is observable via the public-bracket query (Story 6.2 reads it). For Story 5.3, expose the champion via `tournament.getBracket`'s response shape — a new optional `championCompetitorId: string | null` field at the top level.

> **Scope note:** Story 5.3 covers **vote tally + winner selection + tie handling + round materialization + competition completion**. Public bracket UI is **Story 6.2**. Champion celebration animation / podium is **Story 6.2**. The presenter view that announces the winner is **Story 6.3**. Audit-trail UI for organizer tie decisions reuses **Story 4.2's** `audit-trail-panel.tsx` — no new admin UI for the audit log itself.

## Prerequisites

- **Story 5.1 must be merged** — provides `battle_matchups` schema, `generateBracket` helper, and the `bracket.generated` event flow. Story 5.3 reuses `bracketWalk` / `generateBracket` for round 2+ pairing.
- **Story 5.2 must be merged** — provides `votes` table, `submitVote` / `submitOrganizerVote`, `vote.submitted` event, and per-judge socket fan-out. Story 5.3 hooks tally logic into the **post-insert tail** of those mutations.
- The existing `competitions.tieBreakingRule` enum (`'re_vote' | 'organizer_decision'`) is already on the schema (`packages/db/schema/competitions.ts:13`). Story 5.3 starts using it; do not re-add.
- The `audit_trail` table (Story 4.2) is the persistence target for organizer tie decisions — column names and append helpers already exist; this story only writes new entries with `entryType: 'tie_resolution'`.

## Tasks / Subtasks

- [x] Task 1: DB migration + Drizzle schema additions to `battle_matchups` (AC: #2, #3, #4, #7)
  - [x] `packages/db/migrations/0015_add_tie_resolution.sql` (NEW):

    ```sql
    -- Migration 0015 — Story 5.3: Bracket Progression & Winner Determination
    -- Adds tie-resolution metadata to battle_matchups so we can express:
    --   - tieStatus = 'organizer_decision_pending' (waiting for human)
    --   - revoteCount   = how many re-votes this matchup has burned
    --   - organizerDecisionReason / organizerDecisionBy = audit footprint
    DO $$ BEGIN
      CREATE TYPE tie_status AS ENUM ('organizer_decision_pending');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "battle_matchups"
      ADD COLUMN IF NOT EXISTS "tie_status" tie_status,
      ADD COLUMN IF NOT EXISTS "revote_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "organizer_decision_reason" text,
      ADD COLUMN IF NOT EXISTS "organizer_decision_by" text,
      ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

    CREATE INDEX IF NOT EXISTS "idx_battle_matchups_tie_status"
      ON "battle_matchups" ("competition_id", "tie_status")
      WHERE "tie_status" IS NOT NULL;
    ```

    Order matters: `CREATE TYPE` must precede `ALTER TABLE … ADD COLUMN tie_status` per the `pgEnum` rule in `_bmad-output/project-context.md`.

  - [x] `packages/db/schema/battle-matchups.ts` — extend with the new columns (do NOT touch existing columns/indexes; Story 5.1's `uq_battle_matchups_position` stays untouched):
    ```ts
    export const tieStatusEnum = pgEnum('tie_status', ['organizer_decision_pending']);
    // …
    tieStatus: tieStatusEnum('tie_status'),
    revoteCount: integer('revote_count').notNull().default(0),
    organizerDecisionReason: text('organizer_decision_reason'),
    organizerDecisionBy: text('organizer_decision_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ```
    Add `index('idx_battle_matchups_tie_status').on(table.competitionId, table.tieStatus).where(sql\`${table.tieStatus} IS NOT NULL\`)` — partial index keeps the index hot-and-cheap (almost all rows have NULL).

- [x] Task 2: Pure tally + advancement domain (AC: #1, #2, #5)
  - [x] `apps/api/src/modules/competition/domain/vote-tallier.ts` (NEW):

    ```ts
    export interface VoteTally {
      player1: number;
      player2: number;
      tie: number;
      total: number;
    }

    export type TallyOutcome =
      | { kind: 'pending'; tally: VoteTally } // not all judges voted yet
      | { kind: 'winner'; winnerCompetitorId: string; tally: VoteTally }
      | { kind: 'tie'; tally: VoteTally };

    /**
     * Decide a matchup outcome from the votes cast vs. expected judge count.
     * - kind: 'pending'  → fewer than `expectedVotes` votes recorded
     * - kind: 'winner'   → strictly more player1 OR player2 votes (`tie` option votes never advance a competitor)
     * - kind: 'tie'      → all votes in AND no clear majority (player1==player2, OR `tie` outpolls both)
     */
    export function tallyMatchup(args: {
      tally: VoteTally;
      expectedVotes: number;
      competitorAId: string;
      competitorBId: string;
    }): TallyOutcome;
    ```

    Pure function — no DB, no I/O. Mirrors the `bracket-generator.ts` style (Story 5.1) so it can be unit-tested without a database.

  - [x] `apps/api/src/modules/competition/domain/round-builder.ts` (NEW):

    ```ts
    export interface PriorRoundMatchup {
      bracketPosition: number;
      winnerCompetitorId: string;
    }

    export interface NextRoundMatchupInput {
      roundNumber: number;
      bracketPosition: number;
      competitorAId: string;
      competitorBId: string;
      seedA: number | null; // best-effort carry-over from the prior round
      seedB: number | null;
      isBye: false;
    }

    /**
     * Pair the winners of round N (sorted by bracketPosition asc) into round N+1
     * using S-shape pairing: position 0 vs 1 → next position 0; 2 vs 3 → next 1.
     * Carries the winning seed forward for display continuity.
     */
    export function buildNextRound(args: {
      priorRoundNumber: number;
      winners: PriorRoundMatchup[]; // already includes byes (Story 5.1 pre-resolves byes)
      seedByCompetitorId: Map<string, number>;
    }): NextRoundMatchupInput[];
    ```

    Trade-off: deliberately **separate** from `generateBracket` (Story 5.1) because round-1 generation needs **seeded competitor placement** (the NCAA S-shape over a power-of-two bracket) while later rounds need **winner-of-position-K pairing** — different inputs, different invariants. Conflating them invites edge-case bugs.

- [x] Task 3: Internal advancement helper inside the tournament router (AC: #1, #5, #6, #7)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add a private async helper `processMatchupOutcome(tx, input)` invoked from BOTH `submitVote` and `submitOrganizerVote` after their event insert (Story 5.2 lines 2014-2050 and 2473-2510). Helper signature:
    ```ts
    async function processMatchupOutcome(
      tx: PgTx,
      args: {
        competitionId: string;
        matchupId: string;
        organizerClerkId: string | null; // null for public-judge path
      },
    ): Promise<{
      matchupCompleted: MatchupCompletedPayload | null;
      bracketAdvanced: BracketAdvancedPayload | null;
      competitionCompleted: CompetitionCompletedPayload | null;
      tieDetected:
        | { kind: 'revote'; payload: MatchupRevoteRequiredPayload }
        | { kind: 'organizer_decision'; payload: MatchupTieResolutionRequiredPayload }
        | null;
    }>;
    ```
    Helper steps:
    1. Re-load the matchup (FOR UPDATE not needed — the calling tx already serialised the vote insert).
    2. **If matchup already has `winnerCompetitorId IS NOT NULL`** OR `tieStatus = 'organizer_decision_pending'` → return all-null (idempotent / human-decision limbo).
    3. Aggregate `votes` rows for the matchup → `VoteTally`.
    4. Compute `expectedVotes = COUNT(judge_sessions WHERE competition_id = X)`. **One** count for the lifetime of the round; do not re-derive per matchup. (Currently fast — judge_sessions is small.)
    5. `outcome = tallyMatchup(...)`.
    6. **`outcome.kind === 'pending'`** → return all-null.
    7. **`outcome.kind === 'winner'`** → UPDATE matchup `winnerCompetitorId`, `completedAt = now()`. Compose `MatchupCompletedPayload` and append `matchup.completed` event. Then call `maybeAdvanceRound(tx, competitionId, roundNumber)` (Task 4) — that helper decides whether to materialize round N+1 OR mark competition complete.
    8. **`outcome.kind === 'tie'`** → branch on `competitions.tieBreakingRule`:
       - `'re_vote'`: `DELETE FROM votes WHERE matchup_id = X`, `UPDATE battle_matchups SET revote_count = revote_count + 1`, append `matchup.revote-required` event with `{ matchupId, revoteCount: new value, tally }`.
       - `'organizer_decision'`: `UPDATE battle_matchups SET tie_status = 'organizer_decision_pending'`, append `matchup.tie-resolution-required` event with `{ matchupId, tally }`.
    9. Return the populated payloads so the **caller** can broadcast post-commit (mirror Story 5.2's `broadcastPayload` pattern — never broadcast inside the tx).
  - [x] In `submitVote` and `submitOrganizerVote`: call `processMatchupOutcome` AFTER the existing `vote.submitted` event insert. Hoist the result up to the post-commit broadcast section. Sequence numbers consumed inside the helper must be allocated **monotonically**: re-read `MAX(sequence)` once per event the helper appends, OR pre-reserve a small block (≤4 sequences). Recommended: re-read each time — the cost is one indexed scan per appended event and matches the precedent in `submitScore` / `submitVote`.
  - [x] **Concurrency guard:** wrap the helper body in `pg_advisory_xact_lock(hashtext('matchup-outcome:' || matchup_id))` (Story 4.4 pattern) so two concurrent vote submissions on the same matchup serialize on outcome computation. Without this, two judges casting simultaneously can both see "all votes in" and both try to write `matchup.completed`.

- [x] Task 4: Round-advancement helper (AC: #5, #6)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add private helper `maybeAdvanceRound(tx, competitionId, justCompletedRound)`:
    1. Count remaining matchups in `justCompletedRound` with `winnerCompetitorId IS NULL`. If > 0 → return `{ bracketAdvanced: null, competitionCompleted: null }`.
    2. Pull all winners + bye-winners from `justCompletedRound` ordered by `bracketPosition ASC`.
    3. **If only one winner total** (i.e., `justCompletedRound` was the final round) → `UPDATE competitions SET status = 'completed', updated_at = now()`. Append `competition.completed` event with `{ competitionId, championCompetitorId, completedAt }`. Return `{ competitionCompleted, bracketAdvanced: null }`.
    4. **Else** → call `buildNextRound(priorRoundNumber: justCompletedRound, winners, seedByCompetitorId)`. INSERT the new matchup rows. Append `bracket.advanced` event with the new round's snapshots. Return `{ bracketAdvanced, competitionCompleted: null }`.
  - [x] Idempotency: the INSERT into `battle_matchups` rides on the existing `uq_battle_matchups_position` unique index. On 23505 → re-read existing rows for the round and re-emit the same payload (mirrors Story 5.1's `existingMatchup` branch).
  - [x] **Bye carry-over edge case:** when a winner in round N is paired with a bye-resolved seed in round N+1, the new row's `competitorBId` may already be filled (Story 5.1 pre-resolves byes). Verify `buildNextRound` only emits matchups where BOTH sides exist — if only one side has a winner, `isBye` would be true but Story 5.1 already pre-materialized byes for round 1 only; for round 2+ all sides should be filled or this is a bug. Add a defensive assertion + structured log if a half-empty pairing is produced.

- [x] Task 5: New `tournament.resolveTie` mutation (AC: #4)
  - [x] `packages/shared/validation/score.schema.ts` — append:
    ```ts
    export const resolveTieSchema = z.object({
      competitionId: z.string().min(1),
      matchupId: z.string().min(1),
      winnerCompetitorId: z.string().min(1),
      reason: z.string().trim().min(4).max(280),
    });
    export type ResolveTieInput = z.infer<typeof resolveTieSchema>;
    ```
    Place alongside `submitOrganizerVoteSchema` so all organizer-side battles inputs cluster in one file.
  - [x] `packages/shared/errors/error-codes.ts` — append:
    - `TIE_RESOLUTION_REASON_REQUIRED: 'TIE_RESOLUTION_REASON_REQUIRED'` — empty/whitespace reason from organizer.
    - `MATCHUP_NOT_TIED: 'MATCHUP_NOT_TIED'` — `tournament.resolveTie` called on a matchup without `tieStatus = 'organizer_decision_pending'`.
    - `WINNER_NOT_IN_MATCHUP: 'WINNER_NOT_IN_MATCHUP'` — provided `winnerCompetitorId` is neither competitor A nor B for this matchup.
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — `protectedProcedure` placed adjacent to `submitOrganizerVote` (battles cluster). Steps:
    1. RLS transaction with `set_config('session.current_organizer_id', ctx.userId, true)`.
    2. Ownership SELECT on `competitions` + `battle_matchups` joined on `competitionId` (single round-trip). Throw `NOT_FOUND` if zero rows.
    3. Guards: `tieStatus !== 'organizer_decision_pending'` → `MATCHUP_NOT_TIED`. `winnerCompetitorId !== competitorAId && winnerCompetitorId !== competitorBId` → `WINNER_NOT_IN_MATCHUP`.
    4. UPDATE matchup with `winnerCompetitorId`, `tieStatus = NULL`, `organizerDecisionReason`, `organizerDecisionBy = ctx.userId`, `completedAt = now()`.
    5. INSERT into `audit_trail` (Story 4.2 schema): `{ competitionId, entryType: 'tie_resolution', actor: ctx.userId, payload: { matchupId, winnerCompetitorId, reason } }`. Re-use the audit insert helper if Story 4.2 extracted one; otherwise inline with a `// see Story 4.2` comment.
    6. Append `matchup.completed` event with `advancedFromTie: true, organizerDecisionReason`. Append a same-tx `bracket.advanced` OR `competition.completed` event by calling `maybeAdvanceRound`.
    7. Post-commit: broadcast `matchup.completed` + (optional) `bracket.advanced` / `competition.completed`.
  - [x] **Why a separate mutation rather than a `submitOrganizerVote` overload?** Same rationale as Story 4.4 / 5.2: distinct UX (free-text reason), distinct authorization surface (organizer-only, not via judge token), distinct audit-trail entry. Keep mutations narrowly-typed.

- [x] Task 6: Shared event types + Socket.IO event-map additions (AC: #1, #2, #3, #4, #5, #6, #7, #10)
  - [x] `packages/shared/events/tournament-events.ts` — append (vote events live in `scoring-events.ts`; bracket-progression events live alongside `bracket.generated` here):

    ```ts
    export interface MatchupCompletedPayload {
      competitionId: string;
      matchupId: string;
      roundNumber: number;
      bracketPosition: number;
      winnerCompetitorId: string;
      tally: { player1: number; player2: number; tie: number; total: number };
      advancedFromTie: boolean;
      organizerDecisionReason: string | null;
      completedAt: string; // ISO 8601
    }

    export interface MatchupRevoteRequiredPayload {
      competitionId: string;
      matchupId: string;
      revoteCount: number;
      tally: { player1: number; player2: number; tie: number; total: number };
      detectedAt: string;
    }

    export interface MatchupTieResolutionRequiredPayload {
      competitionId: string;
      matchupId: string;
      tally: { player1: number; player2: number; tie: number; total: number };
      detectedAt: string;
    }

    export interface BracketAdvancedPayload {
      competitionId: string;
      roundNumber: number; // the NEW round being materialized
      matchups: BracketMatchupSnapshot[]; // reuses Story 5.1 type
      advancedAt: string;
    }

    export interface CompetitionCompletedPayload {
      competitionId: string;
      championCompetitorId: string;
      completedAt: string;
    }
    ```

    Plus matching `*Event` envelope types (mirror Story 5.1 `BracketGeneratedEvent`).

  - [x] `packages/shared/events/socket-event-map.ts` — add to `ServerToClientEvents`:
    ```ts
    'matchup.completed': (data: MatchupCompletedPayload) => void;
    'matchup.revote-required': (data: MatchupRevoteRequiredPayload) => void;
    'matchup.tie-resolution-required': (data: MatchupTieResolutionRequiredPayload) => void;
    'bracket.advanced': (data: BracketAdvancedPayload) => void;
    'competition.completed': (data: CompetitionCompletedPayload) => void;
    ```
  - [x] `packages/shared/index.ts` — `./events/tournament-events` already re-exports — verify the new payload types are picked up.

- [x] Task 7: WebSocket gateway broadcast methods (AC: #1, #3, #5, #6)
  - [x] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add 5 methods:
    ```ts
    broadcastMatchupCompleted(competitionId: string, payload: MatchupCompletedPayload): void;
    broadcastMatchupRevoteRequired(competitionId: string, payload: MatchupRevoteRequiredPayload): void;
    broadcastMatchupTieResolutionRequired(competitionId: string, payload: MatchupTieResolutionRequiredPayload): void;
    broadcastBracketAdvanced(competitionId: string, payload: BracketAdvancedPayload): void;
    broadcastCompetitionCompleted(competitionId: string, payload: CompetitionCompletedPayload): void;
    ```
  - [x] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — fan-out matrix:
        | Event | admin | public | per-judge |
        |-----------------------------------------|:-----:|:------:|:---------:|
        | `matchup.completed` | ✓ | ✓ | ✓ |
        | `matchup.revote-required` | ✓ | — | ✓ | (judges must re-cast; spectators see no diagnostic)
        | `matchup.tie-resolution-required` | ✓ | — | — | (organizer-only alert)
        | `bracket.advanced` | ✓ | ✓ | ✓ |
        | `competition.completed` | ✓ | ✓ | ✓ |
        Reuse the per-judge fan-out pattern from Story 5.2's review fix (`broadcastVoteSubmitted` lines 458-477) — iterate `judgePresence.get(competitionId)` keys and chain `.to(...)`.
  - [x] **Mock gateway coverage**: add `vi.fn()` for ALL FIVE methods to `mockGateway` (top of `tournament.router.spec.ts`) AND `makeFullGateway()`. Stories 4.3 / 5.1 / 5.2 each forgot a new gateway method on first pass — preempt the recurring miss.

- [x] Task 8: Extend `tournament.getBracket` response (AC: #5, #10)
  - [x] Current shape returns `{ matchups: [...] }`. Extend with:
    ```ts
    {
      matchups: BracketMatchupRow[]; // unchanged shape from Story 5.1 + new tie columns
      championCompetitorId: string | null; // populated when status === 'completed'
      currentRoundNumber: number | null;   // highest round with at least one unresolved non-bye matchup; null when complete
    }
    ```
    Drives the admin `BracketViewPanel` round indicator and unblocks Story 6.2's public bracket (it consumes the same query via a public variant).
  - [x] **Backwards-compat:** `BracketViewPanel` (Story 5.1) currently destructures `matchups` from the response — adding optional fields is safe. Verify the existing component still renders correctly post-change.

- [x] Task 9: Frontend — admin tie-resolution UI (AC: #3, #4)
  - [x] `apps/web/src/components/admin/tie-resolution-banner.tsx` (NEW):
    - Subscribes to `useAdminSocket`'s new `onMatchupTieResolutionRequired` callback (Task 12) AND polls `tournament.getBracket` for `tieStatus = 'organizer_decision_pending'` rows on mount.
    - Renders a fixed top-of-panel banner per pending matchup: competitor names, tally summary, two "Pick winner" buttons + a `<textarea>` for the reason (min 4 chars).
    - Calls `tournament.resolveTie.useMutation()` on submit. On success: invalidate `getBracket` and dismiss the banner.
    - Empty state: returns `null` when no matchups are pending — don't reserve dashboard real estate.
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — render `<TieResolutionBanner competitionId={id} />` ABOVE `<BracketViewPanel />` (and ABOVE `<BattlesVotingPanel />`) so it's the first thing the organizer sees when battles are stuck.
  - [x] **Audit-trail entry surfacing:** the new `tie_resolution` audit-trail entries appear automatically in `<AuditTrailPanel />` (Story 4.2) without modification — Story 4.2's panel renders all entry types. Verify formatting in the manual test (Task 16).

- [x] Task 10: Frontend — judge re-vote UX (AC: #2)
  - [x] `apps/web/src/components/judge/battles-voting-screen.tsx` — extend `useJudgeSocket` opts with `onMatchupRevoteRequired`. Handler invalidates `getBattlesAssignment`. The matchup will re-appear because Task 3's helper deletes votes, so the judge's "voted" filter no longer excludes it.
  - [x] Add a transient inline notice: `"Tied vote — re-voting on this matchup."` (yellow, dismissible after 4s). State shape: `revoteNotice: boolean` set by the socket handler, cleared by a `setTimeout`.
  - [x] **Concurrency invariant:** when the same judge had voted "tie" → matchup tied → revote required, their localStorage offline queue (Story 3.5) does NOT need clearing — the queue tracks their **own** submissions which already drained. No queue mutation needed.

- [x] Task 11: Frontend — completion / champion display hand-off (AC: #6, #10)
  - [x] `apps/web/src/components/admin/bracket-view-panel.tsx` — when `getBracket().championCompetitorId !== null`, render a "🏆 Champion: {name}" banner at the top of the panel. (Public-facing celebration UI is Story 6.2's job; admin gets a basic ack here.)
  - [x] **No new public-facing component**: spectators read champion state via Story 6.2's bracket page once it ships. For Story 5.3 MVP, the `competition.completed` socket event is wired to invalidate `getBracket` for any admin/public listener, and that's enough.

- [x] Task 12: Extend `useAdminSocket` + `useJudgeSocket` + `usePublicSocket` (AC: #2, #3, #5, #6, #7)
  - [x] `apps/web/src/hooks/use-admin-socket.ts` — add ALL FIVE new callbacks:
    ```ts
    onMatchupCompleted?: (p: MatchupCompletedPayload) => void;
    onMatchupRevoteRequired?: (p: MatchupRevoteRequiredPayload) => void;
    onMatchupTieResolutionRequired?: (p: MatchupTieResolutionRequiredPayload) => void;
    onBracketAdvanced?: (p: BracketAdvancedPayload) => void;
    onCompetitionCompleted?: (p: CompetitionCompletedPayload) => void;
    ```
    Wire matching `socket.on(...)` registrations.
  - [x] `apps/web/src/hooks/use-judge-socket.ts` — add `onMatchupCompleted`, `onMatchupRevoteRequired`, `onBracketAdvanced`, `onCompetitionCompleted` (NOT `onMatchupTieResolutionRequired` — judges don't get that event). On any of these, the page invalidates `getBattlesAssignment`.
  - [x] `apps/web/src/hooks/use-public-socket.ts` — add `onMatchupCompleted`, `onBracketAdvanced`, `onCompetitionCompleted`. Public spectators see no tie diagnostics.
  - [x] `apps/web/src/components/admin/dashboard-live-island.tsx` — wire all 5 admin callbacks to invalidate the appropriate queries (`getBracket`, `getCompetition`).

- [x] Task 13: Backend tests — pure domain (AC: #1, #2, #5)
  - [x] `apps/api/src/modules/competition/domain/vote-tallier.spec.ts` (NEW) — every branch of `tallyMatchup`:
    - 0 of 3 votes → `pending`.
    - 2 of 3 player1, 1 player2, 0 tie → `winner: A` (clear majority, all voted).
    - 1 player1, 1 player2, 1 tie (3 of 3) → `tie` (no plurality winner).
    - 2 player1, 2 player2 (4 of 4) → `tie` (split).
    - 3 of 5 player1 → still `pending` UNTIL all 5 vote (mathematical-majority short-circuit is **out of scope** for MVP — the AC says "all assigned judges have voted").
    - 5 votes total, 3 tie 1 player1 1 player2 → `tie`.
  - [x] `apps/api/src/modules/competition/domain/round-builder.spec.ts` (NEW):
    - 4 winners → 2 next-round matchups, S-shape pairing (pos 0 vs 1, pos 2 vs 3).
    - 2 winners → 1 next-round matchup (final).
    - 8 winners → 4 next-round matchups, all paired correctly, seeds carried over.
    - Single winner (final round outcome) → empty array (caller treats this as competition-complete).
    - Empty input → empty array.
    - **Bye carry-over**: round 1 had 5 qualifiers + 3 byes. Verify round-2 pairing uses the bye-resolved competitors (Story 5.1's pre-resolved `winnerCompetitorId`).

- [x] Task 14: Backend tests — `processMatchupOutcome` integration through `submitVote` / `submitOrganizerVote` / `resolveTie` (AC: #1-#9)
  - [x] Extend `apps/api/src/trpc/routers/tournament.router.spec.ts`:
    - **Pending → no-op**: vote submitted, only 1 of 3 expected → no `matchup.completed` event, no broadcast.
    - **Winner clear**: 2 player1 votes of 3 expected, 3rd vote arrives → `matchup.completed` written, `broadcastMatchupCompleted` called once, `winnerCompetitorId = competitorAId`.
    - **Tie + re_vote**: tally is 1/1/1 → votes deleted, `revoteCount = 1`, `matchup.revote-required` event + broadcast.
    - **Tie + organizer_decision**: tally split → `tieStatus = 'organizer_decision_pending'` set, `matchup.tie-resolution-required` event + admin-only broadcast (assert public-room emit NOT called).
    - **Round advancement**: last winner of round 1 (4-matchup bracket) triggers `bracket.advanced` with 2 round-2 matchups + `broadcastBracketAdvanced` once.
    - **Competition completion**: final-round winner → `competitions.status = 'completed'`, `competition.completed` event + broadcast, `championCompetitorId` returned by `getBracket`.
    - **Idempotent retry**: same judge re-submits same idempotency key on a now-completed matchup → no duplicate `matchup.completed`, no duplicate broadcast.
    - **Already-resolved tie limbo**: vote arrives on `tieStatus = 'organizer_decision_pending'` matchup → tally re-evaluation skipped (no broadcasts beyond `vote.submitted`).
    - **`resolveTie` happy path**: organizer picks winner with reason → matchup completes, audit-trail row appended, `tieStatus` cleared.
    - **`resolveTie` validation**: empty reason → `TIE_RESOLUTION_REASON_REQUIRED`. winnerCompetitorId outside matchup → `WINNER_NOT_IN_MATCHUP`. Non-tied matchup → `MATCHUP_NOT_TIED`. `caller(null).resolveTie(...)` → `UNAUTHORIZED`.
    - **Solo-mode parity (AC #9)**: organizer's `submitOrganizerVote` triggers identical advancement / tie / completion paths — assert via the same fixtures.
    - **`getBracket` extended shape**: returns `championCompetitorId` populated post-completion; returns `currentRoundNumber` correctly during mid-bracket states.

- [x] Task 15: Frontend tests (AC: #2, #3, #4, #6, #10)
  - [x] `apps/web/src/components/admin/tie-resolution-banner.spec.tsx` (NEW):
    - Renders nothing when no pending tie.
    - Fetches pending matchups from `getBracket`, renders one banner per matchup.
    - Empty / whitespace reason → submit button disabled.
    - Submitting calls `resolveTie` mutation with `{ competitionId, matchupId, winnerCompetitorId, reason }` and invalidates `getBracket`.
    - Receives `matchup.tie-resolution-required` socket event mid-mount → banner appears without page refresh.
  - [x] `apps/web/src/components/judge/battles-voting-screen.spec.tsx` — extend with:
    - Receives `matchup.revote-required` socket event → invalidates `getBattlesAssignment` → re-renders the same matchup with re-vote notice.
    - Receives `matchup.completed` for a matchup the judge voted on → assignment query invalidates.
  - [x] `apps/web/src/components/admin/bracket-view-panel.spec.tsx` — extend:
    - When `championCompetitorId !== null`, banner with the competitor name is visible.
    - When `currentRoundNumber === 2`, the round indicator shows "Round 2".
  - [x] `apps/web/src/hooks/use-admin-socket.spec.ts` + `use-judge-socket.spec.ts` + `use-public-socket.spec.ts` — coverage for every new listener (one test each).

- [x] Task 16: Manual verification & CI
  - [x] `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — must be green across api / web / shared / db / format-cypher-battles.
  - [x] Manual flow (with Stories 5.1 + 5.2 merged):
    1. Create a competition with `tieBreakingRule = 're_vote'`, register 5 active competitors, generate 1 judge link.
    2. Complete cypher (or use solo mode), confirm bracket generates (4 matchups, 3 byes).
    3. Cast votes from 3 different sessions (or 3 admin solo-votes) such that round-1 matchup is `1/1/1` → verify `matchup.revote-required` UI; verify all `votes` rows for that matchup were deleted.
    4. Re-vote so player1 wins decisively → verify `matchup.completed` + immediate round-2 materialization (or competition completion in tiny brackets).
    5. Switch tie-breaking to `'organizer_decision'` on a fresh competition. Force a tie. Verify `<TieResolutionBanner />` appears. Submit reason "Player 1 had cleaner footwork." → verify matchup completes with `advancedFromTie: true`, audit-trail entry visible in `<AuditTrailPanel />`.
    6. Drive the bracket to a single champion → verify `competitions.status = 'completed'`, `championCompetitorId` exposed via `getBracket`, admin panel shows the trophy banner.
    7. DB inspection: every state change has a corresponding event row (`matchup.completed`, `matchup.revote-required`, `matchup.tie-resolution-required`, `bracket.advanced`, `competition.completed`). No event rows are ever updated/deleted.

## Dev Notes

### Tally trigger: post-vote-insert, not periodic

`processMatchupOutcome` runs synchronously inside the `submitVote` / `submitOrganizerVote` / `resolveTie` transactions, immediately after the relevant insert. No background workers, no polling. Three reasons:

1. **Latency budget** — NFR3 mandates sub-10s public update. A periodic worker would add scheduling jitter on top of network latency. Synchronous tally is bounded by the calling mutation's own SLA.
2. **Atomicity** — the bracket invariant ("every matchup with `winnerCompetitorId IS NOT NULL` has a `matchup.completed` event in the same competition's event stream") is preserved by writing both rows in one transaction. A worker would need a separate idempotency mechanism.
3. **Concurrency** — the advisory lock keyed on `matchup-outcome:{matchupId}` (Story 4.4 pattern) serializes simultaneous votes naturally. A worker would need its own lock + a queue table.

The trade-off: a vote submission's tail latency now includes the tally + (optional) round-materialization + (optional) competition-completion writes. Empirically this is ≤2 INSERTs and ≤1 UPDATE for the common case (no advancement) and ≤8 INSERTs for the once-per-competition completion path. Acceptable.

[Source: `_bmad-output/implementation-artifacts/4-4-solo-scoring-mode-and-phase-transition-control.md` advisory-lock pattern; Story 5.2 post-commit broadcast pattern; PRD NFR3]

### Tie definition (the subtle case)

A matchup is "tied" when **all** assigned judges have voted AND no clear `player1` or `player2` majority exists. Three sub-cases collapse to "tie":

| `player1` | `player2` | `tie` | total | Outcome                                                                                                   |
| --------: | --------: | ----: | ----: | --------------------------------------------------------------------------------------------------------- |
|         2 |         2 |     0 |     4 | tie (split)                                                                                               |
|         1 |         1 |     1 |     3 | tie (split + tie option)                                                                                  |
|         0 |         0 |     3 |     3 | tie (everyone said "tie")                                                                                 |
|         2 |         0 |     1 |     3 | **player1 wins** (strict plurality of named-competitor votes — `tie` option doesn't block a clear winner) |

The fourth row is the deliberate design choice: a `tie` vote is a judge declaring "I can't pick"; it does NOT veto a clear winner from the judges who could pick. This matches breaking competition culture — judges who pass don't override judges who decide.

[Source: PRD FR23 ("majority vote"), FR24 ("tie votes"); ux-design-specification.md L33-58 judge UX]

### Round materialization happens inside the completion transaction

The moment the last winner of round N is recorded, round N+1 is INSERTed in the **same transaction**. The `bracket.advanced` event row carries `roundNumber = N+1` so the admin / public WS clients can refetch and display new pairings without ever observing a "blank gap" between rounds.

This collapses a class of timing bugs: if round materialization were a separate transaction, two clients could observe "round 1 fully done" but no round 2 yet, and the bracket UI would briefly look frozen. By coupling the two writes, the only observable states are "round N in progress" or "round N+1 visible" — never an in-between.

[Source: Story 5.1 atomicity rationale (cypherCompletedAt + bracket.generated in one tx); architecture.md L41 NFR1 round-trip budget]

### Idempotency layers (four)

1. **Idempotency-by-key** on votes (Story 5.2 layer) — same key from same judge = no-op.
2. **Idempotency-by-state** on matchup completion — `processMatchupOutcome` returns all-null when `winnerCompetitorId IS NOT NULL`.
3. **Idempotency-by-state** on tie limbo — same helper returns all-null when `tieStatus = 'organizer_decision_pending'`. Late vote arrivals do NOT re-trigger tally.
4. **Idempotency-by-conflict** on round materialization — `uq_battle_matchups_position` rejects duplicate INSERTs; the catch path re-reads existing rows and re-emits the same payload (Story 5.1 precedent).

[Source: Story 5.1 dev notes "Idempotency-by-state vs. idempotency-by-conflict"; Story 5.2 dev notes "three layers of defense"]

### Why `tournament.resolveTie` is its own mutation

Three options were considered:

1. **Reuse `submitOrganizerVote`** with a special `vote: 'organizer_decision'` value — rejected because it conflates two different audit-trail intents (a normal vote vs. a discretionary override).
2. **Overload `submitVote` with a flag** — rejected because public-token callers must never have the ability to break ties.
3. **Dedicated mutation** — chosen. Distinct authorization (Clerk-protected, not token-protected), distinct payload (mandatory reason), distinct audit-trail entry type. Mirrors Story 4.2's `overrideScore` pattern.

[Source: `_bmad-output/implementation-artifacts/4-2-score-override-and-immutable-audit-trail.md` precedent; project-context.md "no `competitions` namespace" rule]

### Expected-vote count: derivation rule

For Story 5.3 MVP, "all assigned judges" means **`COUNT(*) FROM judge_sessions WHERE competition_id = X`**. This includes the auto-created organizer judge session in solo mode (Story 4.4). Implications:

- A new judge invited mid-battles **increases** the expected count, which can re-open a matchup that previously looked complete (the new judge's vote is required before tally fires). This is the deliberate semantics for MVP — re-opening a matchup is rare in practice (organizers don't typically add judges mid-bracket) and correct: a new voter changes the math.
- A withdrawn judge does NOT decrement the expected count for MVP — judge withdrawal is out of scope (no "withdraw judge" mutation exists). If/when a future story adds judge withdrawal, this rule must be revisited.

[Source: Story 5.2 dev note "all `judge_sessions` rows for a competition are eligible to vote in battles"; PRD FR23]

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md`:

1. **Advisory lock keying** — `pg_advisory_xact_lock(hashtext('matchup-outcome:' || matchup_id))` MUST be inside the same tx as the tally + UPDATE + event-INSERT chain. Lock outside the tx = no protection. Different lock key per matchup so unrelated matchups don't serialize.
2. **`updatedAt: new Date()`** on every UPDATE to `competitions` (status flip on completion). Same rule for `battle_matchups` — verify Story 5.1's schema has `updatedAt`; if not, do not retroactively add it in this story (out of scope).
3. **`SET LOCAL session.current_organizer_id`** required for `resolveTie` (protectedProcedure). NOT required for `submitVote` (public, no organizer context); `submitOrganizerVote` already sets it (Story 5.2 line 2304).
4. **Mock gateway**: 5 new `vi.fn()` entries — `broadcastMatchupCompleted`, `broadcastMatchupRevoteRequired`, `broadcastMatchupTieResolutionRequired`, `broadcastBracketAdvanced`, `broadcastCompetitionCompleted`. Add to BOTH `mockGateway` AND `makeFullGateway` from the start.
5. **Auth tests required**: `caller(null).tournament.resolveTie(...)` → `UNAUTHORIZED`. Public mutations (`submitVote`, `submitOrganizerVote`) inherit Story 5.2's existing auth coverage.
6. **Zod tests required**: `resolveTie` reason `<4 chars`, `>280 chars`, whitespace-only — all reject.
7. **TanStack Query v5**: bracket-completion / round-advancement state is derived from `getBracket().championCompetitorId` and `currentRoundNumber`. NEVER use `onSuccess` on `useQuery`.
8. **Event-store immutability** — the new event types are append-only. Never UPDATE / DELETE event rows. Compensating events are out of scope (no story requires them yet).
9. **`@base-ui/react` not Radix** — the tie-resolution textarea uses plain `<textarea>` + Tailwind classes. No `<Button asChild>`.
10. **`react-hooks/set-state-in-effect`** — the tie-resolution banner reads `getBracket()` data and renders directly. If you reach for `useState(initialFromQuery)` in a `useEffect`, switch to the split-component pattern (project-context rule).
11. **Discriminated union for `QueuedSubmission`** (Story 5.2 layer) — Story 5.3 does NOT introduce new queued types. Re-vote requires the judge to manually re-cast (no auto-replay from queue).
12. **No new dependencies** — implementable with Drizzle, Zod, nanoid, native Postgres advisory locks. Do NOT add a tournament-state-machine library.

### Existing Infrastructure (Verified — do NOT re-implement)

From Story 5.1:

- `bracket-generator.ts` (`generateBracket`, `bracketWalk`) — extend the **mental model** of S-shape pairing into the new `round-builder.ts`; do not modify.
- `battle_matchups` schema with `(competitionId, roundNumber, bracketPosition)` unique index — round-2+ rows reuse it.
- `bracket.generated` event flow + `getBracket` query.
- `BracketViewPanel` admin component — extend with champion banner + round indicator.

From Story 5.2:

- `votes` table + `vote.submitted` event + per-judge gateway fan-out.
- `submitVote` / `submitOrganizerVote` mutations — Story 5.3 hooks new behavior into their tails.
- `useJudgeSocket` / `useAdminSocket` / `useOfflineQueue` — extend with new event listeners.
- React act() + JSDOM test setup — reuse for new component specs.

From Story 4.2 (Score Override & Audit Trail):

- `audit_trail` table + insert helper. Story 5.3 writes `entryType: 'tie_resolution'` rows.
- `<AuditTrailPanel />` — automatically renders the new entry type once it appears in DB.

From Story 4.4 (Solo Mode):

- `pg_advisory_xact_lock(hashtext(...))` pattern — reused with a different key (`matchup-outcome:` instead of `org-session:`).
- `submitOrganizerScore` find-or-create-organizer-session pattern — reused indirectly (Story 5.2 already extended it for `submitOrganizerVote`; no new session work in this story).

### Project Structure Notes

**New files:**

```
packages/db/migrations/0015_add_tie_resolution.sql                    (new — migration)
apps/api/src/modules/competition/domain/vote-tallier.ts               (new — pure tally fn)
apps/api/src/modules/competition/domain/vote-tallier.spec.ts          (new)
apps/api/src/modules/competition/domain/round-builder.ts              (new — pure pairing fn)
apps/api/src/modules/competition/domain/round-builder.spec.ts         (new)
apps/web/src/components/admin/tie-resolution-banner.tsx               (new — organizer tie UI)
apps/web/src/components/admin/tie-resolution-banner.spec.tsx          (new)
```

**Modified files:**

```
packages/db/schema/battle-matchups.ts                                 (add tieStatus, revoteCount, organizerDecision*, completedAt)
packages/shared/validation/score.schema.ts                            (resolveTieSchema)
packages/shared/errors/error-codes.ts                                 (TIE_RESOLUTION_REASON_REQUIRED, MATCHUP_NOT_TIED, WINNER_NOT_IN_MATCHUP)
packages/shared/events/tournament-events.ts                           (5 new payloads + envelopes)
packages/shared/events/socket-event-map.ts                            (5 new ServerToClientEvents entries)
apps/api/src/modules/websocket/competition-gateway.interface.ts       (5 broadcast methods)
apps/api/src/modules/websocket/gateways/competition.gateway.ts        (5 implementations + judge-room fan-out reuse)
apps/api/src/modules/websocket/gateways/competition.gateway.spec.ts   (5 broadcast tests)
apps/api/src/trpc/routers/tournament.router.ts                        (processMatchupOutcome + maybeAdvanceRound helpers; resolveTie mutation; getBracket extension; new imports)
apps/api/src/trpc/routers/tournament.router.spec.ts                   (mock gateway extensions; describe blocks for new behavior; resolveTie coverage)
apps/web/src/app/(admin)/competitions/[id]/page.tsx                   (render TieResolutionBanner above other panels)
apps/web/src/components/admin/bracket-view-panel.tsx                  (champion banner + round indicator)
apps/web/src/components/admin/bracket-view-panel.spec.tsx             (new assertions)
apps/web/src/components/admin/dashboard-live-island.tsx               (wire 5 new admin callbacks → invalidations)
apps/web/src/components/judge/battles-voting-screen.tsx               (wire onMatchupRevoteRequired + transient notice)
apps/web/src/components/judge/battles-voting-screen.spec.tsx          (re-vote + matchup-completed coverage)
apps/web/src/hooks/use-admin-socket.ts                                (5 new callbacks + listeners)
apps/web/src/hooks/use-admin-socket.spec.ts                           (5 new listener tests)
apps/web/src/hooks/use-judge-socket.ts                                (4 new callbacks; no tie-resolution-required for judges)
apps/web/src/hooks/use-judge-socket.spec.ts                           (4 new listener tests)
apps/web/src/hooks/use-public-socket.ts                               (3 new callbacks: matchup.completed, bracket.advanced, competition.completed)
apps/web/src/hooks/use-public-socket.spec.ts                          (CREATE if absent — 3 new listener tests)
_bmad-output/implementation-artifacts/sprint-status.yaml              (story status transitions)
```

**Alignment with unified project structure:**

- Pure domain logic in `apps/api/src/modules/competition/domain/` — same folder as Story 5.1's `bracket-generator.ts`. Two new pure modules joining the same neighbor.
- Tie-resolution UI lives in `apps/web/src/components/admin/` — same folder as Story 4.2's `audit-trail-panel.tsx` and Story 5.1's `bracket-view-panel.tsx`.
- New socket events follow the dot-namespace convention (`matchup.*`, `bracket.*`, `competition.*`) established by `score.submitted`, `vote.submitted`, `bracket.generated`.

**Detected variances:**

- Architecture L905 alludes to `competition/engines/battles` for FR20-FR27. Story 5.1 chose `domain/` instead (closer to DDD vocabulary). Story 5.3 sticks with the established `domain/` location for consistency. Documented in code comment at the top of `vote-tallier.ts`.

### Testing Standards

- **Test framework**: Vitest (api: node, web: jsdom). API tests use `mockDb` + `caller()` helpers from `tournament.router.spec.ts`. Pure domain tests use no mocks.
- **Pure unit tests are the primary coverage** for tally + round-builder logic. Every branch in `tallyMatchup` and `buildNextRound` gets a dedicated test. The integration tests through `submitVote` are layered on top to verify wiring, not algorithmic correctness.
- **Integration tests**: extend `tournament.router.spec.ts`; do NOT create a new router spec file. Group under `describe('tournament.processMatchupOutcome', …)`, `describe('tournament.maybeAdvanceRound', …)` (testing them transitively through `submitVote` / `resolveTie`), `describe('tournament.resolveTie', …)`.
- **Frontend tests**: JSDOM + manual `createRoot` + `act` (matching Story 5.2's pattern). New gateway-level test in `competition.gateway.spec.ts` for the 5 broadcast methods (assert correct rooms targeted).
- **Coverage target**: every branch in `processMatchupOutcome` (pending, winner, tie+revote, tie+organizer, idempotent-already-completed, idempotent-already-tied). Every branch in `resolveTie` (happy path, MATCHUP_NOT_TIED, WINNER_NOT_IN_MATCHUP, TIE_RESOLUTION_REASON_REQUIRED, NOT_FOUND, UNAUTHORIZED).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` L845-873 — Story 5.3 ACs + FR/NFR mapping]
- [Source: `_bmad-output/planning-artifacts/prd.md` FR23-FR27, FR9 (tie-breaking config), NFR3 (10s budget), NFR21 (event-sourcing reconstruction)]
- [Source: `_bmad-output/planning-artifacts/architecture.md` L32 (FR20-FR27 state machine), L585 (event envelope), L1115 (battles → scoring/format-runtime)]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` L33-58 — judge UX requirements (notice timing, target sizes)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1882-2053` — `submitVote` (mirror; tail extends with processMatchupOutcome)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:2298-2512` — `submitOrganizerVote` (mirror)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1184-1283` — `bracket.generated` idempotency-by-conflict precedent]
- [Source: `apps/api/src/modules/competition/domain/bracket-generator.ts` — `bracketWalk`, `generateBracket` (do not modify; use mental model in round-builder)]
- [Source: `packages/db/schema/battle-matchups.ts` — extend, do not break Story 5.1's columns/indexes]
- [Source: `packages/db/schema/competitions.ts:13` — `tieBreakingRuleEnum` (already declared)]
- [Source: `_bmad-output/implementation-artifacts/4-2-score-override-and-immutable-audit-trail.md` — `audit_trail` insert pattern + `<AuditTrailPanel />`]
- [Source: `_bmad-output/implementation-artifacts/4-4-solo-scoring-mode-and-phase-transition-control.md` — `pg_advisory_xact_lock` pattern]
- [Source: `_bmad-output/implementation-artifacts/5-1-battles-bracket-generation.md` — bracket atomicity, idempotency-by-conflict on `uq_battle_matchups_position`]
- [Source: `_bmad-output/implementation-artifacts/5-2-judge-voting-interface-battles-mode.md` — voting + post-commit broadcast pattern + per-judge fan-out reused for new events]
- [Source: `_bmad-output/project-context.md` — entire file; especially the recurring "mock gateway oversight" rule]

### Previous Story Intelligence

**Story 5.2 — Judge Voting Interface (done 2026-05-05):**

1. Recurring mock-gateway oversight: 5.2 fixed `broadcastVoteSubmitted` mock omission. 5.3 has FIVE new broadcasts to wire — pre-empt the same mistake by editing the test mocks **first**.
2. Per-judge fan-out implemented in 5.2's review pass (`broadcastVoteSubmitted` lines 458-477) — reuse the iteration pattern verbatim for the 4 new events that fan to judges.
3. The post-commit broadcast pattern (set `broadcastPayload` inside tx, emit after `await tx.commit()`) is mandatory. Don't broadcast inside the transaction body.
4. `apps/web/src/test-setup.ts` already configures `IS_REACT_ACT_ENVIRONMENT = true` — new component tests inherit it for free.
5. Migration 0014 used `CREATE UNIQUE INDEX` (review fix) instead of `CONSTRAINT UNIQUE` to align with Drizzle's `uniqueIndex(...)` schema. Apply the same convention to Migration 0015.

**Story 5.1 — Battles Bracket Generation (done 2026-05-04):**

1. `uq_battle_matchups_position` carries the round-1 idempotency contract. Reuse for round-2+ inserts in Task 4 — same 23505 → re-read pattern.
2. Byes are pre-resolved (`winnerCompetitorId = competitorAId` at generation time). Round-builder must treat bye-resolved positions as already-winners.
3. Pure-function `bracket-generator.ts` is the precedent for `vote-tallier.ts` and `round-builder.ts` — colocate, no DI, fully unit-tested.

**Story 4.2 — Score Override & Audit Trail (done):**

1. `audit_trail` insert pattern with `entryType` discriminator. New entry type for this story: `'tie_resolution'`. Payload shape per audit-trail freeform JSON column.
2. `<AuditTrailPanel />` reads all entries by `competitionId` — no UI changes needed for the new type to surface.

**Story 4.4 — Solo Mode (done):**

1. `pg_advisory_xact_lock(hashtext(...))` lock-key derivation prevents concurrent races. Use `'matchup-outcome:' || matchup_id` for Story 5.3.
2. The shared organizer judge session (used by `submitOrganizerVote` in 5.2) is the SAME identity recording solo battles votes. Tally treats it like any other judge.

### Git Intelligence (recent commits)

```
ae94735 chore: checkpoint Stories 3.5-5.2 + Story 5.2 review fixes
72e3df7 chore(ci): bump GitHub Actions to Node 24-compatible majors + gate Deploy
8f367e1 fix(ci): remove pnpm version override that conflicts with packageManager
59cc235 chore: checkpoint Stories 2.2-3.4 + CI scaffolding
efc9ca7 Initial commit: competition platform with Epic 1 & Story 2.1 complete
```

The repo uses **checkpoint commits** that bundle multiple stories. Story 5.3 will likely close out Epic 5 alongside its retrospective in a single checkpoint. Plan changes so the diff is bisectable: keep the migration + schema change + domain helpers as one logical unit, the gateway + event-map + router wiring as another, the frontend wiring as another, and the tests interleaved.

### Project Context Reference

`_bmad-output/project-context.md` (52 rules) governs ALL implementation. Story 5.3 introduces no new framework rule, but reinforces:

- **Pure-domain modules under `apps/api/src/modules/competition/domain/`** — pattern established in 5.1, extended in 5.3. Future scoring/tally/state-machine logic should live alongside them.
- **Single-tx tally + advancement** — atomicity invariant for bracket state. If a future story introduces score-tally side effects, follow the same one-tx pattern.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Initial tests green: 278 API + 97 web + 45 cypher-battles + 21 offline-queue.
- After review fixes: 281 API + 97 web (3 new regression tests for review findings H1, M2, M1).
- Turbo CI gate green: `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` → 13/13 tasks pass.

### Completion Notes List

- **Audit-trail strategy**: Story 4.2's audit-trail uses the events table (no separate `audit_trail` table). Tie-resolution audit footprint is captured by `matchup.completed` events with `advancedFromTie: true, organizerDecisionReason` plus the `organizerDecisionReason / organizerDecisionBy` columns on `battle_matchups`. No `entryType: 'tie_resolution'` row is written — this matches the immutable-events-as-truth pattern in CLAUDE rules and Story 4.2's actual implementation.
- **Existing `winnerCompetitorId !== null` guard left in place** in `submitVote` / `submitOrganizerVote` — rejects post-resolution votes with `MATCHUP_ALREADY_RESOLVED`. The helper's "tieStatus = pending" short-circuit covers AC #8's organizer-decision limbo case (vote arrives, tally re-evaluation skipped).
- **Pure-domain split**: `tallyMatchup` and `buildNextRound` colocated under `apps/api/src/modules/competition/domain/` next to `bracket-generator.ts` (Story 5.1 precedent). 18 pure-domain tests, no DB.
- **Helper signature simplified** from the spec slightly: `processMatchupOutcome` returns a single `MatchupOutcomeBroadcasts` object with five nullable payload fields, and `emitMatchupBroadcasts(gateway, …)` does the post-commit fan-out. Equivalent to the spec's per-field payloads but easier to thread through the two callers + `resolveTie`.
- **Mock gateway extended in BOTH places** (`mockGateway` literal at top of `tournament.router.spec.ts` AND `makeFullGateway()`) — preempted the recurring miss called out in Story 5.2.

### Review Fixes Applied (2026-05-05)

Adversarial code review (`/bmad-bmm-code-review`) surfaced 5 issues; all HIGH and MEDIUM fixed in-place:

- **H1 — Sequence-collision crash on new event INSERTs** (`tournament.router.ts`). Added `insertEventOrRetry()` helper that maps `23505` on the events table to `INTERNAL_SERVER_ERROR`, mirroring the pre-existing pattern around `vote.submitted`. Applied to all five new event types (`matchup.completed` in helper + `resolveTie`, `matchup.revote-required`, `matchup.tie-resolution-required`, `bracket.advanced`, `competition.completed`). Without this, two matchups completing concurrently in the same competition (different advisory locks → no serialization on the events sequence) could have crashed the loser tx with an unhandled DB error and rolled back the vote.
- **H2 — Round-N+1 idempotent re-emit drift** (`maybeAdvanceRound`). On `23505` against `uq_battle_matchups_position`, the helper now re-reads the existing round-N+1 rows from the DB and builds `matchupSnapshots` from those, matching Story 5.1's `existingMatchup` precedent. Previously it pushed the in-memory plan, which was correct only by virtue of `buildNextRound`'s determinism.
- **M1 — Silent odd-winner pairing** (`round-builder.ts`). Now logs a structured `console.warn` when `winners.length` is odd, listing the dropped competitor — Story 5.3 Task 4 explicitly required this defensive log.
- **M2 — Cross-competition matchup guard** (`processMatchupOutcome`). Helper now returns `EMPTY_BROADCASTS` if the loaded matchup's `competitionId` doesn't match the caller-provided `competitionId`. Defense-in-depth for future callers.
- **M3 — Empty `bracket.advanced` broadcast** (`maybeAdvanceRound`). Skips event append + broadcast when `buildNextRound` returns `[]`.

LOW items (L1 AC #2 wording, L2 banner socket coupling, L3 lock-before-select ordering, L4 zero-judges silent return) intentionally left as-is — documented design choices or low-cost trade-offs.

Regression tests added:

- `tournament.router.spec.ts` — `Review fix H1: maps 23505 on matchup.completed event insert to INTERNAL_SERVER_ERROR`
- `tournament.router.spec.ts` — `Review fix M2: returns no broadcasts when matchup belongs to a different competition`
- `round-builder.spec.ts` — `warns and drops the unpaired winner when the count is odd (defensive)`

### File List

**New:**

- `packages/db/migrations/0015_add_tie_resolution.sql`
- `apps/api/src/modules/competition/domain/vote-tallier.ts`
- `apps/api/src/modules/competition/domain/vote-tallier.spec.ts`
- `apps/api/src/modules/competition/domain/round-builder.ts`
- `apps/api/src/modules/competition/domain/round-builder.spec.ts`
- `apps/web/src/components/admin/tie-resolution-banner.tsx`
- `apps/web/src/components/admin/tie-resolution-banner.spec.tsx`
- `apps/web/src/hooks/use-public-socket.spec.ts`

**Modified:**

- `packages/db/schema/battle-matchups.ts` (tieStatus enum, revoteCount, organizerDecision\*, completedAt, partial index)
- `packages/shared/validation/score.schema.ts` (resolveTieSchema)
- `packages/shared/errors/error-codes.ts` (TIE_RESOLUTION_REASON_REQUIRED, MATCHUP_NOT_TIED, WINNER_NOT_IN_MATCHUP)
- `packages/shared/events/tournament-events.ts` (5 new payloads + envelopes)
- `packages/shared/events/socket-event-map.ts` (5 new ServerToClientEvents entries)
- `apps/api/src/modules/websocket/competition-gateway.interface.ts` (5 broadcast methods)
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts` (5 implementations + judge-room fan-out reuse)
- `apps/api/src/modules/websocket/gateways/competition.gateway.spec.ts` (5 broadcast tests)
- `apps/api/src/trpc/routers/tournament.router.ts` (processMatchupOutcome, maybeAdvanceRound, nextEventSequence helpers; resolveTie mutation; getBracket extension; submitVote/submitOrganizerVote post-event tally hookup)
- `apps/api/src/trpc/routers/tournament.router.spec.ts` (mock gateway extensions; processMatchupOutcome behavior tests; resolveTie validation + happy-path coverage)
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx` (renders TieResolutionBanner above other panels)
- `apps/web/src/components/admin/bracket-view-panel.tsx` (champion banner + current-round indicator)
- `apps/web/src/components/admin/bracket-view-panel.spec.tsx` (Story 5.3 assertions)
- `apps/web/src/components/admin/dashboard-live-island.tsx` (5 new admin callbacks → invalidations)
- `apps/web/src/components/judge/battles-voting-screen.tsx` (revoteNoticeMatchupId prop + transient notice)
- `apps/web/src/components/judge/battles-voting-screen.spec.tsx` (revote-notice tests)
- `apps/web/src/app/(judge)/judge/[token]/page.tsx` (4 new judge socket callbacks + revote notice state)
- `apps/web/src/hooks/use-admin-socket.ts` (5 new callbacks + listeners)
- `apps/web/src/hooks/use-admin-socket.spec.ts` (5 new listener tests)
- `apps/web/src/hooks/use-judge-socket.ts` (4 new callbacks + listeners — no tie-resolution-required)
- `apps/web/src/hooks/use-judge-socket.spec.ts` (4 new listener tests)
- `apps/web/src/hooks/use-public-socket.ts` (3 new callbacks + listeners — no tie-resolution-required, no revote-required)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition: ready-for-dev → in-progress → review)

## Change Log

- 2026-05-05: Story 5.3 created — battles bracket progression, vote tally, tie-handling (re-vote + organizer-decision), automatic round materialization, competition completion. Builds on Stories 5.1 (bracket structure) and 5.2 (vote capture). Status `backlog → ready-for-dev`. Public bracket UI deferred to Story 6.2; champion celebration deferred to Stories 6.2 / 6.3.
- 2026-05-05: Implemented all 16 tasks. Status `ready-for-dev → in-progress → review`. 278 API tests + 97 web tests pass; full turbo lint/typecheck/test gate green.
- 2026-05-05: Adversarial code review pass. Fixed H1 (sequence-collision crash on 5 new event INSERTs via `insertEventOrRetry` helper), H2 (round-N+1 23505 now re-reads DB rows), M1 (round-builder odd-winner warn), M2 (processMatchupOutcome cross-validates competitionId), M3 (skip empty bracket.advanced). 281 API + 97 web tests pass; turbo gate green. Status `review → done`.
