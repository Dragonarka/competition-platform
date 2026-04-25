# Story 3.3: Judge Scoring Interface (Cypher Mode)

Status: done <!-- 3rd adversarial review pass (2026-04-24) resolved 2 HIGH + 2 MEDIUM findings -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a judge,
I want to open my invite link and score each assigned participant on all criteria from my phone,
so that I can submit scores quickly and accurately during a live competition with zero training needed.

## Acceptance Criteria

1. Given I open my judge invite link on a mobile phone, when the page loads, then it loads in under 1 second on a 4G connection and I see the scoring interface immediately (NFR4).

2. Given I am on the scoring interface, when the current participant is displayed, then I see the participant name, ID, and all configured criteria with numeric input fields (FR30).

3. Given I enter scores for all criteria, when I tap the "Submit" button (56px+ touch target), then a confirmation appears within 500ms and the next participant is shown (NFR1, FR32).

4. Given I lock my phone screen mid-scoring, when I unlock it, then the scoring page is exactly where I left it with all entered values preserved (FR34).

5. Given I am on the scoring interface, when I am between participants or waiting for the next round, then I see "Waiting for next round..." — no competition management controls or other judges' data are visible (FR35).

6. And touch targets for all interactive elements are 56px minimum height/width, contrast meets WCAG AAA (7:1), and the full score-submit cycle completes in under 10 seconds.

## Tasks / Subtasks

- [x] Task 1: Implement scores DB schema and migration (AC: #2, #3)
  - [ ] `packages/db/schema/scoring.ts` — implement `scores` table: id (nanoid), competition_id (FK→competitions), judge_session_id (FK→judge_sessions), competitor_id (FK→competitors), idempotency_key (text UNIQUE), criteria_scores (jsonb `CriteriaScoreEntry[]`), created_at. Add unique index `uq_score_judge_competitor` on (judge_session_id, competitor_id)
  - [ ] `packages/db/schema/index.ts` already exports `./scoring` — verify no change needed (scoring was a stub, now real)
  - [ ] `packages/db/migrations/0008_add_scores.sql` — CREATE TABLE scores with all constraints and indexes

- [x] Task 2: Implement shared types — score schema, scoring events, socket event map (AC: #2, #3)
  - [ ] `packages/shared/validation/score.schema.ts` — implement `submitScoreSchema` and `SubmitScoreInput` type (see Dev Notes for exact Zod schema)
  - [ ] `packages/shared/events/scoring-events.ts` — implement `ScoreSubmittedPayload` and `ScoreSubmittedEvent` interfaces
  - [ ] `packages/shared/events/socket-event-map.ts` — implement `ServerToClientEvents` and `ClientToServerEvents` interfaces using types from tournament-events + scoring-events
  - [ ] `packages/shared/errors/error-codes.ts` — add `PHASE_NOT_ACTIVE`, `COMPETITOR_NOT_ASSIGNED`, `SCORE_OUTSIDE_RANGE`, `SCORE_ALREADY_SUBMITTED`
  - [ ] `packages/shared/index.ts` — verify `submitScoreSchema`, `ScoreSubmittedPayload`, `ServerToClientEvents`, `ClientToServerEvents` are exported (they should be via existing wildcard exports)

- [x] Task 3: Extend `getJudgeAssignments` and add `submitScore` tRPC procedure (AC: #2, #3)
  - [ ] `apps/api/src/trpc/routers/tournament.router.ts` — extend `getJudgeAssignments` to also return `criteria[]` (from evaluation_criteria) and `scoredCompetitorIds[]` (from scores table where judgeSessionId matches)
  - [ ] `apps/api/src/trpc/routers/tournament.router.ts` — add `submitScore` public procedure: validate token hash → verify competition active → idempotency check → verify competitor assignment → validate scores via scoreValidator → DB transaction (insert score + insert score.submitted event) → broadcast via gateway → return `{ success, idempotent }`
  - [ ] `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add `broadcastScoreSubmitted(competitionId: string, payload: ScoreSubmittedPayload): void` to `ICompetitionGateway`

- [x] Task 4: Implement WsAuthGuard and add broadcastScoreSubmitted to gateway (AC: #3)
  - [ ] `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — add `broadcastScoreSubmitted` method: broadcasts `score.submitted` to `competition:{id}:admin` and `competition:{id}:public` rooms
  - [ ] `apps/api/src/modules/websocket/guards/ws-auth.guard.ts` — implement real judge token validation: extract `token` from `client.handshake.query`, hash it, query `judge_sessions` table, attach `judgeSessionId` + `competitionId` to `client.data`, disconnect and return false if invalid
  - [ ] `apps/api/src/modules/websocket/websocket.module.ts` — add `WsAuthGuard` to providers list (do NOT import DatabaseModule — it is `@Global()` so DatabaseService is already globally available)

- [x] Task 5: Implement JudgeScoreInput component (AC: #2, #3, #6)
  - [ ] `packages/formats/cypher-battles/src/ui/judge-score-input.tsx` — full implementation: show competitorName + participantId, render one numeric input per criterion (min/max labels, step="0.01"), Submit button. All interactive elements MUST use `min-h-[56px] min-w-[56px]` Tailwind classes. High-contrast text (dark on light or light on dark). Inputs accept decimal values and convert to "X.XX" on blur/submit. Update `JudgeScoreInputProps` to include `participantId: string` and `defaultValues?: Record<string, string>` for localStorage restore.
  - [ ] Export type update in `packages/formats/cypher-battles/src/index.ts` — ensure updated `JudgeScoreInputProps` type is exported

- [x] Task 6: Add dependencies — Zustand, socket.io-client, cypher-battles format (AC: #3, #4)
  - [ ] `pnpm add zustand --filter @competition-platform/web`
  - [ ] `pnpm add socket.io-client --filter @competition-platform/web`
  - [ ] `pnpm add @competition-platform/format-cypher-battles --filter @competition-platform/web` (workspace:\*)
  - [ ] `apps/web/src/stores/scoring.store.ts` — create Zustand store with `submissionStatus: 'idle'|'sending'|'confirmed'|'error'`, `setSubmissionStatus()` — intentionally minimal; draft scores live in local component state + localStorage only
  - [ ] `apps/web/src/hooks/use-judge-socket.ts` — Socket.IO hook connecting to `/competition` namespace with `{ query: { token } }`, joining judge room on connect, forwarding `competition.started` and `score.submitted` events to callbacks

- [x] Task 7: Implement full judge scoring page (AC: #1, #2, #3, #4, #5)
  - [ ] `apps/web/src/app/(judge)/judge/[token]/page.tsx` — complete rewrite: loading state → validate token → if competition=draft show "Waiting for competition to start..." with 5s polling (TanStack Query `refetchInterval`) + WS `competition.started` event triggers refetch → if competition=active fetch `getJudgeAssignments` (criteria + scoredCompetitorIds) → render `JudgeScoreInput` for first unscored competitor → on submit call `submitScore` mutation → on success: clear localStorage draft, mark competitor scored, advance to next → when all scored show "Waiting for next round..."
  - [ ] localStorage integration: save draft on every input `onChange` with key `judge-draft-${judgeSessionId}-${competitorId}`, restore via `defaultValues` prop on `JudgeScoreInput` mount, clear on successful submit
  - [ ] Connection status dot (green/yellow/red) based on socket state visible at top of page

- [x] Task 8: Write tests (AC: #2, #3)
  - [ ] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add tests for `submitScore`: valid submission, invalid token (NOT_FOUND), competition not active (PHASE_NOT_ACTIVE), competitor not in judge's group (COMPETITOR_NOT_ASSIGNED), idempotent retry returns success without DB insert, score value out of range (SCORE_OUTSIDE_RANGE)
  - [ ] `apps/api/src/trpc/routers/tournament.router.spec.ts` — extend `getJudgeAssignments` tests: verify criteria and scoredCompetitorIds are returned when phase started

- [x] Task 9: CI verification — `pnpm exec turbo run lint typecheck test` — all pass

## Dev Notes

### ⚠️ CRITICAL: Next.js Version Warning

The AGENTS.md in `apps/web/` warns: **"This is NOT the Next.js you know — APIs, conventions, and file structure may differ. Read `node_modules/next/dist/docs/` before writing any code."** Use `'use client'` only where genuinely needed. The judge page needs client-side state (form inputs, localStorage, socket), so it stays as a client component.

### Architecture Mandate: Scores as Strings

**NEVER store or transmit scores as floats.** All criterion values are `string` type formatted as `"X.XX"` (e.g., `"8.75"`). Convert user input via `parseFloat(input).toFixed(2)` before submitting. Reject values that don't match `/^\d+\.\d{2}$/` server-side.
[Source: architecture.md#Format Patterns — Scores: String with 2 decimal places]

### Architecture Mandate: Format Isolation

`apps/api` and `apps/web` MUST NOT import scoring rules from `@competition-platform/format-cypher-battles` without a `// TODO: load from format registry` comment. For Story 3.3, direct import is the accepted MVP shortcut, identical to Story 3.2's `roundRobinAssign` precedent.
[Source: architecture.md#Enforcement Guidelines — Anti-Patterns to Avoid]

### DB Schema: scores table

Implement `packages/db/schema/scoring.ts` (replaces the `export {};` stub):

```typescript
import { pgTable, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';
import { judgeSessions } from './judge-sessions';
import { competitors } from './competitors';

export interface CriteriaScoreEntry {
  criterionId: string;
  value: string; // "X.XX" string — never float
}

export const scores = pgTable(
  'scores',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    judgeSessionId: text('judge_session_id')
      .notNull()
      .references(() => judgeSessions.id, { onDelete: 'cascade' }),
    competitorId: text('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    criteriaScores: jsonb('criteria_scores').$type<CriteriaScoreEntry[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_score_judge_competitor').on(table.judgeSessionId, table.competitorId),
  ],
);

export type ScoreRow = typeof scores.$inferSelect;
export type NewScoreRow = typeof scores.$inferInsert;
```

**Note**: `packages/db/schema/index.ts` already has `export * from './scoring';` — no change needed once the stub is replaced.

### DB Migration: 0008_add_scores.sql

```sql
-- Judge score submissions (one score per judge per competitor)
CREATE TABLE IF NOT EXISTS "scores" (
  "id" text PRIMARY KEY NOT NULL,
  "competition_id" text NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "judge_session_id" text NOT NULL REFERENCES "judge_sessions"("id") ON DELETE CASCADE,
  "competitor_id" text NOT NULL REFERENCES "competitors"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL UNIQUE,
  "criteria_scores" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_score_judge_competitor" UNIQUE ("judge_session_id", "competitor_id")
);

CREATE INDEX IF NOT EXISTS "idx_scores_competition" ON "scores" ("competition_id");
CREATE INDEX IF NOT EXISTS "idx_scores_judge_session" ON "scores" ("judge_session_id");
```

### Shared: submitScoreSchema

Replace the `export {};` stub in `packages/shared/validation/score.schema.ts`:

```typescript
import { z } from 'zod';

export const criterionScoreSchema = z.object({
  criterionId: z.string().min(1),
  value: z.string().regex(/^\d+\.\d{2}$/, 'Score must be formatted as X.XX (e.g. "8.75")'),
});

export const submitScoreSchema = z.object({
  token: z.string().min(1, 'Judge token is required'),
  competitorId: z.string().min(1, 'Competitor ID is required'),
  scores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
```

### Shared: scoring-events.ts

Replace the double `export {};` stub:

```typescript
export interface ScoreSubmittedPayload {
  judgeSessionId: string;
  competitorId: string;
  competitionId: string;
  scores: { criterionId: string; value: string }[];
  idempotencyKey: string;
  submittedAt: string; // ISO 8601
}

export interface ScoreSubmittedEvent {
  type: 'score.submitted';
  aggregateId: string; // competitionId
  aggregateType: 'competition';
  payload: ScoreSubmittedPayload;
  createdBy: string; // judgeSessionId
  createdAt: string;
  sequence: number;
}
```

### Shared: socket-event-map.ts

Replace the double `export {};` stub:

```typescript
import type { CompetitionStartedPayload } from './tournament-events';
import type { ScoreSubmittedPayload } from './scoring-events';

export interface ServerToClientEvents {
  'competition.started': (data: CompetitionStartedPayload) => void;
  'score.submitted': (data: ScoreSubmittedPayload) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'join.judge': (data: { competitionId: string; sessionId: string }) => void;
  'join.admin': (data: { competitionId: string }) => void;
  'join.public': (data: { competitionId: string }) => void;
}
```

### Shared: error-codes.ts (additions)

Add to the existing `ErrorCodes` object:

```typescript
export const ErrorCodes = {
  // --- existing ---
  COMPETITION_ALREADY_STARTED: 'COMPETITION_ALREADY_STARTED',
  JUDGE_CONFIG_MISSING: 'JUDGE_CONFIG_MISSING',
  NO_CRITERIA_DEFINED: 'NO_CRITERIA_DEFINED',
  NO_PARTICIPANTS_REGISTERED: 'NO_PARTICIPANTS_REGISTERED',
  INSUFFICIENT_JUDGE_LINKS: 'INSUFFICIENT_JUDGE_LINKS',
  // --- new in 3.3 ---
  PHASE_NOT_ACTIVE: 'PHASE_NOT_ACTIVE',
  COMPETITOR_NOT_ASSIGNED: 'COMPETITOR_NOT_ASSIGNED',
  SCORE_OUTSIDE_RANGE: 'SCORE_OUTSIDE_RANGE',
  SCORE_ALREADY_SUBMITTED: 'SCORE_ALREADY_SUBMITTED',
} as const;
```

### tRPC: Extended getJudgeAssignments

Extend the existing `getJudgeAssignments` procedure in `tournament.router.ts` to return criteria and scored competitor IDs. Add two extra queries after the `assigned` competitors query:

```typescript
// Inside getJudgeAssignments, after fetching assigned competitors:
const criteriaRows = await db.db
  .select({
    id: evaluationCriteria.id,
    name: evaluationCriteria.name,
    minScore: evaluationCriteria.minScore,
    maxScore: evaluationCriteria.maxScore,
    displayOrder: evaluationCriteria.displayOrder,
  })
  .from(evaluationCriteria)
  .where(eq(evaluationCriteria.competitionId, session.competitionId))
  .orderBy(evaluationCriteria.displayOrder);

const scoredRows = await db.db
  .select({ competitorId: scores.competitorId })
  .from(scores)
  .where(eq(scores.judgeSessionId, session.id));
const scoredCompetitorIds = scoredRows.map((r) => r.competitorId);

return {
  judgeSessionId: session.id,
  label: session.label,
  competitionId: session.competitionId,
  phaseStarted: true,
  assignedCompetitors: assigned,
  criteria: criteriaRows,
  scoredCompetitorIds,
};
```

Also update the `phaseStarted: false` return to include empty arrays:

```typescript
return {
  judgeSessionId: session.id,
  label: session.label,
  competitionId: session.competitionId,
  phaseStarted: false,
  assignedCompetitors: [],
  criteria: [],
  scoredCompetitorIds: [],
};
```

Add `scores` to the imports from `@competition-platform/db` at the top of `tournament.router.ts`.

### tRPC: submitScore Mutation

Add to `tournament.router.ts`. Import at the top: `submitScoreSchema`, `ScoreSubmittedPayload`, `SubmitScoreInput` from `@competition-platform/shared`. Import `ScorePayload` from `@competition-platform/format-sdk`. Import scoreValidator directly (MVP shortcut):

```typescript
// TODO: load from format registry — see format-loader.service.ts (post-MVP)
import { scoreValidator as cypherScoreValidator } from '@competition-platform/format-cypher-battles/src/validators/score-validator';
```

Add `submitScoreSchema` to the shared imports and add the procedure:

```typescript
submitScore: t.procedure
  .input(submitScoreSchema)
  .mutation(async ({ input }) => {
    return db.db.transaction(async (tx) => {
      // 1. Validate token
      const hash = createHash('sha256').update(input.token).digest('hex');
      const [session] = await tx
        .select({
          id: judgeSessions.id,
          competitionId: judgeSessions.competitionId,
          groupIndex: judgeSessions.groupIndex,
        })
        .from(judgeSessions)
        .where(eq(judgeSessions.tokenHash, hash));
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge link not valid' });
      }

      // 2. Validate competition is active
      const [comp] = await tx
        .select({ status: competitions.status })
        .from(competitions)
        .where(eq(competitions.id, session.competitionId));
      if (!comp || comp.status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Competition is not in active scoring phase',
          cause: { errorCode: ErrorCodes.PHASE_NOT_ACTIVE },
        });
      }

      // 3. Idempotency check — same key = already processed
      const [existing] = await tx
        .select({ id: scores.id })
        .from(scores)
        .where(eq(scores.idempotencyKey, input.idempotencyKey));
      if (existing) {
        return { success: true, idempotent: true };
      }

      // 4. Validate judge has been assigned a group
      if (session.groupIndex === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Competition phase has not started yet',
          cause: { errorCode: ErrorCodes.PHASE_NOT_ACTIVE },
        });
      }

      // 5. Validate competitor is assigned to this judge's group
      const [assignment] = await tx
        .select({ groupIndex: competitorGroupAssignments.groupIndex })
        .from(competitorGroupAssignments)
        .where(
          and(
            eq(competitorGroupAssignments.competitionId, session.competitionId),
            eq(competitorGroupAssignments.competitorId, input.competitorId),
          ),
        );
      if (!assignment || assignment.groupIndex !== session.groupIndex) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Competitor is not assigned to your judge group',
          cause: { errorCode: ErrorCodes.COMPETITOR_NOT_ASSIGNED },
        });
      }

      // 6. Validate scores via format SDK — TODO: load from format registry
      const scorePayload: ScorePayload = {
        judgeId: session.id,
        competitorId: input.competitorId,
        roundId: session.competitionId, // cypher phase roundId = competitionId
        scores: input.scores,
        idempotencyKey: input.idempotencyKey,
      };
      const validationResult = cypherScoreValidator(scorePayload, {
        competitionId: session.competitionId,
        formatId: 'cypher-battles',
        config: {},
      });
      if (!validationResult.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validationResult.errors.join('; '),
          cause: { errorCode: ErrorCodes.SCORE_OUTSIDE_RANGE },
        });
      }

      // 7. Get next event sequence
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

      // 8. Persist score (unique constraint: judgeSessionId + competitorId)
      await tx.insert(scores).values({
        competitionId: session.competitionId,
        judgeSessionId: session.id,
        competitorId: input.competitorId,
        idempotencyKey: input.idempotencyKey,
        criteriaScores: input.scores as CriteriaScoreEntry[],
      });

      // 9. Persist domain event
      const payload: ScoreSubmittedPayload = {
        judgeSessionId: session.id,
        competitorId: input.competitorId,
        competitionId: session.competitionId,
        scores: input.scores,
        idempotencyKey: input.idempotencyKey,
        submittedAt: new Date().toISOString(),
      };
      await tx.insert(events).values({
        type: 'score.submitted',
        aggregateId: session.competitionId,
        aggregateType: 'competition',
        payload: payload as Record<string, unknown>,
        sequence: nextSeq,
        createdBy: session.id,
      });

      // 10. Broadcast to admin + public rooms
      gateway.broadcastScoreSubmitted(session.competitionId, payload);

      return { success: true, idempotent: false };
    });
  }),
```

Import `CriteriaScoreEntry` from `@competition-platform/db` (from the scoring schema). Import `ScorePayload` from `@competition-platform/format-sdk`. Import `submitScoreSchema`, `ScoreSubmittedPayload` from `@competition-platform/shared`.

### ICompetitionGateway Interface Update

Add `broadcastScoreSubmitted` to `apps/api/src/modules/websocket/competition-gateway.interface.ts`:

```typescript
import type {
  CompetitionStartedPayload,
  ScoreSubmittedPayload,
} from '@competition-platform/shared';

export interface ICompetitionGateway {
  broadcastCompetitionStarted(competitionId: string, payload: CompetitionStartedPayload): void;
  broadcastScoreSubmitted(competitionId: string, payload: ScoreSubmittedPayload): void;
}
```

### CompetitionGateway: broadcastScoreSubmitted

Add to `apps/api/src/modules/websocket/gateways/competition.gateway.ts`:

```typescript
broadcastScoreSubmitted(
  competitionId: string,
  payload: ScoreSubmittedPayload,
): void {
  const adminRoom = `competition:${competitionId}:admin`;
  const publicRoom = `competition:${competitionId}:public`;
  this.server.to(adminRoom).to(publicRoom).emit('score.submitted', payload);
  this.logger.log(`Broadcast score.submitted for competitor ${payload.competitorId}`);
}
```

Import `ScoreSubmittedPayload` from `@competition-platform/shared`.

### WsAuthGuard Implementation

Replace the stub in `apps/api/src/modules/websocket/guards/ws-auth.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { judgeSessions } from '@competition-platform/db';
import { DatabaseService } from '../../database/database.service';
import type { Socket } from 'socket.io';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const token = client.handshake.query['token'];
    if (typeof token !== 'string' || token.length === 0) {
      client.disconnect();
      return false;
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const [session] = await this.db.db
      .select({
        id: judgeSessions.id,
        competitionId: judgeSessions.competitionId,
      })
      .from(judgeSessions)
      .where(eq(judgeSessions.tokenHash, hash));
    if (!session) {
      client.disconnect();
      return false;
    }
    client.data['judgeSessionId'] = session.id;
    client.data['competitionId'] = session.competitionId;
    return true;
  }
}
```

### WebsocketModule: Add WsAuthGuard

Update `apps/api/src/modules/websocket/websocket.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CompetitionGateway } from './gateways/competition.gateway';
import { WsAuthGuard } from './guards/ws-auth.guard';

@Module({
  providers: [CompetitionGateway, WsAuthGuard],
  exports: [CompetitionGateway],
})
export class WebsocketModule {}
```

**NOTE**: `DatabaseModule` is `@Global()` — `DatabaseService` is already globally available. Do NOT add `DatabaseModule` to `WebsocketModule` imports. NestJS resolves the global provider automatically.
[Source: apps/api/src/modules/database/database.module.ts — `@Global()` decorator confirmed]

### JudgeScoreInput Component

Full implementation for `packages/formats/cypher-battles/src/ui/judge-score-input.tsx`. The component must:

- Accept `competitorId`, `competitorName`, `participantId`, `criteria[]`, `defaultValues?: Record<string, string>`, and `onSubmit`
- Render each criterion as a labeled numeric input — use `type="number"` with `min`, `max`, `step="0.01"` attributes
- On submit: convert each input value to `parseFloat(value).toFixed(2)` string before calling `onSubmit`
- All inputs and the submit button MUST use `min-h-[56px]` class (56px touch target)
- Submit button should be full width with high contrast background
- Show validation error inline if any value is empty or out of range

```typescript
'use client';
import { useState } from 'react';

export interface JudgeScoreInputProps {
  competitorId: string;
  competitorName: string;
  participantId: string;
  criteria: Array<{ id: string; name: string; min: number; max: number }>;
  defaultValues?: Record<string, string>;
  onSubmit: (scores: Record<string, string>) => void | Promise<void>;
  onValuesChange?: (values: Record<string, string>) => void; // for localStorage draft save
  disabled?: boolean;
}

export function JudgeScoreInput({
  competitorName,
  participantId,
  criteria,
  defaultValues = {},
  onSubmit,
  onValuesChange,
  disabled = false,
}: JudgeScoreInputProps) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(criterionId: string, raw: string) {
    const next = { ...values, [criterionId]: raw };
    setValues(next);
    setError(null);
    onValuesChange?.(next); // save draft to localStorage via parent
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validate all criteria have values
    for (const c of criteria) {
      const v = parseFloat(values[c.id] ?? '');
      if (isNaN(v) || v < c.min || v > c.max) {
        setError(`${c.name}: enter a value between ${c.min} and ${c.max}`);
        return;
      }
    }
    const formatted = Object.fromEntries(
      criteria.map((c) => [c.id, parseFloat(values[c.id]!).toFixed(2)]),
    );
    setSubmitting(true);
    try {
      await onSubmit(formatted);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="mb-2">
        <p className="text-lg font-bold">{competitorName}</p>
        <p className="text-sm text-muted-foreground">ID: {participantId}</p>
      </div>
      {criteria.map((c) => (
        <div key={c.id} className="flex flex-col gap-1">
          <label htmlFor={c.id} className="font-medium text-sm">
            {c.name} ({c.min}–{c.max})
          </label>
          <input
            id={c.id}
            type="number"
            min={c.min}
            max={c.max}
            step="0.01"
            value={values[c.id] ?? ''}
            onChange={(e) => handleChange(c.id, e.target.value)}
            disabled={disabled || submitting}
            className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-xl font-semibold"
            required
          />
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={disabled || submitting}
        className="min-h-[56px] w-full rounded-md bg-primary text-primary-foreground font-bold text-lg disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Score'}
      </button>
    </form>
  );
}
```

**Note**: This component lives in `packages/formats/cypher-battles` but is used in `apps/web` via direct import (MVP shortcut). Add `// TODO: load via FormatRenderer once format registry is implemented` comment at import site in the judge page.

### use-judge-socket Hook

Create `apps/web/src/hooks/use-judge-socket.ts`:

```typescript
'use client';
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@competition-platform/shared';

type JudgeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseJudgeSocketOptions {
  token: string;
  judgeSessionId: string;
  competitionId: string;
  onCompetitionStarted?: () => void;
  onScoreSubmitted?: () => void;
  onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}

export function useJudgeSocket(opts: UseJudgeSocketOptions) {
  const socketRef = useRef<JudgeSocket | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const socket = io(`${apiUrl}/competition`, {
      query: { token: opts.token },
      transports: ['websocket'],
    }) as JudgeSocket;

    socket.on('connect', () => {
      optsRef.current.onStatusChange?.('connected');
      socket.emit('join.judge', {
        competitionId: opts.competitionId,
        sessionId: opts.judgeSessionId,
      });
    });

    socket.on('disconnect', () => {
      optsRef.current.onStatusChange?.('disconnected');
    });

    socket.on('connect_error', () => {
      optsRef.current.onStatusChange?.('reconnecting');
    });

    socket.on('competition.started', () => {
      optsRef.current.onCompetitionStarted?.();
    });

    socket.on('score.submitted', () => {
      optsRef.current.onScoreSubmitted?.();
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
    };
  }, [opts.token, opts.competitionId, opts.judgeSessionId]);

  return socketRef;
}
```

### Zustand Store

Create `apps/web/src/stores/scoring.store.ts`:

```typescript
import { create } from 'zustand';

type SubmissionStatus = 'idle' | 'sending' | 'confirmed' | 'error';
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface ScoringState {
  submissionStatus: SubmissionStatus;
  connectionStatus: ConnectionStatus;
  setSubmissionStatus: (status: SubmissionStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useScoringStore = create<ScoringState>((set) => ({
  submissionStatus: 'idle',
  connectionStatus: 'disconnected',
  setSubmissionStatus: (submissionStatus) => set({ submissionStatus }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
```

### Judge Page: Full Implementation

The judge page `apps/web/src/app/(judge)/judge/[token]/page.tsx` must implement this flow:

**State machine:**

```
validating → [error: invalid link] → error screen
           → [success: draft] → "Waiting for competition to start..." (poll every 5s + WS)
           → [success: active] → fetch getJudgeAssignments
                               → [remaining > 0] → show JudgeScoreInput
                               → [all scored] → "Waiting for next round..."
```

**localStorage pattern:**

```typescript
const DRAFT_KEY = (judgeSessionId: string, competitorId: string) =>
  `judge-draft-${judgeSessionId}-${competitorId}`;

// Save on input change (called from JudgeScoreInput's parent via onValuesChange callback)
localStorage.setItem(DRAFT_KEY(sid, cid), JSON.stringify(values));

// Restore on mount
const stored = localStorage.getItem(DRAFT_KEY(sid, cid));
const defaultValues = stored ? (JSON.parse(stored) as Record<string, string>) : {};

// Clear on successful submit
localStorage.removeItem(DRAFT_KEY(sid, cid));
```

**⚠️ JudgeScoreInput needs a `onValuesChange` callback** for the parent to save to localStorage. Add this prop: `onValuesChange?: (values: Record<string, string>) => void`.

**TanStack Query for polling:**

```typescript
const { data: tokenData, refetch } = trpc.tournament.validateJudgeToken.useQuery(
  { token },
  {
    retry: false,
    // Poll when competition is draft so page auto-advances when organizer starts
    refetchInterval: tokenData?.competitionStatus === 'draft' ? 5000 : false,
  },
);
```

**Connection status dot:**

```tsx
const statusColors = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-500',
};

<div className="fixed top-3 right-3 flex items-center gap-2">
  <div className={`w-3 h-3 rounded-full ${statusColors[connectionStatus]}`} />
  <span className="text-xs text-muted-foreground">
    {connectionStatus === 'connected' ? 'Online' : connectionStatus}
  </span>
</div>;
```

**Idempotency key generation:**

```typescript
const idempotencyKey = crypto.randomUUID();
```

**Submit handler:**

```typescript
const submitScoreMutation = trpc.tournament.submitScore.useMutation();

async function handleScoreSubmit(formattedScores: Record<string, string>) {
  const idempotencyKey = crypto.randomUUID();
  setSubmissionStatus('sending');
  try {
    await submitScoreMutation.mutateAsync({
      token,
      competitorId: currentCompetitor.id,
      scores: Object.entries(formattedScores).map(([criterionId, value]) => ({
        criterionId,
        value,
      })),
      idempotencyKey,
    });
    localStorage.removeItem(DRAFT_KEY(judgeSessionId, currentCompetitor.id));
    setSubmissionStatus('confirmed');
    // Brief confirmation display, then advance
    setTimeout(() => {
      setScoredCompetitorIds((prev) => [...prev, currentCompetitor.id]);
      setSubmissionStatus('idle');
    }, 800);
  } catch (err) {
    setSubmissionStatus('error');
  }
}
```

### Test Cases for submitScore

In `tournament.router.spec.ts`, add these test cases (follow existing mock patterns using `vi.fn()`):

```
describe('submitScore', () => {
  test('valid submission: inserts score + event, returns { success: true, idempotent: false }')
  test('invalid token: throws NOT_FOUND')
  test('competition not active (draft status): throws BAD_REQUEST with PHASE_NOT_ACTIVE')
  test('idempotent retry (same idempotencyKey): returns { success: true, idempotent: true } without DB insert')
  test('competitor not in judge group: throws BAD_REQUEST with COMPETITOR_NOT_ASSIGNED')
  test('score value out of criterion range: throws BAD_REQUEST with SCORE_OUTSIDE_RANGE')
})
```

### Project Structure Notes

**New files:**

```
packages/db/migrations/0008_add_scores.sql             (new migration)
apps/web/src/stores/scoring.store.ts                   (new Zustand store)
apps/web/src/hooks/use-judge-socket.ts                 (new Socket.IO hook)
```

**Modified files:**

```
packages/db/schema/scoring.ts                          (implement from stub)
packages/shared/validation/score.schema.ts             (implement from stub)
packages/shared/events/scoring-events.ts               (implement from stub)
packages/shared/events/socket-event-map.ts             (implement from stub)
packages/shared/errors/error-codes.ts                  (add 4 scoring error codes)
packages/formats/cypher-battles/src/ui/judge-score-input.tsx  (implement from stub)
apps/api/src/modules/websocket/guards/ws-auth.guard.ts (implement from stub)
apps/api/src/modules/websocket/competition-gateway.interface.ts (add broadcastScoreSubmitted)
apps/api/src/modules/websocket/gateways/competition.gateway.ts (add broadcastScoreSubmitted)
apps/api/src/modules/websocket/websocket.module.ts     (add WsAuthGuard as provider — no new imports)
apps/api/src/trpc/routers/tournament.router.ts         (add submitScore, extend getJudgeAssignments)
apps/api/src/trpc/routers/tournament.router.spec.ts    (add submitScore tests)
apps/web/src/app/(judge)/judge/[token]/page.tsx        (full scoring interface)
apps/web/package.json                                  (add zustand, socket.io-client, format-cypher-battles)
pnpm-lock.yaml                                         (updated by pnpm)
```

### New Tournament Router Imports for Story 3.3

Add to the imports at the top of `tournament.router.ts`:

```typescript
import { scores } from '@competition-platform/db'; // add to existing db import
import type { CriteriaScoreEntry } from '@competition-platform/db'; // from scoring.ts
import { submitScoreSchema } from '@competition-platform/shared'; // add to existing shared import
import type { ScoreSubmittedPayload } from '@competition-platform/shared';
import type { ScorePayload } from '@competition-platform/format-sdk';
// TODO: load from format registry — see format-loader.service.ts (post-MVP)
import { scoreValidator as cypherScoreValidator } from '@competition-platform/format-cypher-battles/src/validators/score-validator';
```

**Also ensure `scores` is added inside the destructured import from `@competition-platform/db`** (alongside `competitions`, `evaluationCriteria`, etc.).

### Gotchas from Previous Stories (Still Apply)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy at `apps/web/src/proxy.ts`. The judge route `(judge)/judge/[token]` is public (no Clerk auth needed). Verify `apps/web/src/proxy.ts` doesn't block the judge route.
2. **No floating point scores**: Convert with `parseFloat(input).toFixed(2)` before submitting. Validate with regex `/^\d+\.\d{2}$/` server-side.
3. **No `any` type**: Use `unknown` + type guards. `client.data['judgeSessionId']` uses bracket notation to avoid TypeScript complaints; Socket.IO's `Socket['data']` is typed as `Record<string, unknown>`.
4. **`pnpm install` after adding deps**: Run `pnpm install` at the workspace root after modifying `apps/web/package.json`.
5. **Socket.IO WsAuthGuard inside NestJS transaction**: The WsAuthGuard runs asynchronously before any handler. `client.disconnect()` in the guard is safe.
6. **`@WebSocketServer()` undefined before init**: Already noted in 3.2 — don't call `broadcastScoreSubmitted` in constructors.
7. **`crypto.randomUUID()` requires secure context**: Only available in HTTPS or localhost. In production on HTTPS this is always fine. For local dev, Next.js dev server runs on localhost (secure context). If you somehow need HTTP non-localhost, use `nanoid()` as fallback.
8. **Drizzle `max()` returns null for empty table**: Handle `(maxSeq ?? 0) + 1` — already established pattern from 3.2.
9. **Double `export {};` in stub files**: `scoring-events.ts` and `socket-event-map.ts` both have `export {}; export {};` — replace the entire file, not just one line.
10. **`criteria_scores` JSONB type**: Drizzle's `.$type<CriteriaScoreEntry[]>()` is for TypeScript inference only — no runtime validation. The Zod schema and scoreValidator handle actual validation.
11. **Unique constraint on scores `(judgeSessionId, competitorId)`**: If a judge somehow triggers two different idempotency-key submissions for the same competitor (e.g., double-tap), the second will fail on the DB unique constraint, not the idempotency check. This is correct behavior and the frontend should disable the Submit button after first tap.
12. **WsAuthGuard applied at gateway level**: Use `@UseGuards(WsAuthGuard)` on the `CompetitionGateway` class. Guards in NestJS WebSocket context work differently from HTTP — they run during the WebSocket handshake/upgrade, not per-message.
13. **Next.js AGENTS.md warning**: Read `node_modules/next/dist/docs/` before implementing any Next.js-specific patterns (App Router, server components, client components, PPR). The version in use is 16.2.3.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3 — FR30, FR32, FR34, FR35, NFR1, NFR4]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3 — System-generated judge group assignments, FR11-FR19]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — Domain Event Envelope]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — Socket.IO Event Map]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend — State Management Patterns (Zustand stores)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend — Offline scoring: localStorage + Service Worker]
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns — Scores: String with 2 decimal places]
- [Source: _bmad-output/planning-artifacts/architecture.md#API Patterns — Idempotency: Client-generated idempotency keys]
- [Source: _bmad-output/planning-artifacts/architecture.md#Loading & Connection State Conventions]
- [Source: _bmad-output/implementation-artifacts/3-2-cypher-phase-start-and-judge-group-assignment.md#Dev Notes — Gotchas from Previous Stories]
- [Source: _bmad-output/implementation-artifacts/3-2-cypher-phase-start-and-judge-group-assignment.md#Senior Developer Review (AI) — deferred WsAuthGuard and socket-event-map]
- [Source: packages/formats/cypher-battles/src/validators/score-validator.ts — scoreValidator function]
- [Source: packages/formats/cypher-battles/src/scoring/cypher-scoring.schema.ts — CYPHER_DEFAULT_CRITERIA]
- [Source: packages/formats/cypher-battles/src/ui/judge-score-input.tsx — existing stub with JudgeScoreInputProps interface]
- [Source: apps/api/src/trpc/routers/tournament.router.ts — existing getJudgeAssignments procedure pattern]
- [Source: apps/web/src/app/(judge)/judge/[token]/page.tsx — existing validateJudgeToken usage pattern]
- [Source: apps/web/src/lib/trpc.tsx — tRPC client setup (no auth header for public procedures)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `@competition-platform/format-cypher-battles` needed a `./validators` subpath export + `typesVersions` entry to be importable from the API (no JSX in API tsconfig). Root index.ts intentionally kept JSX-free for API import safety.
- `useLayoutEffect` required instead of direct `optsRef.current = opts` during render — Next.js 16 ESLint `react-hooks/refs` rule flags ref updates outside effects.
- `refetchInterval` callback form `(query) => ...` required because TypeScript can't use a variable in its own initializer (self-referential `tokenData`).
- `client.data as Record<string, unknown>` cast needed in WsAuthGuard — Socket.IO's `Socket.data` is typed as `any` by default, triggering `@typescript-eslint/no-unsafe-member-access`.

### Code Review Fixes (AI Adversarial Review — Round 3, 2026-04-24)

- **H1 — X-Forwarded-For IP spoofing bypassed rate limits**: `extractClientIp` in `trpc.module.ts` used `req.headers['x-forwarded-for'].split(',')[0]` — the leftmost (client-controlled) value. A malicious judge could rotate fake IPs to bypass per-IP rate limits entirely. Fixed: `extractClientIp` now uses `req.socket.remoteAddress` exclusively (the actual TCP connection IP, not spoofable via headers). Comment added explaining that trusted-proxy deployments should instead configure Express `trust proxy` and use `req.ip`.
- **H2 — Event sequence numbers not unique under concurrent load**: The events table had only plain indexes — no UNIQUE constraint on `(aggregate_id, aggregate_type, sequence)`. Under Postgres READ COMMITTED isolation, two concurrent `submitScore` calls for the same competition both read `max(events.sequence) = N`, both compute `nextSeq = N+1`, and both successfully insert events with `sequence = N+1`, producing duplicate sequence numbers in the event log. This would break story 3.4's aggregation/replay logic. Fixed: added `uniqueIndex('uq_events_aggregate_sequence').on(aggregateId, aggregateType, sequence)` to `packages/db/schema/events.ts` and created migration `0009_add_events_sequence_unique.sql`. The event insert in `submitScore` now catches `23505` and maps it to a retriable `INTERNAL_SERVER_ERROR`.
- **M1 — Rate limiter BUCKETS Map leaked memory indefinitely**: Each unique IP/procedure key created a Map entry that was never evicted. After an event with hundreds of judges, all past bucket entries (fully expired) stayed in memory indefinitely. Fixed: added `maybeSweep()` (called on 2% of `enforceRateLimit` invocations) that deletes Map entries where all timestamps have expired. Added `windowMs` to the `Bucket` interface so each bucket tracks its own expiry window regardless of which procedure's window is used during the sweep.
- **M2 — WebSocket broadcast fired before transaction commits**: `gateway.broadcastScoreSubmitted()` was called inside `db.db.transaction()`. If the transaction rolled back after the broadcast (e.g., due to a DB error), judges would receive a `score.submitted` WebSocket event for a score that was never persisted. Fixed: a `broadcastPayload` closure variable captures the payload inside the transaction; the broadcast now fires after `await transaction(...)` resolves. The event insert also has a new try/catch that maps sequence-collision 23505 errors to a retriable `INTERNAL_SERVER_ERROR`.

### Code Review Fixes (AI Adversarial Review — Round 2, 2026-04-24)

The first adversarial pass fixed `H1–H3/M1–M3` but introduced a false assumption that `@UseGuards` would intercept the WebSocket upgrade. Round 2 verifies NestJS actually runs guards only on `@SubscribeMessage` handlers, so several authentication gaps remained. All HIGH + MEDIUM findings below are now resolved.

- **H1 — WsAuthGuard did not protect the WebSocket handshake**: Moved token validation into `CompetitionGateway.handleConnection()`. Unauthenticated sockets now fail the handshake and `client.disconnect(true)` fires before any broadcast can reach them. `WsAuthGuard` was deleted (file removed) — the guard system cannot fulfill this role in NestJS. Story gotcha #12 corrected accordingly.
- **H2 — Room authorization: any token could join any room**: `handleJudgeJoin` now rejects unless `client.data.role === 'judge'` AND the request's `sessionId`/`competitionId` match the authenticated session. `handleAdminJoin` rejects all joins pending organizer WS auth (story 4.1). `handlePublicJoin` validates `competitionId` is present; public rooms carry no per-judge data so anonymous joins are fine.
- **H3 — Raw per-judge scores leaked to public room**: `broadcastScoreSubmitted` now emits only to the admin room. Per-judge scores are no longer visible to spectators. Public aggregated standings are the scope of story 3.4.
- **M1 — Unknown criterionIds accepted & persisted**: `submitScore` now builds a `validCriterionIds` set from the DB fetch and throws `SCORE_OUTSIDE_RANGE` on any submitted id that is not a known criterion. Prevents junk data in `criteria_scores` jsonb.
- **M2 — Idempotency key globally unique**: Changed `scores.idempotency_key` from table-wide `UNIQUE` to a composite `UNIQUE (judge_session_id, idempotency_key)` index. Updated migration 0008, schema, and the idempotency `SELECT` in `submitScore` to include `judgeSessionId`. One judge's key can no longer silently short-circuit another's submission.
- **M3 — WsAuthGuard had no DB error path**: Moot — the guard was deleted. `handleConnection` wraps the DB call in try/catch and disconnects on any failure.
- **M4 — No rate limiting on public procedures**: Added `apps/api/src/trpc/rate-limit.ts` (in-memory token-bucket keyed by `clientIp`). Applied to `validateJudgeToken`, `getJudgeAssignments` (60 req/min/IP), and `submitScore` (30 req/min/IP). `TrpcContext` gained `clientIp`; tRPC middleware extracts it from `x-forwarded-for` or `req.ip`.
- **M5 — `setTimeout` not cleaned up on unmount**: Judge page now tracks the advance-timer handle in a ref and clears it in a cleanup effect. Prevents state updates on unmounted components.
- **M6 — localStorage draft cast without runtime validation**: Added `parseDraft()` that swallows JSON errors and strips non-string values. Corrupted drafts render as empty defaults instead of crashing.
- **M7 — Possible double-submit before React propagates `submitting`**: Added a synchronous `submitLockRef` guard in `handleScoreSubmit`. A second click fires inside the same tick but the ref is already `true`, so the handler returns early.
- **Tests added**: (a) `SCORE_OUTSIDE_RANGE` on unknown criterionId; (b) per-judge idempotency scoping (same key from a different judge proceeds past the short-circuit); (c) `TOO_MANY_REQUESTS` on the 31st consecutive submitScore per IP. Rate-limit buckets are reset in `beforeEach`. Total API tests: **67** (was 50).

### Code Review Fixes (AI Adversarial Review — Round 1, 2026-04-23)

- **H1 — WsAuthGuard never applied**: Added `@UseGuards(WsAuthGuard)` decorator to `CompetitionGateway` class and imported `UseGuards` from `@nestjs/common` + `WsAuthGuard` from guards path. Without this, the guard was provided but never executed.
- **H2 — SCORE_ALREADY_SUBMITTED unused**: Wrapped `tx.insert(scores)` in try/catch that maps postgres `23505` unique constraint violation to `TRPCError { code: 'CONFLICT', cause: { errorCode: 'SCORE_ALREADY_SUBMITTED' } }`. Previously a raw DB error bubbled up on duplicate (judgeSessionId, competitorId) submissions.
- **H3/M3 — scoreValidator silently skipped unknown criteria + partial submissions accepted**: Removed `cypherScoreValidator` call (and unused `ScorePayload`/`cypherScoreValidator` imports). Added a DB criteria fetch in `submitScore` (step 6) that: validates all competition criteria are covered by submitted scores (throws `SCORE_OUTSIDE_RANGE` on missing), and validates each value against DB min/max (not hardcoded defaults). This eliminates the architectural mismatch between hardcoded CYPHER_DEFAULT_CRITERIA and DB-configured criteria.
- **M1 — getJudgeAssignments not in transaction**: Wrapped the four sequential DB queries in a `db.db.transaction()` to ensure consistent snapshot reads.
- **M2 — socket join emitted with empty values**: Added guard `if (opts.competitionId && opts.judgeSessionId)` before emitting `join.judge` to prevent spurious room join with empty strings before token validates.
- **Tests updated**: `makeGetAssignmentsDb` updated to use transaction mock; existing `submitScore` tests updated for new call sequence (criteria at index 4, maxSeq at index 5); added 3 new tests: `PHASE_NOT_ACTIVE` (groupIndex=null path), `SCORE_OUTSIDE_RANGE` (missing criterion), `SCORE_ALREADY_SUBMITTED` (DB constraint). Total: 50 tournament router tests (was 47).
- Format package added to both `apps/api` and `apps/web` workspace dependencies.

### File List

**New files:**

- `packages/db/schema/scoring.ts`
- `packages/db/migrations/0008_add_scores.sql`
- `packages/db/migrations/0009_add_events_sequence_unique.sql` _(round-3: unique constraint on event sequence)_
- `packages/shared/validation/score.schema.ts`
- `packages/shared/events/scoring-events.ts`
- `packages/shared/events/socket-event-map.ts`
- `apps/web/src/stores/scoring.store.ts`
- `apps/web/src/hooks/use-judge-socket.ts`
- `apps/api/src/trpc/rate-limit.ts` _(round-2: public-procedure rate limiter; round-3: add windowMs to Bucket, probabilistic sweep to evict stale entries)_

**Modified files:**

- `packages/shared/errors/error-codes.ts`
- `packages/formats/cypher-battles/src/ui/judge-score-input.tsx`
- `packages/formats/cypher-battles/src/index.ts`
- `packages/formats/cypher-battles/package.json`
- `packages/db/schema/events.ts` _(round-3: added uniqueIndex on aggregateId+aggregateType+sequence)_
- `apps/api/src/modules/websocket/competition-gateway.interface.ts`
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts` _(round-2: handshake auth + room authorization + admin-only score broadcast)_
- `apps/api/src/modules/websocket/websocket.module.ts` _(round-2: dropped WsAuthGuard provider)_
- `apps/api/src/trpc/trpc.context.ts` _(round-2: added `clientIp`)_
- `apps/api/src/trpc/trpc.module.ts` _(round-2: extract client IP into context; round-3: remove x-forwarded-for trust, use socket.remoteAddress)_
- `apps/api/src/trpc/trpc.procedures.spec.ts` _(round-2: context shape update)_
- `apps/api/src/trpc/routers/tournament.router.ts` _(round-2: idempotency scoped per judge, unknown-criterion rejection, rate limiting on 3 public procedures; round-3: broadcast moved after transaction, event insert catches sequence 23505)_
- `apps/api/src/trpc/routers/tournament.router.spec.ts` _(round-2: +3 tests, rate-limit reset hook)_
- `apps/api/package.json`
- `apps/web/src/app/(judge)/judge/[token]/page.tsx` _(round-2: setTimeout cleanup, draft runtime validation, submit lock ref)_
- `apps/web/package.json`
- `pnpm-lock.yaml`

**Deleted files:**

- `apps/api/src/modules/websocket/guards/ws-auth.guard.ts` _(round-2: NestJS guards cannot intercept WS handshake; replaced by in-gateway handleConnection auth)_
