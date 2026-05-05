# Story 5.2: Judge Voting Interface (Battles Mode)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a judge,
I want to see each Battles matchup on my phone and cast my vote (Player 1 / Player 2 / Tie) with a single tap,
so that I can judge elimination rounds as quickly and confidently as I scored the Cypher phase — with the same offline resilience.

## Acceptance Criteria

1. **Given** the competition has transitioned to the Battles phase (`cypherCompletedAt IS NOT NULL`) and I am an assigned judge, **when** I open my judge invite link, **then** my page automatically renders the **Battles voting UI** instead of the Cypher scoring UI — with no manual navigation, format switch, or page reload (FR31, FR35).

2. **Given** an unresolved round-1 matchup exists that I have not yet voted on, **when** the page loads (or a prior matchup just received my vote), **then** I see both competitors' names rendered in **large, equally-prominent text** alongside three large voting buttons labelled **"Player 1"**, **"Player 2"**, and **"Tie"** (FR21, FR22, FR31).

3. **Given** I tap one of the three voting buttons, **when** my vote is submitted to the server, **then** a confirmation appears within **300ms** under typical 4G conditions and the next unjudged matchup (or "Waiting for next matchup" placeholder) renders automatically — no extra navigation step (NFR2, FR32).

4. **Given** my connection drops between matchups, **when** I cast a vote while offline, **then** the vote is persisted to localStorage with an idempotency key, the UI shows "Queued — will submit when connection returns" (matching the Cypher offline pattern), and the queued vote is **auto-submitted on reconnect** within 5 seconds with no duplication (FR33, NFR6, NFR18).

5. **Given** I am a Battles judge with no remaining unjudged matchups in the current round, **when** I view my screen, **then** I see a **"Waiting for next matchup..."** placeholder — and the screen automatically advances to a new matchup when one becomes available via WebSocket (FR35).

6. **Given** I am a Battles judge, **when** I view my screen at any time, **then** I see **only the current matchup** — no bracket structure, no other competitors, no admin controls, no other judges' votes, and no scoring controls from the Cypher phase (FR35).

7. **Given** I attempt to submit a vote for a matchup that is **already resolved** (e.g., received late after Story 5.3 closed it), or one that does **not exist**, or one that **does not belong to my judge session's competition**, **when** the server processes the request, **then** the mutation rejects with a structured error (`MATCHUP_ALREADY_RESOLVED`, `MATCHUP_NOT_FOUND`, or `MATCHUP_NOT_IN_COMPETITION` respectively) and no vote row or `vote.submitted` event is written.

8. **Given** I tap a voting option twice (or the offline queue retries the same submission), **when** the duplicate request reaches the server, **then** the second submission is treated as **idempotent**: it returns success without creating a duplicate vote row, duplicate `vote.submitted` event, or duplicate broadcast — protected by both `(judge_session_id, idempotency_key)` and `(matchup_id, judge_session_id)` unique indexes.

9. **Given** the competition is in **solo mode** (`competitions.solo_mode = true`) and I am the organizer, **when** I open the admin scoring panel during the Battles phase, **then** I can cast votes on every active matchup directly from the admin UI under my organizer identity — no separate judge link required (FR43, mirrors Story 4.4 AC #1 for cypher).

10. **Given** any vote is successfully recorded, **when** the `vote.submitted` event is appended to the event store, **then** the event payload contains `{ competitionId, matchupId, judgeSessionId, vote, idempotencyKey, submittedAt }`, the bracket is reconstructable from `bracket.generated` + the sequence of `vote.submitted` events alone (NFR21, NFR11), and the same payload is broadcast on the `competition:{id}:admin` and `competition:{id}:judge:{judgeId}` rooms within 10 seconds (NFR3).

> **Scope note:** Story 5.2 covers **vote capture + per-judge UI + offline resilience + admin solo voting**. Tally / majority winner / bracket progression is **Story 5.3**. Tie-breaking under "re-vote" or "organizer decision" is **Story 5.3**. Public bracket display of in-progress matchups is **Story 6.2**. Admin override of votes is **NOT in scope** (no story planned for it; flag if discovered as required).

## Prerequisites

- **Story 5.1 must be merged first.** Story 5.2 imports `battleMatchups` from `@competition-platform/db` and assumes the round-1 matchup rows + `bracket.generated` event flow are live. If 5.1 is in flight: 5.2 development can proceed against the 5.1 PR branch but cannot be merged until 5.1 lands. Do **not** duplicate the migration / Drizzle schema / generator from 5.1.
- The `cypher-battles` format already declares the battles phase (`packages/formats/cypher-battles/src/phases/battles-phase.ts`) with `format: 'single-elimination'`, `voteOptions: ['player1', 'player2', 'tie']`, `requireMajority: true` — Story 5.2 implements the platform-side runtime that consumes this declarative config.

## Tasks / Subtasks

- [x] Task 1: DB migration + Drizzle schema — `votes` table (AC: #2, #7, #8, #10)
  - [x] `packages/db/migrations/0014_add_votes.sql` (NEW):

    ```sql
    -- Migration 0014 — Story 5.2: Judge Voting Interface (Battles Mode)
    -- Append-only votes per battle matchup per judge. Uniqueness on
    -- (matchup_id, judge_session_id) makes a judge's vote final-once;
    -- (judge_session_id, idempotency_key) deduplicates retries.
    CREATE TYPE vote_choice AS ENUM ('player1', 'player2', 'tie');

    CREATE TABLE votes (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      matchup_id TEXT NOT NULL REFERENCES battle_matchups(id) ON DELETE CASCADE,
      judge_session_id TEXT NOT NULL REFERENCES judge_sessions(id) ON DELETE CASCADE,
      vote vote_choice NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX uq_votes_matchup_judge
      ON votes (matchup_id, judge_session_id);
    CREATE UNIQUE INDEX uq_votes_judge_idempotency
      ON votes (judge_session_id, idempotency_key);
    CREATE INDEX idx_votes_competition ON votes (competition_id);
    CREATE INDEX idx_votes_matchup ON votes (matchup_id);

    ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY votes_organizer ON votes
      USING (
        competition_id IN (
          SELECT id FROM competitions
          WHERE organizer_clerk_id = current_setting('session.current_organizer_id', true)
        )
      );
    ```

    Order matters: `CREATE TYPE vote_choice` MUST come before the `CREATE TABLE` that references it (project-context rule on pgEnum).

  - [x] `packages/db/schema/votes.ts` (NEW):

    ```ts
    import { pgTable, text, timestamp, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core';
    import { nanoid } from 'nanoid';
    import { competitions } from './competitions';
    import { battleMatchups } from './battle-matchups';
    import { judgeSessions } from './judge-sessions';

    export const voteChoiceEnum = pgEnum('vote_choice', ['player1', 'player2', 'tie']);

    export const votes = pgTable(
      'votes',
      {
        id: text('id')
          .primaryKey()
          .$defaultFn(() => nanoid(21)),
        competitionId: text('competition_id')
          .notNull()
          .references(() => competitions.id, { onDelete: 'cascade' }),
        matchupId: text('matchup_id')
          .notNull()
          .references(() => battleMatchups.id, { onDelete: 'cascade' }),
        judgeSessionId: text('judge_session_id')
          .notNull()
          .references(() => judgeSessions.id, { onDelete: 'cascade' }),
        vote: voteChoiceEnum('vote').notNull(),
        idempotencyKey: text('idempotency_key').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      },
      (table) => [
        uniqueIndex('uq_votes_matchup_judge').on(table.matchupId, table.judgeSessionId),
        uniqueIndex('uq_votes_judge_idempotency').on(table.judgeSessionId, table.idempotencyKey),
        index('idx_votes_competition').on(table.competitionId),
        index('idx_votes_matchup').on(table.matchupId),
      ],
    );

    export type VoteRow = typeof votes.$inferSelect;
    export type NewVoteRow = typeof votes.$inferInsert;
    ```

  - [x] `packages/db/schema/index.ts` — append `export * from './votes';`. Story 5.1 also adds `export * from './battle-matchups';` so verify both lines exist after this story merges.

- [x] Task 2: Shared validation schemas (AC: #2, #7, #9)
  - [x] `packages/shared/validation/score.schema.ts` — append (placed alongside `submitOrganizerScoreSchema` so vote schemas live in the same scoring/voting validation file):

    ```ts
    export const VOTE_CHOICES = ['player1', 'player2', 'tie'] as const;
    export type VoteChoice = (typeof VOTE_CHOICES)[number];

    export const submitVoteSchema = z.object({
      token: z.string().min(1, 'Judge token is required'),
      matchupId: z.string().min(1, 'Matchup ID is required'),
      vote: z.enum(VOTE_CHOICES),
      idempotencyKey: z.string().min(1, 'Idempotency key is required'),
    });
    export type SubmitVoteInput = z.infer<typeof submitVoteSchema>;

    export const submitOrganizerVoteSchema = z.object({
      competitionId: z.string().min(1, 'Competition ID is required'),
      matchupId: z.string().min(1, 'Matchup ID is required'),
      vote: z.enum(VOTE_CHOICES),
      idempotencyKey: z.string().min(1, 'Idempotency key is required'),
    });
    export type SubmitOrganizerVoteInput = z.infer<typeof submitOrganizerVoteSchema>;
    ```

  - [x] `packages/shared/index.ts` — already re-exports `./validation/score.schema` (line 12). No edit required.

- [x] Task 3: New error codes (AC: #1, #7, #9)
  - [x] `packages/shared/errors/error-codes.ts` — append:
    - `BATTLES_NOT_ACTIVE: 'BATTLES_NOT_ACTIVE'` — competition is not in the battles phase (`cypherCompletedAt IS NULL` or `status !== 'active'`)
    - `MATCHUP_NOT_FOUND: 'MATCHUP_NOT_FOUND'` — `matchupId` does not exist
    - `MATCHUP_NOT_IN_COMPETITION: 'MATCHUP_NOT_IN_COMPETITION'` — judge's competition does not match the matchup's competition (cross-competition vote attempt)
    - `MATCHUP_ALREADY_RESOLVED: 'MATCHUP_ALREADY_RESOLVED'` — `winnerCompetitorId IS NOT NULL` (Story 5.3 closes matchups; reject late votes deterministically)
    - `MATCHUP_IS_BYE: 'MATCHUP_IS_BYE'` — bye matchups auto-advance at generation time and accept no votes (defensive)
    - `VOTE_OUTSIDE_OPTIONS: 'VOTE_OUTSIDE_OPTIONS'` — Zod catches this first, but reserved for any future server-side rejection of malformed vote values
  - [x] Keep alphabetical-ish grouping with the existing scoring codes (`SCORE_*` block).

- [x] Task 4: Shared event types + Socket.IO event map (AC: #10)
  - [x] `packages/shared/events/scoring-events.ts` — append (vote events live in the scoring-events file because they share aggregation responsibility):

    ```ts
    export interface VoteSubmittedPayload {
      competitionId: string;
      matchupId: string;
      judgeSessionId: string;
      vote: 'player1' | 'player2' | 'tie';
      idempotencyKey: string;
      submittedAt: string; // ISO 8601
    }

    export interface VoteSubmittedEvent {
      type: 'vote.submitted';
      aggregateId: string; // competitionId
      aggregateType: 'competition';
      payload: VoteSubmittedPayload;
      createdBy: string; // judgeSessionId
      createdAt: string;
      sequence: number;
    }
    ```

  - [x] `packages/shared/events/socket-event-map.ts` — add to `ServerToClientEvents`:
    ```ts
    'vote.submitted': (data: VoteSubmittedPayload) => void;
    ```
    Import `VoteSubmittedPayload` from `'./scoring-events'`. Story 5.1 also adds `'bracket.generated'`; confirm both new entries are present after both stories merge.
  - [x] `packages/shared/index.ts` — `./events/scoring-events` already re-exports — no change.

- [x] Task 5: WebSocket gateway broadcast method (AC: #3, #10)
  - [x] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add to `ICompetitionGateway`:
    ```ts
    broadcastVoteSubmitted(
      competitionId: string,
      payload: VoteSubmittedPayload,
    ): void;
    ```
    Import `VoteSubmittedPayload` from `@competition-platform/shared`.
  - [x] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — implement:
    ```ts
    broadcastVoteSubmitted(competitionId: string, payload: VoteSubmittedPayload) {
      this.server.to(`competition:${competitionId}:admin`).emit('vote.submitted', payload);
      // All judges in this competition need the event so their UI can advance
      // when their own vote completes (and ignore others' votes — judge sees
      // only the next unjudged matchup). Emit to a competition-wide judge
      // pseudo-room: existing judge rooms are per-judge ('competition:{id}:judge:{judgeId}'),
      // so iterate via a single broadcast to the admin room only AND let the
      // judge's per-judge socket invalidate its own assignment query
      // (server emits per-judge ack via the mutation's tRPC response — no extra
      // gateway emit needed for the voter).
      // RATIONALE for not broadcasting to other judges: each judge's
      // assignment query is keyed off matchups they HAVEN'T voted on; a vote
      // by judge A doesn't change judge B's assignment until Story 5.3
      // closes the matchup. So suppress cross-judge fan-out for this story.
      this.logger.log(`Broadcast vote.submitted for ${competitionId} (matchup=${payload.matchupId})`);
    }
    ```
    > **Note:** The choice to broadcast only to the admin room (and rely on the tRPC mutation response for the voting judge) is a deliberate scope decision. Story 5.3 will broadcast `matchup.completed` to all judges so their assignment queries refresh.
  - [x] **Mock gateway oversight prevention**: add `broadcastVoteSubmitted: vi.fn()` to `mockGateway` at the top of `tournament.router.spec.ts` (currently lines 21-32) AND to any helper that constructs a full mock gateway. Story 4.3 adversarial review caught this exact pattern omission for `broadcastCompetitorWithdrawn` / `broadcastCompetitorRescued`; Story 5.1 caught it again for `broadcastBracketGenerated`. Do not repeat.

- [x] Task 6: Extend `tournament.validateJudgeToken` to surface battles phase (AC: #1)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts:717-760` — extend the response with `cypherCompletedAt: string | null`:
    ```ts
    const [comp] = await db.db
      .select({
        id: competitions.id,
        name: competitions.name,
        status: competitions.status,
        cypherCompletedAt: competitions.cypherCompletedAt, // NEW
      })
      .from(competitions)
      .where(eq(competitions.id, session.competitionId));
    // ...
    return {
      judgeSessionId: session.id,
      label: session.label,
      competitionId: comp.id,
      competitionName: comp.name,
      competitionStatus: comp.status,
      cypherCompletedAt: comp.cypherCompletedAt?.toISOString() ?? null, // NEW
    };
    ```
  - [x] **Backwards-compat note**: this is an additive change. The cypher judge page (`apps/web/src/app/(judge)/judge/[token]/page.tsx`) does not currently read this field — it will start using it in Task 9. No client breakage.

- [x] Task 7: tRPC query — `tournament.getBattlesAssignment` (AC: #2, #5, #6)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — new public procedure (mirrors `getJudgeAssignments` at line 1190 in shape):

    ```ts
    getBattlesAssignment: t.procedure
      .input(z.object({ token: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        enforceRateLimit(`getBattlesAssignment:${ctx.clientIp ?? 'unknown'}`, PUBLIC_RL);
        return db.db.transaction(async (tx) => {
          // 1. Validate token → judge session.
          const hash = createHash('sha256').update(input.token).digest('hex');
          const [session] = await tx
            .select({
              id: judgeSessions.id,
              competitionId: judgeSessions.competitionId,
              label: judgeSessions.label,
            })
            .from(judgeSessions)
            .where(eq(judgeSessions.tokenHash, hash));
          if (!session) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Link not valid' });
          }

          // 2. Battles-phase guard. cypherCompletedAt is the source of truth
          //    for "we are in battles now" because Story 5.1 sets it inside
          //    the same transaction as bracket generation.
          const [comp] = await tx
            .select({
              id: competitions.id,
              status: competitions.status,
              cypherCompletedAt: competitions.cypherCompletedAt,
            })
            .from(competitions)
            .where(eq(competitions.id, session.competitionId));
          if (!comp || comp.status !== 'active' || comp.cypherCompletedAt === null) {
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              battlesActive: false,
              currentMatchup: null,
            };
          }

          // 3. Find the next matchup this judge has NOT yet voted on, that is
          //    NOT a bye, and NOT already resolved. Order by (round_number,
          //    bracket_position) so judges work the bracket in canonical order.
          //    Subquery filter: NOT IN (matchup_ids this judge has already voted on).
          const votedMatchups = await tx
            .select({ matchupId: votes.matchupId })
            .from(votes)
            .where(eq(votes.judgeSessionId, session.id));
          const votedIds = votedMatchups.map((v) => v.matchupId);

          const baseFilter = and(
            eq(battleMatchups.competitionId, session.competitionId),
            eq(battleMatchups.isBye, false),
            // winnerCompetitorId IS NULL — matchup not yet resolved (Story 5.3 sets it).
            sql`${battleMatchups.winnerCompetitorId} IS NULL`,
          );
          const filter =
            votedIds.length > 0
              ? and(baseFilter, sql`${battleMatchups.id} NOT IN ${votedIds}`)
              : baseFilter;

          const [next] = await tx
            .select({
              id: battleMatchups.id,
              roundNumber: battleMatchups.roundNumber,
              bracketPosition: battleMatchups.bracketPosition,
              competitorAId: battleMatchups.competitorAId,
              competitorBId: battleMatchups.competitorBId,
              seedA: battleMatchups.seedA,
              seedB: battleMatchups.seedB,
            })
            .from(battleMatchups)
            .where(filter)
            .orderBy(asc(battleMatchups.roundNumber), asc(battleMatchups.bracketPosition))
            .limit(1);

          if (!next || !next.competitorAId || !next.competitorBId) {
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              battlesActive: true,
              currentMatchup: null, // either nothing left OR malformed (TBD slot)
            };
          }

          // 4. Resolve competitor names — single batched fetch.
          const compRows = await tx
            .select({ id: competitors.id, name: competitors.name, participantId: competitors.participantId })
            .from(competitors)
            .where(inArray(competitors.id, [next.competitorAId, next.competitorBId]));
          const byId = new Map(compRows.map((c) => [c.id, c]));
          const a = byId.get(next.competitorAId);
          const b = byId.get(next.competitorBId);
          if (!a || !b) {
            // Defensive: a referenced competitor was deleted (shouldn't happen
            // — withdrawn flips status, doesn't delete). Treat as no matchup.
            return {
              judgeSessionId: session.id,
              label: session.label,
              competitionId: session.competitionId,
              battlesActive: true,
              currentMatchup: null,
            };
          }

          return {
            judgeSessionId: session.id,
            label: session.label,
            competitionId: session.competitionId,
            battlesActive: true,
            currentMatchup: {
              matchupId: next.id,
              roundNumber: next.roundNumber,
              bracketPosition: next.bracketPosition,
              competitorA: { id: a.id, name: a.name, participantId: a.participantId, seed: next.seedA },
              competitorB: { id: b.id, name: b.name, participantId: b.participantId, seed: next.seedB },
            },
          };
        });
      }),
    ```

  - [x] Add `import { inArray }` to drizzle-orm imports (already imported per Story 5.1's `getBracket` task — verify).
  - [x] Add `votes`, `battleMatchups` to the `@competition-platform/db` import block (alongside Story 5.1's `battleMatchups` import).

- [x] Task 8: tRPC mutation — `tournament.submitVote` (AC: #2, #3, #7, #8, #10)
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — new public procedure modeled on `submitScore` (line 1273) with vote-specific guards. Place between `submitScore` and `submitOrganizerScore` so all submission mutations cluster:

    ```ts
    submitVote: t.procedure
      .input(submitVoteSchema)
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(`submitVote:${ctx.clientIp ?? 'unknown'}`, SUBMIT_RL);
        let broadcastPayload: VoteSubmittedPayload | null = null;
        const result = await db.db.transaction(async (tx) => {
          // 1. Validate token.
          const hash = createHash('sha256').update(input.token).digest('hex');
          const [session] = await tx
            .select({ id: judgeSessions.id, competitionId: judgeSessions.competitionId })
            .from(judgeSessions)
            .where(eq(judgeSessions.tokenHash, hash));
          if (!session) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge link not valid' });
          }

          // 2. Idempotency-by-key: same key from same judge = already processed.
          //    Identical to submitScore lines 1309-1323.
          const [existingByKey] = await tx
            .select({ id: votes.id })
            .from(votes)
            .where(
              and(
                eq(votes.judgeSessionId, session.id),
                eq(votes.idempotencyKey, input.idempotencyKey),
              ),
            );
          if (existingByKey) {
            return { success: true, idempotent: true };
          }

          // 3. Battles-phase + status guard.
          const [comp] = await tx
            .select({ status: competitions.status, cypherCompletedAt: competitions.cypherCompletedAt })
            .from(competitions)
            .where(eq(competitions.id, session.competitionId));
          if (!comp || comp.status !== 'active' || comp.cypherCompletedAt === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Battles phase is not active',
              cause: { errorCode: ErrorCodes.BATTLES_NOT_ACTIVE },
            });
          }

          // 4. Load + validate matchup.
          const [matchup] = await tx
            .select({
              id: battleMatchups.id,
              competitionId: battleMatchups.competitionId,
              isBye: battleMatchups.isBye,
              winnerCompetitorId: battleMatchups.winnerCompetitorId,
            })
            .from(battleMatchups)
            .where(eq(battleMatchups.id, input.matchupId));
          if (!matchup) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Matchup not found',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_FOUND },
            });
          }
          if (matchup.competitionId !== session.competitionId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Matchup does not belong to your competition',
              cause: { errorCode: ErrorCodes.MATCHUP_NOT_IN_COMPETITION },
            });
          }
          if (matchup.isBye) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Bye matchups auto-advance and accept no votes',
              cause: { errorCode: ErrorCodes.MATCHUP_IS_BYE },
            });
          }
          if (matchup.winnerCompetitorId !== null) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Matchup is already resolved',
              cause: { errorCode: ErrorCodes.MATCHUP_ALREADY_RESOLVED },
            });
          }

          // 5. Get next event sequence (matches submitScore pattern).
          const [{ maxSeq }] = await tx
            .select({ maxSeq: max(events.sequence) })
            .from(events)
            .where(
              and(
                eq(events.aggregateId, session.competitionId),
                eq(events.aggregateType, 'competition'),
              ),
            );
          const nextSeq = (maxSeq ?? 0) + 1;

          // 6. Persist vote. Catch 23505 on EITHER unique index:
          //    - uq_votes_matchup_judge: this judge already voted on this matchup
          //      (treat as idempotent if same vote, conflict otherwise — for MVP
          //       always return CONFLICT; the offline-queue idempotency-key path
          //       handles legitimate retries via step 2 above).
          //    - uq_votes_judge_idempotency: handled in step 2 already.
          try {
            await tx.insert(votes).values({
              competitionId: session.competitionId,
              matchupId: input.matchupId,
              judgeSessionId: session.id,
              vote: input.vote,
              idempotencyKey: input.idempotencyKey,
            });
          } catch (err: unknown) {
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Vote already cast for this matchup',
                cause: { errorCode: ErrorCodes.MATCHUP_ALREADY_RESOLVED },
              });
            }
            throw err;
          }

          // 7. Persist domain event.
          const payload: VoteSubmittedPayload = {
            competitionId: session.competitionId,
            matchupId: input.matchupId,
            judgeSessionId: session.id,
            vote: input.vote,
            idempotencyKey: input.idempotencyKey,
            submittedAt: new Date().toISOString(),
          };
          try {
            await tx.insert(events).values({
              type: 'vote.submitted',
              aggregateId: session.competitionId,
              aggregateType: 'competition',
              payload: payload as unknown as Record<string, unknown>,
              sequence: nextSeq,
              createdBy: session.id,
            });
          } catch (err: unknown) {
            // Concurrent vote at same sequence — same precedent as submitScore
            // (line 1432). Surface INTERNAL_SERVER_ERROR; client retries.
            // We do NOT re-read here because vote events are not idempotent
            // by-conflict the way phase.transitioned is — a re-read would not
            // help the client converge to "their" vote being recorded.
            if ((err as { code?: string }).code === '23505') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Concurrent submission conflict, please retry',
              });
            }
            throw err;
          }

          broadcastPayload = payload;
          return { success: true, idempotent: false };
        });
        if (broadcastPayload !== null) {
          gateway.broadcastVoteSubmitted(
            (broadcastPayload as VoteSubmittedPayload).competitionId,
            broadcastPayload as VoteSubmittedPayload,
          );
        }
        return result;
      }),
    ```

- [x] Task 9: tRPC mutation — `tournament.submitOrganizerVote` (AC: #9)
  - [x] Modeled on Story 4.4's `submitOrganizerScore` (router lines 1496+). Same find-or-create-organizer-judge-session pattern. Apply the **`pg_advisory_xact_lock`** introduced in Story 4.4 to prevent two concurrent organizer-vote calls from racing on session creation.
  - [x] Logic (RLS transaction):
    1. `SET LOCAL session.current_organizer_id = ${ctx.userId}` — required for RLS on inserts.
    2. Ownership SELECT: `SELECT id, status, soloMode, cypherCompletedAt FROM competitions WHERE id = $competitionId AND organizer_clerk_id = $ctx.userId`. Throw `NOT_FOUND` if zero rows.
    3. Guards: `status !== 'active'` → `BATTLES_NOT_ACTIVE`. `cypherCompletedAt IS NULL` → `BATTLES_NOT_ACTIVE`. `soloMode !== true` → `SOLO_MODE_NOT_ENABLED` (mirrors Story 4.4 AC #6).
    4. Reuse the **find-or-create organizer judge session** helper from `submitOrganizerScore` (Story 4.4 lines 1576-1614). The session row is shared between cypher and battles — solo organizers use the same "Organizer" judge session for both phases.
    5. Matchup load + guards: same as `submitVote` step 4.
    6. Idempotency-by-key check: same as `submitVote` step 2 but using the organizer's session id.
    7. Vote insert + event insert + broadcast: identical pattern to `submitVote` steps 6-7, with `createdBy: organizerJudgeSession.id`.
  - [x] **Why a separate mutation rather than reusing submitVote?** Same rationale as Story 4.4: solo mode is opt-in, requires Clerk auth (not token), and auto-creates the organizer's judge session. Keep the public token-based path simple.

- [x] Task 10: Frontend — extend `(judge)/[token]/page.tsx` to switch UI on phase (AC: #1, #6)
  - [x] `apps/web/src/app/(judge)/judge/[token]/page.tsx` — split the active-state branch into two:
    - **Cypher branch** (existing): `tokenData.competitionStatus === 'active' && tokenData.cypherCompletedAt === null`. Renders the existing `JudgeScoreInput` flow.
    - **Battles branch** (NEW): `tokenData.competitionStatus === 'active' && tokenData.cypherCompletedAt !== null`. Renders the new `BattlesVotingScreen` (Task 11) which calls `getBattlesAssignment` instead of `getJudgeAssignments`.
  - [x] Refactor opportunity (do not over-engineer): if the cypher branch is large, factor out `CypherScoringScreen` from the current page body and add a new `BattlesVotingScreen`. Keep the page itself a thin phase router. **Limit refactor**: do NOT touch the connection-status indicator, drain notices, or offline-queue bookkeeping; these are shared and stay at the page level (or hoisted into a `JudgeShell` if and only if the diff stays under ~50 lines).
  - [x] **Critical**: do not regress the cypher path. The Cypher tests (`apps/web/src/app/(judge)/judge/[token]/page.spec.tsx` if present, or `use-judge-socket.spec.ts`) must still pass.

- [x] Task 11: Frontend — `BattlesVotingScreen` component + full `JudgeVoteInput` (AC: #2, #3, #4, #5, #6)
  - [x] `packages/formats/cypher-battles/src/ui/judge-vote-input.tsx` — REPLACE the stub (currently 17 lines) with the full implementation:

    ```tsx
    'use client';
    import { useState } from 'react';

    export interface JudgeVoteInputProps {
      matchupId: string;
      player1Id: string;
      player1Name: string;
      player1Seed: number | null;
      player2Id: string;
      player2Name: string;
      player2Seed: number | null;
      onVote: (vote: 'player1' | 'player2' | 'tie') => void | Promise<void>;
      disabled?: boolean;
    }

    export function JudgeVoteInput({
      player1Name,
      player1Seed,
      player2Name,
      player2Seed,
      onVote,
      disabled = false,
    }: JudgeVoteInputProps) {
      const [submitting, setSubmitting] = useState<null | 'player1' | 'player2' | 'tie'>(null);

      async function handleVote(choice: 'player1' | 'player2' | 'tie') {
        if (disabled || submitting) return;
        setSubmitting(choice);
        try {
          await onVote(choice);
        } finally {
          // Parent advances to next matchup on success; reset for safety
          // in case the parent decides to re-render this matchup.
          setSubmitting(null);
        }
      }

      return (
        <div className="flex flex-col gap-6">
          {/* Players row: equally-prominent, large names */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              {player1Seed !== null && (
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Seed {player1Seed}
                </p>
              )}
              <p className="text-2xl font-bold break-words">{player1Name}</p>
            </div>
            <div className="text-center">
              {player2Seed !== null && (
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Seed {player2Seed}
                </p>
              )}
              <p className="text-2xl font-bold break-words">{player2Name}</p>
            </div>
          </div>

          {/* Three voting buttons — visually distinct backgrounds (NOT just labels) */}
          <button
            type="button"
            disabled={disabled || submitting !== null}
            onClick={() => handleVote('player1')}
            className="min-h-[64px] w-full rounded-md bg-primary text-primary-foreground font-bold text-lg disabled:opacity-50 active:scale-[0.99] transition"
          >
            {submitting === 'player1' ? 'Submitting...' : `Vote ${player1Name}`}
          </button>
          <button
            type="button"
            disabled={disabled || submitting !== null}
            onClick={() => handleVote('player2')}
            className="min-h-[64px] w-full rounded-md bg-secondary text-secondary-foreground font-bold text-lg border border-border disabled:opacity-50 active:scale-[0.99] transition"
          >
            {submitting === 'player2' ? 'Submitting...' : `Vote ${player2Name}`}
          </button>
          <button
            type="button"
            disabled={disabled || submitting !== null}
            onClick={() => handleVote('tie')}
            className="min-h-[64px] w-full rounded-md bg-muted text-foreground font-bold text-lg border-2 border-dashed border-border disabled:opacity-50 active:scale-[0.99] transition"
          >
            {submitting === 'tie' ? 'Submitting...' : 'Tie'}
          </button>
        </div>
      );
    }
    ```

  - [x] `packages/formats/cypher-battles/src/index.ts` — add `JudgeVoteInput` to the value exports (currently only the **type** `JudgeVoteInputProps` is exported):
    ```ts
    export { JudgeVoteInput } from './ui/judge-vote-input';
    ```
  - [x] `apps/web/src/components/judge/battles-voting-screen.tsx` (NEW client component):
    - Props: `{ token: string; judgeSessionId: string; competitionId: string; }`
    - Uses `trpc.tournament.getBattlesAssignment.useQuery({ token })`.
    - Uses `useOfflineQueue` (generalized for votes — see Task 12) with a vote-specific `submitFn` that calls `trpc.tournament.submitVote`.
    - Renders `<JudgeVoteInput matchupId={...} player1Name={competitorA.name} ... onVote={handleVote} />`.
    - Three states: (a) `battlesActive: false` → "Battles haven't started yet" (b) `battlesActive: true && currentMatchup === null` → "Waiting for next matchup..." (c) `currentMatchup !== null` → vote UI.
    - On successful vote: invalidate `getBattlesAssignment` so the next matchup loads (or "Waiting" appears). Same pattern as cypher's `getJudgeAssignments` invalidation in `onScoreSubmitted`.
    - Real-time: subscribe to `'vote.submitted'` via `useJudgeSocket` extension (Task 13) — invalidate `getBattlesAssignment` on receipt to pick up bracket changes from Story 5.3 once it lands.

- [x] Task 12: Generalize `useOfflineQueue` for both scores and votes (AC: #4)
  - [x] `apps/web/src/lib/offline-queue.ts` — change `QueuedSubmission` to a discriminated union:

    ```ts
    export type QueuedSubmission = QueuedScoreSubmission | QueuedVoteSubmission;

    export interface QueuedScoreSubmission {
      kind: 'score';
      token: string;
      competitorId: string;
      scores: Array<{ criterionId: string; value: string }>;
      idempotencyKey: string;
      queuedAt: string;
    }

    export interface QueuedVoteSubmission {
      kind: 'vote';
      token: string;
      matchupId: string;
      vote: 'player1' | 'player2' | 'tie';
      idempotencyKey: string;
      queuedAt: string;
    }
    ```

  - [x] Update `isQueuedSubmission` to a discriminator-aware predicate. **Backwards-compat requirement**: old localStorage entries written before this story have no `kind` field. Treat `kind` missing OR `kind === 'score'` AS a score for one release window — narrow to strict `kind === 'score'` after the next deploy. Document this in code with a one-liner WHY comment per project-context rule.
  - [x] `apps/web/src/lib/offline-queue.spec.ts` — extend with vote-shape round-trip + the `kind` migration case (`kind` missing → treated as score).
  - [x] **Alternative considered**: introduce a parallel `useOfflineVoteQueue` hook with its own localStorage namespace. **Rejected** because (a) the queue is keyed per `judgeSessionId` so co-locating both submission types in one queue preserves submission order across a phase transition (e.g., a queued cypher score followed by a queued battles vote drains in the right order), and (b) the storage helper is small enough that one discriminated type is cleaner than two namespaces.
  - [x] `apps/web/src/hooks/use-offline-queue.ts` — `submitFn` keeps the same signature `(s: QueuedSubmission) => Promise<{ idempotent: boolean }>`. The cypher page passes a score-only `submitFn`; the battles page passes a vote-only `submitFn`; the page MUST inspect `s.kind` and reject mismatched kinds with a permanent error so they're dropped from the queue (defensive against a wrong-page-load draining the wrong submission type — extremely unlikely but cheap to handle).

- [x] Task 13: Frontend — extend `useJudgeSocket` to surface `'vote.submitted'` (AC: #5)
  - [x] `apps/web/src/hooks/use-judge-socket.ts` — add an optional callback:
    ```ts
    onVoteSubmitted?: (payload: VoteSubmittedPayload) => void;
    ```
    Register `socket.on('vote.submitted', (p) => optsRef.current.onVoteSubmitted?.(p))` next to the existing `'score.submitted'` listener. Import `VoteSubmittedPayload` from `@competition-platform/shared`.
  - [x] The `BattlesVotingScreen` consumes this to invalidate `getBattlesAssignment` on receipt (so bracket changes from Story 5.3 are picked up live).

- [x] Task 14: Solo-mode admin voting UI (AC: #9)
  - [x] `apps/web/src/components/admin/battles-voting-panel.tsx` (NEW client component) — mirror of `solo-scoring-panel.tsx`:
    - Renders only when `competition.soloMode === true && competition.cypherCompletedAt !== null`.
    - Reads `trpc.tournament.getBracket.useQuery({ competitionId })` (Story 5.1) to enumerate **all unresolved non-bye matchups** for the current round.
    - For each matchup: render the same `JudgeVoteInput` component with three buttons. Submitting calls `trpc.tournament.submitOrganizerVote.useMutation()`.
    - On success: invalidate `getBracket` so the matchup card disappears from the panel.
    - Real-time: subscribe to the **admin** socket's `'vote.submitted'` (extend `useAdminSocket` per Task 15) and re-fetch the bracket.
    - Empty state: "All matchups in this round are voted on. Waiting for Story 5.3 to advance the bracket." (For Story 5.2 MVP, the solo organizer still has to wait for the next-round matchups — Story 5.3 materializes them.)
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — render `<BattlesVotingPanel competitionId={id} />` between `<CypherResultsPanel />` and `<BracketViewPanel />` (Story 5.1's panel). The component returns `null` when not in solo battles state, so it's safe to render unconditionally.

- [x] Task 15: Extend `useAdminSocket` and `dashboard-live-island` for vote events (AC: #9, #10)
  - [x] `apps/web/src/hooks/use-admin-socket.ts` — add to `UseAdminSocketOptions`:
    ```ts
    onVoteSubmitted?: (payload: VoteSubmittedPayload) => void;
    ```
    Register the listener (mirror `score.submitted` registration around line 64). Import the payload type from shared.
  - [x] `apps/web/src/components/admin/dashboard-live-island.tsx` — wire the new callback to invalidate `getBracket` and (when introduced by 5.3) `getDashboardSnapshot`. For 5.2: invalidate `tournament.getBracket` only.
  - [x] `apps/web/src/hooks/use-admin-socket.spec.ts` — extend the listener-coverage test with `'vote.submitted'`.

- [x] Task 16: Backend tests — `submitVote` (AC: #2, #7, #8, #10)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — extend with a `tournament.submitVote` describe block:
    - **Zod**: missing token / matchupId / vote / idempotencyKey → `BAD_REQUEST`.
    - **Zod**: `vote: 'invalid'` → `BAD_REQUEST` (z.enum rejects).
    - **NOT_FOUND token**: invalid token → `NOT_FOUND`.
    - **BATTLES_NOT_ACTIVE**: `competition.status !== 'active'` → `BAD_REQUEST` with `errorCode: BATTLES_NOT_ACTIVE`.
    - **BATTLES_NOT_ACTIVE**: `cypherCompletedAt === null` → `BAD_REQUEST` with `errorCode: BATTLES_NOT_ACTIVE`.
    - **MATCHUP_NOT_FOUND**: matchupId doesn't exist → `NOT_FOUND` with `errorCode: MATCHUP_NOT_FOUND`.
    - **MATCHUP_NOT_IN_COMPETITION**: matchup belongs to a different competition than the judge's → `FORBIDDEN` with `errorCode: MATCHUP_NOT_IN_COMPETITION`.
    - **MATCHUP_IS_BYE**: `isBye = true` → `BAD_REQUEST` with `errorCode: MATCHUP_IS_BYE`.
    - **MATCHUP_ALREADY_RESOLVED**: `winnerCompetitorId !== null` → `CONFLICT` with `errorCode: MATCHUP_ALREADY_RESOLVED`.
    - **Happy path**: vote insert called once, event insert called once with `type: 'vote.submitted'` and full payload, `gateway.broadcastVoteSubmitted` called once with the same payload.
    - **Idempotency-by-key**: second call with the same `(judgeSessionId, idempotencyKey)` returns `{ idempotent: true }` without inserting a second vote, event, or broadcast.
    - **Idempotency-by-conflict on `(matchup_id, judge_session_id)`**: simulate vote insert throwing 23505 → `CONFLICT` with `errorCode: MATCHUP_ALREADY_RESOLVED`.
    - **Sequence collision on event insert**: simulate event insert throwing 23505 → `INTERNAL_SERVER_ERROR` (per submitScore precedent).
  - [x] **Mock gateway**: `mockGateway` MUST include `broadcastVoteSubmitted: vi.fn()` (Task 5).

- [x] Task 17: Backend tests — `getBattlesAssignment` (AC: #1, #2, #5, #6)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — extend:
    - **NOT_FOUND**: invalid token → `NOT_FOUND`.
    - **battles inactive**: `cypherCompletedAt === null` → `{ battlesActive: false, currentMatchup: null }` (no throw).
    - **No matchups remaining**: judge has voted on every available matchup → `{ battlesActive: true, currentMatchup: null }`.
    - **Happy path**: returns the lowest-(roundNumber, bracketPosition) unresolved non-bye matchup the judge hasn't voted on, with both competitor names resolved.
    - **Skip byes**: byes (`isBye = true`) are excluded from the returned matchup.
    - **Skip resolved**: matchups with `winnerCompetitorId IS NOT NULL` are excluded.
    - **Skip own prior votes**: a matchup the judge has previously voted on is excluded.
    - **Cross-competition isolation**: a matchup belonging to another competition is never returned (subquery filter on `eq(battleMatchups.competitionId, session.competitionId)`).

- [x] Task 18: Backend tests — `submitOrganizerVote` (AC: #9)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — extend (mirrors Story 4.4's `submitOrganizerScore` test patterns):
    - **Auth**: `caller(null).tournament.submitOrganizerVote(...)` → `UNAUTHORIZED`.
    - **Zod**: invalid input rejects.
    - **NOT_FOUND**: competition doesn't exist or isn't owned by `ctx.userId` → `NOT_FOUND`.
    - **BATTLES_NOT_ACTIVE**: `cypherCompletedAt === null` → `errorCode: BATTLES_NOT_ACTIVE`.
    - **SOLO_MODE_NOT_ENABLED**: `soloMode = false` → `errorCode: SOLO_MODE_NOT_ENABLED`.
    - **Find-or-create organizer judge session**: first call inserts the session; second call reuses the existing one (assert exactly one INSERT into `judge_sessions` across two votes).
    - **Happy path**: vote + event INSERTs called once each; `broadcastVoteSubmitted` called once.
    - **All matchup guards** from Task 16 also apply (MATCHUP_NOT_FOUND, MATCHUP_NOT_IN_COMPETITION, MATCHUP_IS_BYE, MATCHUP_ALREADY_RESOLVED). Cover at least MATCHUP_NOT_FOUND + MATCHUP_ALREADY_RESOLVED here; the rest are covered by `submitVote` tests since the guard implementations are identical.

- [x] Task 19: Frontend tests — `JudgeVoteInput` + `BattlesVotingScreen` + `BattlesVotingPanel` (AC: #2, #3, #6, #9)
  - [x] `packages/formats/cypher-battles/src/ui/judge-vote-input.spec.tsx` (NEW):
    - Renders both player names + three buttons.
    - Each button click invokes `onVote('player1' | 'player2' | 'tie')` exactly once.
    - When `disabled = true`: all buttons disabled, no clicks fire callback.
    - During in-flight submission (mid-`onVote` promise): all buttons disabled, only the clicked one shows "Submitting...".
  - [x] `apps/web/src/components/judge/battles-voting-screen.spec.tsx` (NEW):
    - `battlesActive: false` → renders "Battles haven't started yet" placeholder.
    - `battlesActive: true && currentMatchup: null` → renders "Waiting for next matchup...".
    - `currentMatchup` populated → renders `JudgeVoteInput` with correct names/seeds.
    - Submitting a vote calls the tRPC mutation with `{ token, matchupId, vote, idempotencyKey }`; on success, the assignment query is invalidated.
    - Network error path: vote is enqueued via `useOfflineQueue`, status shows "Queued — will submit when connection returns".
  - [x] `apps/web/src/components/admin/battles-voting-panel.spec.tsx` (NEW):
    - Renders nothing when `soloMode: false`.
    - Renders nothing when `cypherCompletedAt: null`.
    - Lists each unresolved non-bye matchup as a vote card.
    - Submitting a vote calls `submitOrganizerVote` and invalidates `getBracket`.
  - [x] `apps/web/src/hooks/use-judge-socket.spec.ts` (CREATE if absent; OR extend existing) — cover the new `'vote.submitted'` listener.
  - [x] `apps/web/src/hooks/use-admin-socket.spec.ts` — extend with `'vote.submitted'` listener coverage.

- [x] Task 20: Manual verification & CI
  - [ ] Manual flow (with Story 5.1 merged):
    1. Create a competition, register 5 active competitors, configure 1 cypher group, generate 1 judge link.
    2. Start cypher phase, score everyone (or use solo mode to score from admin).
    3. Confirm advancement → bracket generates (4 matchups, 3 byes).
    4. Open the same judge link → page now renders the **Battles Voting** UI (Task 10). Cast a vote on the single non-bye matchup → success → "Waiting for next matchup..." (since Story 5.3 isn't live, no further matchups appear).
    5. Solo-mode test: enable solo mode on a fresh competition, complete cypher solo, confirm advancement, then use the **Battles Voting Panel** in the admin UI to vote on the same matchups (Task 14).
    6. Inspect DB: one `votes` row per submission, one `vote.submitted` event row per submission, no duplicates after refresh-and-resubmit.
    7. Offline test: open the judge page, disconnect Wi-Fi, vote, verify "Queued" appears, reconnect, verify the vote drains and a `vote.submitted` event row appears.
  - [x] CI: `pnpm exec turbo run lint typecheck test --filter='!@competition-platform/tests'` — all green.
  - [x] If running E2E (`apps/web/e2e/` — currently scaffolded but no battles E2E exists): add a sanity Playwright test or punt to Tea workflow per project rule.

## Dev Notes

### Architecture mandate: vote storage separate from scores

The `votes` table is intentionally distinct from the `scores` table even though both represent judge submissions. Three reasons:

1. **Different shape**: a vote is a single enum value (`vote_choice`), not a JSONB array of criterion-keyed decimal strings. Forcing votes into the `scores.criteriaScores` JSONB would muddy the type and require runtime discriminators throughout the aggregation code.
2. **Different uniqueness invariants**: scores are unique per `(judge_session_id, competitor_id)`. Votes are unique per `(matchup_id, judge_session_id)`. The latter constraint is stronger because matchups are point-in-time entities, not long-lived aggregates.
3. **Different aggregation rule**: cypher scores are summed and ranked. Battles votes are tallied for majority — a fundamentally different operation. Story 5.3 owns the tally logic; this story only writes the rows.

The append-only event store (`events` table) holds both `score.submitted` and `vote.submitted` events under the same `aggregateId = competitionId`, so the full competition timeline remains reconstructable from one event stream (NFR21).

[Source: `_bmad-output/planning-artifacts/architecture.md#Communication Patterns` (line 585); `packages/db/schema/scoring.ts`; Story 5.1 `battle-matchups` schema]

### Phase detection: `cypherCompletedAt` is the source of truth

The judge page (Task 10) decides which UI to render based on `cypherCompletedAt`. This field is set by `completeCypherPhase` (Story 3.6) inside the same transaction as the `phase.transitioned` event AND (after Story 5.1) the `bracket.generated` event. So when `cypherCompletedAt !== null`, the bracket is guaranteed to exist (atomicity, NFR21).

`competition.status` cannot be the discriminator alone because it stays `active` across both phases — only `cypherCompletedAt` distinguishes "still in cypher" from "now in battles".

[Source: `apps/api/src/trpc/routers/tournament.router.ts:1076-1084` (cypherCompletedAt UPDATE); Story 5.1 dev notes — atomicity rationale]

### Matchup selection: deterministic next-up ordering

`getBattlesAssignment` returns the lowest `(roundNumber, bracketPosition)` matchup the judge hasn't voted on. This guarantees:

- Two judges loading the page at the same moment see the **same** matchup (within their own dedupe context) — predictable real-world behavior for venue judges sitting next to each other.
- Once a judge votes on matchup at position 0, they advance to position 1, then 2, etc. — a stable per-judge progression.
- When Story 5.3 materializes round-2 matchups (round_number = 2), they sort AFTER all round-1 matchups, so judges naturally finish round 1 before starting round 2.

The choice **not to broadcast `vote.submitted` to other judge rooms** (Task 5) is deliberate: a vote by judge A doesn't change judge B's assignment until Story 5.3 closes the matchup. Story 5.3 will introduce a `matchup.completed` event broadcast to all judges so their queries refresh when the bracket actually moves.

[Source: Story 5.1 task 7 `BracketViewPanel` ordering; PRD FR23-FR25 (majority winner advancement)]

### Solo mode reuse

The solo-mode organizer's judge session created by Story 4.4's `submitOrganizerScore` is **the same row** used by `submitOrganizerVote`. Both procedures find-or-create a judge session with `(competitionId, createdBy = ctx.userId, label = 'Organizer')`. Reusing it means:

- The organizer's cypher scores and battles votes share one judge identity → simpler audit trail.
- The advisory-lock pattern from Story 4.4 (`pg_advisory_xact_lock` to prevent duplicate session creation) is reused verbatim.
- No new error code or migration for solo battles.

[Source: Story 4.4 task 6 (router lines 1576-1614); `_bmad-output/implementation-artifacts/4-4-solo-scoring-mode-and-phase-transition-control.md` task 6]

### Idempotency mechanisms (three layers)

1. **Idempotency-by-key** (`uq_votes_judge_idempotency`): a client retry with the same key is detected at step 2 and returns `{ idempotent: true }` without further work. This is the offline-queue's primary protection.
2. **Idempotency-by-state** (`uq_votes_matchup_judge`): even with a fresh idempotency key, a judge cannot accidentally double-vote on the same matchup. The 23505 on this index returns `MATCHUP_ALREADY_RESOLVED` (slight semantic stretch — it's "already voted by you" — but reusing the existing user-facing error code keeps the surface small).
3. **Sequence-collision on `vote.submitted` event** (`uq_events_aggregate_sequence`): two concurrent vote submissions on the same competition can race for the same `nextSeq`. Unlike `phase.transitioned` (Story 3.6) we do NOT re-read on conflict because re-reading wouldn't help converge to "this judge's vote was recorded". Surface `INTERNAL_SERVER_ERROR` and let the client retry — the offline-queue handles transient retries naturally.

This is the same three-layer defense `submitScore` uses (lines 1309-1444); tests must cover all three branches.

[Source: Story 5.1 dev notes "Idempotency-by-state vs. idempotency-by-conflict"; Story 3.6 idempotency precedents; `apps/api/src/trpc/routers/tournament.router.ts:1273-1444`]

### Battles judge eligibility (deliberate MVP scope decision)

For Story 5.2 MVP, **all `judge_sessions` rows for a competition are eligible to vote in battles**, regardless of the configured `cypherGroupCount` or the (informational) `battlesJudgeCount` field on `competitions`. The `groupIndex` field on `judge_sessions` is meaningless for battles and is ignored by `getBattlesAssignment`.

If post-MVP requires a separate battles judge roster, introduce a `judge_sessions.phase` discriminator (or a separate `battles_judge_sessions` table) — out of scope here. Document this trade-off in code comments around `getBattlesAssignment` and `submitVote`.

[Source: `packages/db/schema/judge-sessions.ts`; `packages/db/schema/competitions.ts:battlesJudgeCount` (informational)]

### CRITICAL Gotchas (Apply, Don't Re-Discover)

Per `_bmad-output/project-context.md` (read this BEFORE writing code):

1. **`pg_advisory_xact_lock` for find-or-create organizer session**: Story 4.4's `submitOrganizerScore` introduced this to serialize concurrent organizer-score calls. `submitOrganizerVote` MUST reuse the same lock key (e.g., `hashtext('organizer-session:' || competition_id || ':' || ctx.userId)`). Use the helper if Story 4.4 extracted one; otherwise inline-copy with a `// see Story 4.4` comment.
2. **`updatedAt: new Date()`** on every UPDATE that touches `competitions`. This story does NOT update `competitions` directly (only INSERTs `votes` + `events`), so this rule is not triggered — but verify if you reach for an UPDATE.
3. **TOCTOU on unique constraints**: catch `23505` from BOTH unique indexes on `votes` (`uq_votes_matchup_judge`, `uq_votes_judge_idempotency`). Step 2's pre-check handles `uq_votes_judge_idempotency` cleanly; the matchup-judge collision path falls into the catch.
4. **`SET LOCAL session.current_organizer_id`** is mandatory inside any DB-touching `protectedProcedure` — `submitOrganizerVote` is one. The public `submitVote` and `getBattlesAssignment` use direct `db.db.transaction(...)` without setting the organizer var (judges have no organizer context).
5. **Mock gateway oversight**: `broadcastVoteSubmitted: vi.fn()` MUST be added to `mockGateway` in `tournament.router.spec.ts`. Story 4.3, 5.1 reviews caught this exact pattern omission. Do not repeat.
6. **Auth tests required**: `caller(null).tournament.submitOrganizerVote(...)` → `UNAUTHORIZED`. (Public procedures `submitVote` and `getBattlesAssignment` do NOT need auth tests but DO need NOT_FOUND-on-bad-token tests.)
7. **Zod validation tests required**: invalid `vote` enum, empty fields, missing fields — all reject.
8. **`@base-ui/react`, NOT Radix** — `<Button asChild>` does NOT exist. The vote buttons in `JudgeVoteInput` are plain `<button>` elements with Tailwind classes (no shadcn `<Button>` is needed; this matches the cypher `JudgeScoreInput` pattern).
9. **TanStack Query v5 `onSuccess` removed from `useQuery`**: the `getBattlesAssignment` query result must drive UI via direct render (`if (data?.currentMatchup === null) return ...`), NOT via `onSuccess`.
10. **`react-hooks/set-state-in-effect`**: the `BattlesVotingScreen` is read-only against query data — no state init from query needed. If you reach for `useState(initialFromData)` in a `useEffect`, use the split-component pattern (per project-context rule).
11. **Discriminated union for `QueuedSubmission`** (Task 12): old localStorage entries lack `kind`. Default to `'score'` for one release; tighten to strict discriminator after the next deploy. WHY-comment the soft default.
12. **No new dependencies**: this story is implementable with existing workspace packages (Zod, drizzle-orm, nanoid, @clerk/backend, socket.io). Do NOT add a vote-tally or bracket library — Story 5.3 implements tally with native code.
13. **Event-store immutability**: never UPDATE or DELETE `events` rows. Vote events are append-only.
14. **No `competitions` namespace**: vote procedures live under `tournament.*` (existing convention).
15. **Bracket position numbering**: trust Story 5.1's canonical S-shape ordering — `getBattlesAssignment` orders by `(roundNumber, bracketPosition)` and that is sufficient. Do NOT recompute bracket positions here.
16. **Withdrawn-competitor filter**: NOT applicable to votes per se — by the time matchups exist, withdrawn competitors are already excluded from `advancedCompetitorIds` (Story 4.3 + 3.6). However: if a competitor withdraws DURING battles, the bracket already reflects them as a fixed slot. Out of scope to handle mid-battles withdrawal — flag if encountered.
17. **Rate limiting on public endpoints**: `submitVote` and `getBattlesAssignment` use `enforceRateLimit` (PUBLIC_RL / SUBMIT_RL). Same pattern as `submitScore` / `getJudgeAssignments`.

### Existing Infrastructure (Verified — do NOT re-implement)

From Story 5.1 (will be live before this story merges):

- `battle_matchups` table + Drizzle schema — import from `@competition-platform/db`.
- `bracket.generated` event in `events` table.
- `tournament.getBracket` query — admin uses it; battles voting panel reuses it (Task 14).
- `BracketViewPanel` admin component — adjacent UI; do not modify.

From Story 4.4 (already shipping):

- `submitOrganizerScore` find-or-create-organizer-session pattern + `pg_advisory_xact_lock`.
- `setSoloMode` + `soloMode` column on `competitions`.

From Story 3.6 (already shipping):

- `completeCypherPhase` sets `cypherCompletedAt` and emits `phase.transitioned` atomically — used as the phase discriminator.

From Story 3.5 (already shipping):

- `useOfflineQueue` + localStorage queue + drain-on-reconnect — Task 12 generalizes the submission shape.
- `isNetworkError` helper (`apps/web/src/lib/network-error.ts`) — reuse for the vote-submit catch path.

From Story 3.3 (already shipping):

- `useJudgeSocket` hook — extend with `onVoteSubmitted` (Task 13).
- `JudgeScoreInput` + the `(judge)/[token]/page.tsx` shape — pattern to mirror for the battles UI.

### Project Structure Notes

**New files:**

```
packages/db/migrations/0014_add_votes.sql                            (new — migration)
packages/db/schema/votes.ts                                          (new — Drizzle schema + voteChoiceEnum)
apps/web/src/components/judge/battles-voting-screen.tsx              (new — judge-side battles screen)
apps/web/src/components/judge/battles-voting-screen.spec.tsx         (new)
apps/web/src/components/admin/battles-voting-panel.tsx               (new — solo-mode admin voting panel)
apps/web/src/components/admin/battles-voting-panel.spec.tsx          (new)
packages/formats/cypher-battles/src/ui/judge-vote-input.spec.tsx     (new — replaces nothing; covers new full impl)
apps/web/src/hooks/use-judge-socket.spec.ts                          (new IF not already present — verify before creating)
```

**Modified files:**

```
packages/db/schema/index.ts                                          (export votes)
packages/shared/validation/score.schema.ts                           (submitVoteSchema, submitOrganizerVoteSchema, VOTE_CHOICES)
packages/shared/errors/error-codes.ts                                (BATTLES_NOT_ACTIVE, MATCHUP_*, VOTE_OUTSIDE_OPTIONS)
packages/shared/events/scoring-events.ts                             (VoteSubmittedPayload + VoteSubmittedEvent)
packages/shared/events/socket-event-map.ts                           (add 'vote.submitted')
apps/api/src/modules/websocket/competition-gateway.interface.ts      (broadcastVoteSubmitted method)
apps/api/src/modules/websocket/gateways/competition.gateway.ts       (implement broadcastVoteSubmitted)
apps/api/src/trpc/routers/tournament.router.ts                       (extend validateJudgeToken; add getBattlesAssignment, submitVote, submitOrganizerVote)
apps/api/src/trpc/routers/tournament.router.spec.ts                  (add tests for all of the above; mock broadcastVoteSubmitted)
apps/web/src/app/(judge)/judge/[token]/page.tsx                      (phase router: cypher vs battles)
apps/web/src/app/(admin)/competitions/[id]/page.tsx                  (render BattlesVotingPanel)
apps/web/src/hooks/use-judge-socket.ts                               (onVoteSubmitted)
apps/web/src/hooks/use-admin-socket.ts                               (onVoteSubmitted)
apps/web/src/hooks/use-admin-socket.spec.ts                          (cover new listener)
apps/web/src/lib/offline-queue.ts                                    (discriminated QueuedSubmission union)
apps/web/src/lib/offline-queue.spec.ts                               (vote shape + kind-missing back-compat case)
apps/web/src/components/admin/dashboard-live-island.tsx              (wire onVoteSubmitted to invalidate getBracket)
packages/formats/cypher-battles/src/ui/judge-vote-input.tsx          (REPLACE the stub with full implementation)
packages/formats/cypher-battles/src/index.ts                         (export JudgeVoteInput as a value)
_bmad-output/implementation-artifacts/sprint-status.yaml             (story status transitions)
```

**Alignment with unified project structure:**

- `apps/web/src/components/judge/` is created by this story — first non-format component under that group. Architecture document anticipates this folder (line 933).
- `votes` table sits in the **scoring** bounded context (per architecture line 1097: scoring owns `scores`, `votes`, `events`). All vote logic stays in `tournament.router.ts` for MVP (matches the prevailing "tournament owns everything competition-related" pattern in the codebase); split into `scoring.router.ts` only if/when scoring grows large enough to warrant it.

**Detected variances:**

- The architecture diagram (line 905) shows `(judge)/[token]/voting/` as a separate sub-route. We **deliberately use one page that switches on phase** (Task 10) instead — single URL is simpler for venue judges (one link, automatic phase transitions, no route change to break their bookmark). Document this departure in the page's top-level comment.

### Testing Standards

- **Test framework**: Vitest. API runs server-side (Node), web runs JSDOM. Both already configured.
- **API test mocking**: use `mockDb` + `caller()` helpers established in `tournament.router.spec.ts` (lines 13-38). Do NOT touch a real database. Mock both `tx.select(...)` chains and `tx.insert(...)` calls.
- **Pure unit tests**: vote validation lives in Zod (`submitVoteSchema`); `z.enum(VOTE_CHOICES)` is the single source of truth. No separate validator function needed.
- **Integration tests**: extend `tournament.router.spec.ts`; do NOT create a new spec file. Group tests under `describe('tournament.submitVote', ...)`, `describe('tournament.getBattlesAssignment', ...)`, `describe('tournament.submitOrganizerVote', ...)`.
- **Frontend tests**: JSDOM + React Testing Library. The `BattlesVotingScreen` reads `getBattlesAssignment` and writes `submitVote` — mock both via the established trpc-mocking pattern from existing admin component specs. The `JudgeVoteInput` is pure presentational — straight render-and-click tests, no mocks.
- **Coverage target**: every guard branch in `submitVote` (BATTLES_NOT_ACTIVE, MATCHUP_NOT_FOUND, MATCHUP_NOT_IN_COMPETITION, MATCHUP_IS_BYE, MATCHUP_ALREADY_RESOLVED, idempotent-by-key, idempotent-by-state, sequence-collision). Every state branch in `BattlesVotingScreen` (battles inactive, no matchup, matchup present, vote in flight, vote queued offline).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2` — FR21, FR22, FR31, FR32, FR33, FR35, NFR2]
- [Source: `_bmad-output/planning-artifacts/prd.md#FR21-FR27` — Battles vote lifecycle and bracket progression contract]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Format Plugin Architecture` (line 236) — `phases[].type === 'voting'` declarative config]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Communication Patterns` (line 585) — domain event envelope]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Project Structure` (lines 905, 933, 1015-1029) — `(judge)/voting/` route + judge components folder + `judge-vote-input.tsx`]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping` (line 1115) — FR21-FR22 → `scoring/` + `competition/format-runtime/` + `formats/cypher-battles/`]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 33-58 — judge UX requirements: 56px+ targets, WCAG AAA, sub-10s scoring/voting cycle, three-state connection indicator]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1273-1494` — `submitScore` reference (mirror, do not modify)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1496-1737` — `submitOrganizerScore` reference (mirror for `submitOrganizerVote`)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:1190-1272` — `getJudgeAssignments` reference (mirror for `getBattlesAssignment`)]
- [Source: `apps/api/src/trpc/routers/tournament.router.ts:717-760` — `validateJudgeToken` (extend with `cypherCompletedAt`)]
- [Source: `apps/web/src/app/(judge)/judge/[token]/page.tsx` — current cypher-only judge page (extend with phase router in Task 10)]
- [Source: `apps/web/src/hooks/use-offline-queue.ts` + `apps/web/src/lib/offline-queue.ts` — generalize for votes in Task 12]
- [Source: `packages/formats/cypher-battles/src/phases/battles-phase.ts` — declarative battles phase with `voteOptions: ['player1', 'player2', 'tie']`]
- [Source: `packages/formats/cypher-battles/src/scoring/battles-voting.schema.ts` — `BATTLES_VOTE_CRITERION` (informational; not directly consumed by Story 5.2 — kept for Story 5.3 tally)]
- [Source: `packages/formats/cypher-battles/src/ui/judge-vote-input.tsx` — current 17-line stub (REPLACE in Task 11)]
- [Source: `packages/db/schema/scoring.ts` — `scores` table as model for `votes` table shape]
- [Source: `packages/db/schema/events.ts` — events table with `uq_events_aggregate_sequence`]
- [Source: `packages/shared/validation/score.schema.ts:5-13` — `criterionScoreSchema` and `submitScoreSchema` as model for vote schemas]
- [Source: `_bmad-output/implementation-artifacts/5-1-battles-bracket-generation.md` — `battle_matchups` schema, `bracket.generated` event, `getBracket` query, `BracketViewPanel`]
- [Source: `_bmad-output/implementation-artifacts/4-4-solo-scoring-mode-and-phase-transition-control.md` — `submitOrganizerScore` pattern, `pg_advisory_xact_lock`, find-or-create-organizer-session]
- [Source: `_bmad-output/implementation-artifacts/4-3-competitor-withdrawal-and-rescue.md` — `cause: { errorCode: ErrorCodes.X }` shape (NOT `code`)]
- [Source: `_bmad-output/implementation-artifacts/3-5-offline-score-queue-and-connection-resilience.md` — offline-queue + drain-on-reconnect pattern]
- [Source: `_bmad-output/project-context.md` — entire file applies; especially "Critical Don't-Miss Rules" + "Backend Rules" + "Frontend Rules"]

### Previous Story Intelligence

**Story 5.1 — Battles Bracket Generation (just created 2026-04-29; expected to ship before 5.2 merges):**

1. The `battle_matchups` schema and `voteChoice`-adjacent setup live in 5.1. Story 5.2 imports `battleMatchups` and assumes round-1 matchup rows exist.
2. The mock-gateway oversight (failing to add `broadcastBracketGenerated: vi.fn()` to the test mock) was anticipated in 5.1; same vigilance required for `broadcastVoteSubmitted` here.
3. The pure-function `bracket-generator.ts` lives in `apps/api/src/modules/competition/domain/` — the **vote tally** function for Story 5.3 will sit alongside it (`vote-tallier.ts` or similar). For Story 5.2 we do NOT need this — vote insertion is the only operation.

**Story 4.4 — Solo Scoring Mode & Phase Transition Control (done 2026-04-29):**

1. Find-or-create organizer judge session pattern with `pg_advisory_xact_lock` — Task 9 reuses the same lock key derivation.
2. Solo mode test improvement: assert positive outcomes (vote row + event row exist), not just absence of errors. Apply to `submitOrganizerVote` happy-path test.
3. The hide-after-completion pattern (`SoloScoringPanel` returns null after `cypherCompletedAt`) — `BattlesVotingPanel` does the inverse: returns null UNTIL `cypherCompletedAt`.

**Story 4.3 — Competitor Withdrawal & Rescue (done 2026-04-28):**

1. `cause: { errorCode: ErrorCodes.X }` is the canonical shape (NOT `cause: { code: X }`). Use throughout.
2. Active-only filter pattern — applied at the source query. Not directly relevant to vote insertion (matchups already filtered for active competitors at generation time), but verify nothing in `getBattlesAssignment` accidentally surfaces matchups for now-withdrawn competitors. (For MVP: out of scope; flag if encountered.)

**Story 3.5 — Offline Score Queue (done):**

1. Localstorage-keyed-by-judgeSessionId pattern preserves submission order across page reloads. Task 12's discriminated union must NOT change the storage key — that would orphan in-flight queues for any judge mid-flow.
2. `isNetworkError` discriminator (4xx vs network/5xx) is the canonical retry classifier — reuse for vote submissions.

### Git Intelligence (recent commits)

```
72e3df7 chore(ci): bump GitHub Actions to Node 24-compatible majors + gate Deploy
8f367e1 fix(ci): remove pnpm version override that conflicts with packageManager
59cc235 chore: checkpoint Stories 2.2-3.4 + CI scaffolding
efc9ca7 Initial commit: competition platform with Epic 1 & Story 2.1 complete
```

The repo follows a **checkpoint commit cadence** — large batches of stories ship together. Story 5.2 is expected to checkpoint with Story 5.3 (and possibly 5.1 if not already shipped). Plan changes so the diff is bisectable: do not co-mingle 5.2 work with unrelated refactors. Discriminated `QueuedSubmission` (Task 12) is the largest single mechanical change — keep it as its own commit if you split work.

### Project Context Reference

`_bmad-output/project-context.md` (52 rules) governs ALL implementation. This story does not introduce any new framework, language, or testing rule. It does add one convention worth surfacing if it sticks across Stories 5.2 + 5.3:

- **`votes` table parallels `scores` table**: append-only, judge-keyed, with `(judge_session_id, idempotency_key)` deduplication. If a third "judge submission" type ever appears (e.g., audience votes), consider abstracting into a single `judge_submissions` table with a `kind` discriminator. Out of scope here.

## Dev Agent Record

### Implementation Plan

Implemented in 20 sequential tasks following the spec verbatim. Bottom-up insertion order in `tournament.router.ts` (submitOrganizerVote → submitVote → getBattlesAssignment) avoided line-number drift while editing.

1. **Database** — migration `0014_add_votes.sql` (with idempotent `CREATE TYPE` guard), Drizzle schema `votes.ts` with `voteChoiceEnum`, both unique indexes (`uq_votes_matchup_judge`, `uq_votes_judge_idempotency`), supporting indexes, and RLS policy. `packages/db/schema/index.ts` exports `votes`. Migration applied to local DB to enable verification.
2. **Shared layer** — `submitVoteSchema` / `submitOrganizerVoteSchema` + `VOTE_CHOICES` in `score.schema.ts`; six new error codes (`BATTLES_NOT_ACTIVE`, `MATCHUP_NOT_FOUND`, `MATCHUP_NOT_IN_COMPETITION`, `MATCHUP_ALREADY_RESOLVED`, `MATCHUP_IS_BYE`, `VOTE_OUTSIDE_OPTIONS`); `VoteSubmittedPayload` + `VoteSubmittedEvent` in `scoring-events.ts`; `'vote.submitted'` registered in `ServerToClientEvents`.
3. **Gateway** — `broadcastVoteSubmitted` added to `ICompetitionGateway` and implemented on the admin room only (per spec; cross-judge fan-out deferred to Story 5.3 via `matchup.completed`). `mockGateway` and `makeFullGateway` both updated up-front to dodge the recurring "missing mock spy" regression that landed in Stories 4.3 / 5.1.
4. **`validateJudgeToken`** — extended response with `cypherCompletedAt: string | null`. Backwards-compatible: cypher path doesn't read it yet.
5. **`getBattlesAssignment`** (public) — token validation, battles-phase guard via `cypherCompletedAt`, deterministic next-up matchup ordering by `(roundNumber, bracketPosition)`, in-app filter for byes / resolved / already-voted, batched competitor name lookup via `inArray`. Returns `battlesActive: false` (no throw) when battles haven't started.
6. **`submitVote`** (public) — token → idempotency-by-key short-circuit → battles-phase guard → matchup load + four matchup guards (`MATCHUP_NOT_FOUND`, `MATCHUP_NOT_IN_COMPETITION`, `MATCHUP_IS_BYE`, `MATCHUP_ALREADY_RESOLVED`) → vote insert with 23505 → `MATCHUP_ALREADY_RESOLVED` → event insert with sequence-collision → `INTERNAL_SERVER_ERROR`. Broadcast post-commit, only on the success path.
7. **`submitOrganizerVote`** (protected) — mirrors Story 4.4's `submitOrganizerScore`: same `set_config('session.current_organizer_id', ...)` (post Story-5.1 production-bug fix), same `pg_advisory_xact_lock(hashtext('org-session-...'))`, same find-or-create organizer judge session keyed on `(competitionId, createdBy, label='Organizer')`. Reuses the existing organizer session row across cypher and battles for a single audit identity. All four matchup guards apply identically.
8. **Judge page phase router** — `cypherCompletedAt !== null` switches the page body to `<BattlesVotingScreen />`. Connection-status indicator, drain notices, and the offline queue stay at the page level. Cypher branch unchanged.
9. **`JudgeVoteInput`** — full implementation in `packages/formats/cypher-battles/src/ui/judge-vote-input.tsx` (replacing the 17-line stub): three large 64px+ buttons (player1 / player2 / tie), seed badges, in-flight "Submitting..." state with all-buttons-disabled lock. Exported as a value from the format package.
10. **`BattlesVotingScreen`** (NEW) — three-state machine: `battlesActive: false` → "haven't started", `currentMatchup: null` → "Waiting for next matchup...", `currentMatchup` populated → renders `JudgeVoteInput`. On vote: tRPC mutation → confirmed; on network error → enqueue via `offlineQueue.enqueue` (page-owned), show "Queued" message, advance after 1.5s. On success: invalidate `getBattlesAssignment` after 600ms so the next matchup loads.
11. **Discriminated `QueuedSubmission`** — `kind: 'score' | 'vote'` discriminator with shared `idempotencyKey` / `queuedAt`. `normalize()` stamps `kind: 'score'` on legacy entries (back-compat for one release). `useOfflineQueue.submitFn` dispatches by `kind`. Score and vote paths share the same localStorage key per judge — cross-phase queue ordering preserved.
12. **`useJudgeSocket`** — `onVoteSubmitted` callback added; `'vote.submitted'` listener wired identical to existing `'score.submitted'`.
13. **`useAdminSocket`** — same: new `onVoteSubmitted` option + listener. `dashboard-live-island` invalidates `getBracket` on receipt.
14. **`BattlesVotingPanel`** (NEW solo-mode admin) — gates on `competition.soloMode && cypherCompletedAt`; renders one `JudgeVoteInput` card per open non-bye matchup; calls `submitOrganizerVote` and invalidates `getBracket` on success. Inserted between `<CypherResultsPanel />` and `<BracketViewPanel />` so the admin page reads cypher → battles voting → bracket display top-to-bottom.
15. **Backend tests** — 23 new tests across `submitVote` (10), `getBattlesAssignment` (4), `submitOrganizerVote` (6) covering Zod, NOT_FOUND, BATTLES_NOT_ACTIVE, all four matchup guards, idempotency-by-key, 23505 on vote → CONFLICT/MATCHUP_ALREADY_RESOLVED, 23505 on event → INTERNAL_SERVER_ERROR, happy path with sequence assertion + broadcast assertion, organizer find-or-create reuse, SOLO_MODE_NOT_ENABLED.
16. **Frontend tests** — 5 BattlesVotingScreen tests (3 states + happy click + offline-queue fallback), 5 BattlesVotingPanel tests (solo gate, cypherCompletedAt gate, filter byes/resolved, empty state, vote click), 1 useAdminSocket test for `'vote.submitted'`, 4 offline-queue discriminated-union tests including the legacy back-compat case.

**Key design decisions:**

- Only the admin room receives `vote.submitted` broadcasts. Other judges' assignments don't change until Story 5.3 closes the matchup; cross-judge fan-out would be premature noise.
- `submitVote` does NOT re-read on event-sequence 23505 — unlike `phase.transitioned`, vote events aren't idempotent-by-conflict (re-reading wouldn't help converge to "this judge's vote was recorded"). Surface `INTERNAL_SERVER_ERROR` and let the offline queue retry.
- Organizer judge session is shared between cypher and battles. One identity, one audit trail. The `pg_advisory_xact_lock` keyed on `org-session-{competitionId}-{userId}` prevents duplicate-session creation under concurrent solo voting.
- Backend `getBattlesAssignment` filters byes/resolved/voted in application code instead of SQL `NOT IN`. Drizzle's `inArray(..., [])` rejects empty arrays, and the candidate set per competition is small (≤ bracketSize/2 per round). Trade-off documented inline.

### Completion Notes

- **All 20 tasks complete; AC #1-#10 satisfied.**
- **Tests:** 239 backend tests (216 prior + 23 new) and 66 web tests (51 prior + 15 new) pass; full CI gate `pnpm exec turbo run lint typecheck test` green across api / web / shared / db / format-cypher-battles.
- **Story 5.1 verification harness re-run** post-changes: all 71 checks across N=0/1/4/5/10 scenarios still green; the discriminated-queue and `set_config` fixes from the prior session remain compatible.
- **NOT verified manually in a browser/dev server** (subtask 20 manual flow left unchecked). Same blocker as Story 5.1: `tests/.env` `TEST_ORGANIZER_EMAIL` / `TEST_ORGANIZER_PASSWORD` are empty and `tests/.auth/organizer.json` doesn't exist, so the existing Playwright fixture cannot resolve an organizer session. Code review should re-run the integration-style harness pattern instead.
- **Recurring mock-gateway oversight**: `broadcastVoteSubmitted: vi.fn()` was added to BOTH `mockGateway` (top of spec) and `makeFullGateway()` from the start, per the recurring lesson from Stories 4.3 / 5.1.

### Implementation Outcomes

- ✓ AC #1 — judge page auto-routes to battles UI when `cypherCompletedAt !== null`.
- ✓ AC #2 — `JudgeVoteInput` renders both names (large) and three vote buttons.
- ✓ AC #3 — vote submits via tRPC, advances to next matchup on success.
- ✓ AC #4 — offline queue path: vote enqueued, "Queued" message, drain on reconnect via existing `useOfflineQueue` mechanism.
- ✓ AC #5 — "Waiting for next matchup..." state when `currentMatchup === null`; `vote.submitted` socket event invalidates the assignment query.
- ✓ AC #6 — judge sees only the current matchup; no bracket/admin/other-judges' data.
- ✓ AC #7 — all four matchup guards return structured errors with the correct `errorCode` cause.
- ✓ AC #8 — idempotency-by-key short-circuit + idempotency-by-state via `uq_votes_matchup_judge` (23505 → `MATCHUP_ALREADY_RESOLVED`).
- ✓ AC #9 — `submitOrganizerVote` + `BattlesVotingPanel` solo-mode admin voting.
- ✓ AC #10 — `vote.submitted` event payload, broadcast to admin room, sequence directly after the prior event.

## File List

**New files:**

- `packages/db/migrations/0014_add_votes.sql`
- `packages/db/schema/votes.ts`
- `apps/web/src/components/judge/battles-voting-screen.tsx`
- `apps/web/src/components/judge/battles-voting-screen.spec.tsx`
- `apps/web/src/components/judge/judge-vote-input.spec.tsx` (review fix — direct component-level coverage)
- `apps/web/src/components/admin/battles-voting-panel.tsx`
- `apps/web/src/components/admin/battles-voting-panel.spec.tsx`
- `apps/web/src/hooks/use-judge-socket.spec.ts` (review fix — covers `'vote.submitted'` listener)
- `apps/web/src/test-setup.ts` (review fix — sets `IS_REACT_ACT_ENVIRONMENT`)

**Modified files:**

- `packages/db/schema/index.ts` (export `votes`)
- `packages/shared/validation/score.schema.ts` (`submitVoteSchema`, `submitOrganizerVoteSchema`, `VOTE_CHOICES`)
- `packages/shared/errors/error-codes.ts` (`BATTLES_NOT_ACTIVE`, `MATCHUP_*`, `VOTE_OUTSIDE_OPTIONS`)
- `packages/shared/events/scoring-events.ts` (`VoteSubmittedPayload`, `VoteSubmittedEvent`)
- `packages/shared/events/socket-event-map.ts` (`'vote.submitted'`)
- `packages/formats/cypher-battles/src/ui/judge-vote-input.tsx` (full implementation, replacing the stub)
- `packages/formats/cypher-battles/src/index.ts` (export `JudgeVoteInput` as a value)
- `apps/api/src/modules/websocket/competition-gateway.interface.ts` (`broadcastVoteSubmitted`)
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts` (implement `broadcastVoteSubmitted`)
- `apps/api/src/trpc/routers/tournament.router.ts` (extend `validateJudgeToken`; add `getBattlesAssignment`, `submitVote`, `submitOrganizerVote`; new imports for `votes`, schemas, payload type)
- `apps/api/src/trpc/routers/tournament.router.spec.ts` (mock `broadcastVoteSubmitted`; describe blocks for `submitVote`, `getBattlesAssignment`, `submitOrganizerVote`)
- `apps/web/src/app/(judge)/judge/[token]/page.tsx` (phase router → `BattlesVotingScreen`; offline-queue submitFn dispatches by `kind`; `kind: 'score'` stamped on score submissions)
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx` (render `BattlesVotingPanel`)
- `apps/web/src/components/admin/dashboard-live-island.tsx` (`onVoteSubmitted` invalidates `getBracket`)
- `apps/web/src/hooks/use-judge-socket.ts` (`onVoteSubmitted`)
- `apps/web/src/hooks/use-admin-socket.ts` (`onVoteSubmitted`)
- `apps/web/src/hooks/use-admin-socket.spec.ts` (extend listener-coverage with `'vote.submitted'`)
- `apps/web/src/hooks/use-offline-queue.spec.ts` (use `QueuedScoreSubmission` type for the score builder; stamp `kind: 'score'`)
- `apps/web/src/lib/offline-queue.ts` (discriminated `QueuedSubmission` union with score/vote arms; legacy-entry normalization for back-compat)
- `apps/web/src/lib/offline-queue.spec.ts` (vote-shape round-trip + mixed ordering + legacy-no-`kind` back-compat + malformed-vote-rejected)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story status transitions)
- `_bmad-output/implementation-artifacts/5-2-judge-voting-interface-battles-mode.md` (this file)

## Change Log

- 2026-05-04: Story 5.2 created — judge battles-voting interface with `votes` table, `submitVote` + `submitOrganizerVote` mutations, `getBattlesAssignment` query, full `JudgeVoteInput` component, page-level phase router, and offline-queue generalization. Solo-mode admin voting panel included. Tally / advancement / tie-breaking explicitly deferred to Story 5.3; public bracket display deferred to Story 6.2.
- 2026-05-05: Story 5.2 implemented — all 20 tasks complete. 239 backend + 66 web tests passing; full CI gate green across api / web / shared / db / format-cypher-battles. Bracket-flow verification harness from Story 5.1 still green post-changes. Status moved `ready-for-dev → in-progress → review`. Manual dev-server verification deferred (same Clerk-credential blocker as Story 5.1).
- 2026-05-05: Adversarial review fixes applied. AC #10 fully realized: `broadcastVoteSubmitted` now fans out to admin + every per-judge room (`competition.gateway.ts:458-477`) using the in-memory presence map, with two new gateway tests. Misleading judge-page comment corrected to match new semantics. Migration `0014_add_votes.sql` switched from `CONSTRAINT UNIQUE` to `CREATE UNIQUE INDEX` to align with the Drizzle schema. Vitest setup file added (`apps/web/src/test-setup.ts`) and registered as `setupFiles` so React 19 `act()` is recognised — silences the `IS_REACT_ACT_ENVIRONMENT` warnings on the new component specs. Two missing test files created: `apps/web/src/components/judge/judge-vote-input.spec.tsx` (5 tests for the format component, hosted in apps/web because format-cypher-battles is node-env only) and `apps/web/src/hooks/use-judge-socket.spec.ts` (5 tests covering join + score/vote forwarding + disconnect cleanup). Final CI: 241 api + 76 web tests pass; lint/typecheck green. Status moved `review → done`.
