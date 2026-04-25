# Story 3.2: Cypher Phase Start & Judge Group Assignment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to start the Cypher phase so that the system automatically assigns participants to judge groups,
so that each judge knows exactly which participants they are responsible for scoring.

## Acceptance Criteria

1. Given a competition is fully configured (criteria, participants, judge groups defined), when I click "Start Cypher Phase", then the system uses round-robin assignment to distribute participants evenly across judge groups (FR11).

2. Given the Cypher phase has started, when a judge opens their invite link, then they see only the participants assigned to their group — not other groups' participants (FR12).

3. Given the participant count does not divide evenly into judge groups, when assignment runs, then participants are distributed as evenly as possible (off-by-one acceptable) with no participant left unassigned.

4. Given the phase has started, when an assignment is generated, then a `competition.started` domain event is emitted to the append-only event store with the full assignment payload.

5. And the Socket.IO gateway opens the competition namespace with rooms: `competition:{id}:admin`, `competition:{id}:judge:{sessionId}`, `competition:{id}:public`.

## Tasks / Subtasks

- [x] Task 1: Implement the events append-only table schema (AC: #4)
  - [x] `packages/db/schema/events.ts` — implement full events table: id (nanoid), type (text), aggregate_id (text), aggregate_type (text), payload (jsonb), sequence (integer), created_by (text), created_at (timestamp)
  - [x] Update `packages/db/schema/index.ts` to export new schema

- [x] Task 2: Create competitor group assignments schema + extend judge sessions (AC: #1, #2, #3)
  - [x] `packages/db/schema/competitor-group-assignments.ts` — new table: id, competition_id, competitor_id, group_index (integer), created_at
  - [x] Add `groupIndex: integer('group_index')` column (nullable) to `judge_sessions` table in `packages/db/schema/judge-sessions.ts`
  - [x] Update `packages/db/schema/index.ts` to export new schema

- [x] Task 3: Write DB migration (AC: #1, #4)
  - [x] `packages/db/migrations/0007_add_events_and_group_assignments.sql` — CREATE TABLE events, CREATE TABLE competitor_group_assignments, ALTER TABLE judge_sessions ADD COLUMN group_index INTEGER

- [x] Task 4: Add shared types and Zod schemas (AC: #1, #4)
  - [x] `packages/shared/validation/competition.schema.ts` — add `startCypherPhaseSchema = z.object({ competitionId: z.string().min(1) })`
  - [x] `packages/shared/events/tournament-events.ts` — implement `CompetitionStartedPayload` type and `CompetitionStartedEvent` type (replacing the current `export {};` stub)
  - [x] `packages/shared/index.ts` — add export for `startCypherPhaseSchema` (already exports competition.schema.ts, verify it's included)

- [x] Task 5: Install WebSocket dependencies (AC: #5)
  - [x] `pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io --filter @competition-platform/api`
  - [x] `pnpm add -D @types/socket.io --filter @competition-platform/api`

- [x] Task 6: Implement Competition WebSocket Gateway (AC: #5)
  - [x] Create `apps/api/src/modules/websocket/gateways/competition.gateway.ts` — `@WebSocketGateway` with Socket.IO, namespace `/competition`, handles judge/admin/public connections and room joining
  - [x] Create `apps/api/src/modules/websocket/guards/ws-auth.guard.ts` — validates judge token or Clerk JWT on WS handshake
  - [x] Update `apps/api/src/modules/websocket/websocket.module.ts` — register CompetitionGateway as provider and export it
  - [x] Register WebsocketModule in `apps/api/src/app.module.ts`

- [x] Task 7: Add `startCypherPhase` tRPC procedure (AC: #1, #2, #3, #4, #5)
  - [x] Update `apps/api/src/trpc/trpc.router.ts` — inject CompetitionGateway and pass to tournament router factory
  - [x] Update `apps/api/src/trpc/trpc.module.ts` — inject WebsocketModule and CompetitionGateway
  - [x] `apps/api/src/trpc/routers/tournament.router.ts` — add `startCypherPhase` procedure and `getJudgeAssignments` query (see Dev Notes for detailed logic)

- [x] Task 8: Write tests (AC: #1, #2, #3, #4)
  - [x] `apps/api/src/trpc/routers/tournament.router.spec.ts` — add tests for `startCypherPhase` input validation (empty competitionId, unauthorized)
  - [x] `apps/api/src/modules/competition/domain/group-assigner.spec.ts` — unit tests for round-robin algorithm: even split, uneven split, 1 group, boundary cases

- [x] Task 9: Frontend — "Start Cypher Phase" button (AC: #1)
  - [x] `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — add "Start Cypher Phase" button that calls `tournament.startCypherPhase` tRPC mutation; show assignment preview after success

- [x] Task 10: Verify CI — `pnpm exec turbo run lint typecheck test` — all pass

## Dev Notes

### Architecture Mandate: Format Isolation Still Applies

Story 3.2 begins wiring the platform runtime to the format. The key rule:

- `apps/api` MUST interact with Cypher Battles format ONLY through the `CompetitionFormat` interface from `@competition-platform/format-sdk`
- The `group-assigner` uses `format.fairnessRules.judgeGroupAssignment` (value: `'round-robin'`) to decide the algorithm — do NOT hardcode round-robin in the platform; read it from the format
- However, for MVP, the Cypher Battles format is the only format, so pragmatic shortcuts are acceptable if clearly marked with `// TODO: load from format registry`

### DB Schema: Events Table

Implement `packages/db/schema/events.ts` to replace the current `export {};` stub:

```typescript
import { pgTable, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const events = pgTable('events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  type: text('type').notNull(), // e.g. 'competition.started'
  aggregateId: text('aggregate_id').notNull(),
  aggregateType: text('aggregate_type').notNull(), // e.g. 'competition'
  payload: jsonb('payload').notNull(),
  sequence: integer('sequence').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
```

### DB Schema: Competitor Group Assignments Table

Create `packages/db/schema/competitor-group-assignments.ts`:

```typescript
import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';
import { competitors } from './competitors';

export const competitorGroupAssignments = pgTable(
  'competitor_group_assignments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    competitorId: text('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    groupIndex: integer('group_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_cga_competition_competitor').on(table.competitionId, table.competitorId),
  ],
);

export type CompetitorGroupAssignmentRow = typeof competitorGroupAssignments.$inferSelect;
export type NewCompetitorGroupAssignmentRow = typeof competitorGroupAssignments.$inferInsert;
```

### DB Schema: Extend Judge Sessions

Add `groupIndex` to existing `packages/db/schema/judge-sessions.ts`:

```typescript
import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const judgeSessions = pgTable('judge_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  competitionId: text('competition_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label').notNull(),
  createdBy: text('created_by').notNull(),
  groupIndex: integer('group_index'), // null until startCypherPhase assigns it
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### DB Migration: 0007_add_events_and_group_assignments.sql

```sql
-- Append-only event store
CREATE TABLE IF NOT EXISTS "events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "sequence" integer NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_events_aggregate" ON "events" ("aggregate_id", "aggregate_type");
CREATE INDEX IF NOT EXISTS "idx_events_type" ON "events" ("type");

-- Competitor to judge group assignment
CREATE TABLE IF NOT EXISTS "competitor_group_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "competition_id" text NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "competitor_id" text NOT NULL REFERENCES "competitors"("id") ON DELETE CASCADE,
  "group_index" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_cga_competition_competitor" UNIQUE ("competition_id", "competitor_id")
);

-- Judge session group membership
ALTER TABLE "judge_sessions" ADD COLUMN IF NOT EXISTS "group_index" integer;
```

### Shared Package: Tournament Events

Replace the `export {};` stub in `packages/shared/events/tournament-events.ts`:

```typescript
export interface CompetitionStartedPayload {
  competitionId: string;
  groupCount: number;
  judgeAssignments: { judgeSessionId: string; groupIndex: number }[];
  competitorAssignments: { competitorId: string; groupIndex: number }[];
  startedAt: string; // ISO 8601
}

export interface CompetitionStartedEvent {
  type: 'competition.started';
  aggregateId: string;
  aggregateType: 'competition';
  payload: CompetitionStartedPayload;
  createdBy: string;
  createdAt: string;
  sequence: number;
}
```

### Round-Robin Assignment Algorithm

The algorithm lives in `apps/api/src/modules/competition/domain/group-assigner.ts` (new file):

```typescript
// Assign items to groups using round-robin.
// Items sorted by provided key; group_index = position % groupCount.
// Returns { itemId, groupIndex }[]
export function roundRobinAssign<T extends { id: string }>(
  items: T[],
  groupCount: number,
): { id: string; groupIndex: number }[] {
  if (groupCount <= 0) throw new Error('groupCount must be > 0');
  return items.map((item, i) => ({ id: item.id, groupIndex: i % groupCount }));
}
```

Test cases to cover (`apps/api/src/modules/competition/domain/group-assigner.spec.ts`):

- 6 participants, 3 groups → [0,1,2,0,1,2]
- 7 participants, 3 groups → [0,1,2,0,1,2,0] (off-by-one acceptable, groups 0 and 1 get 3, group 2 gets 1)
- 1 participant, 1 group → [0]
- 3 participants, 1 group → [0,0,0]
- 0 participants, 3 groups → []
- groupCount 0 → throws

### `startCypherPhase` tRPC Procedure

Add to `apps/api/src/trpc/routers/tournament.router.ts`:

```typescript
startCypherPhase: protectedProcedure
  .input(startCypherPhaseSchema)
  .mutation(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);

      // 1. Verify competition exists + ownership
      const [comp] = await tx
        .select({
          id: competitions.id,
          status: competitions.status,
          cypherGroupCount: competitions.cypherGroupCount,
        })
        .from(competitions)
        .where(eq(competitions.id, input.competitionId));
      if (!comp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
      }

      // 2. Validate status — must be 'draft' (idempotency guard)
      if (comp.status !== 'draft') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Competition has already been started',
          cause: { errorCode: 'COMPETITION_ALREADY_STARTED' },
        });
      }

      // 3. Validate group count configured
      const groupCount = comp.cypherGroupCount;
      if (!groupCount || groupCount < 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Judge group count must be configured before starting',
          cause: { errorCode: 'JUDGE_CONFIG_MISSING' },
        });
      }

      // 4. Validate at least 1 criterion
      const criteria = await tx
        .select({ id: evaluationCriteria.id })
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.competitionId, input.competitionId));
      if (criteria.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least one evaluation criterion must be defined before starting',
          cause: { errorCode: 'NO_CRITERIA_DEFINED' },
        });
      }

      // 5. Load and validate competitors (at least 1)
      const allCompetitors = await tx
        .select({ id: competitors.id })
        .from(competitors)
        .where(eq(competitors.competitionId, input.competitionId))
        .orderBy(asc(competitors.createdAt));
      if (allCompetitors.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least one participant must be registered before starting',
          cause: { errorCode: 'NO_PARTICIPANTS_REGISTERED' },
        });
      }

      // 6. Load judge sessions — must have at least groupCount sessions
      const allJudgeSessions = await tx
        .select({ id: judgeSessions.id })
        .from(judgeSessions)
        .where(eq(judgeSessions.competitionId, input.competitionId))
        .orderBy(asc(judgeSessions.createdAt));
      if (allJudgeSessions.length < groupCount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `At least ${groupCount} judge links must be generated (one per group)`,
          cause: { errorCode: 'INSUFFICIENT_JUDGE_LINKS' },
        });
      }

      // 7. Round-robin assignment
      const competitorAssignments = roundRobinAssign(allCompetitors, groupCount);
      const judgeAssignments = roundRobinAssign(allJudgeSessions, groupCount);

      // 8. Persist competitor group assignments
      await tx.insert(competitorGroupAssignments).values(
        competitorAssignments.map((a) => ({
          competitionId: input.competitionId,
          competitorId: a.id,
          groupIndex: a.groupIndex,
        })),
      );

      // 9. Update judge sessions with their group index
      for (const ja of judgeAssignments) {
        await tx
          .update(judgeSessions)
          .set({ groupIndex: ja.groupIndex })
          .where(eq(judgeSessions.id, ja.id));
      }

      // 10. Update competition status to 'active'
      await tx
        .update(competitions)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(competitions.id, input.competitionId));

      // 11. Get current event sequence (max sequence for this aggregate)
      const [{ maxSeq }] = await tx
        .select({ maxSeq: max(events.sequence) })
        .from(events)
        .where(
          and(
            eq(events.aggregateId, input.competitionId),
            eq(events.aggregateType, 'competition'),
          ),
        );
      const nextSeq = (maxSeq ?? 0) + 1;

      // 12. Emit domain event to append-only event store
      const payload: CompetitionStartedPayload = {
        competitionId: input.competitionId,
        groupCount,
        judgeAssignments: judgeAssignments.map((ja) => ({
          judgeSessionId: ja.id,
          groupIndex: ja.groupIndex,
        })),
        competitorAssignments: competitorAssignments.map((ca) => ({
          competitorId: ca.id,
          groupIndex: ca.groupIndex,
        })),
        startedAt: new Date().toISOString(),
      };
      await tx.insert(events).values({
        type: 'competition.started',
        aggregateId: input.competitionId,
        aggregateType: 'competition',
        payload: payload as Record<string, unknown>,
        sequence: nextSeq,
        createdBy: ctx.userId,
      });

      // 13. Broadcast via WebSocket gateway
      gateway.broadcastCompetitionStarted(input.competitionId, payload);

      return {
        success: true,
        groupCount,
        competitorCount: allCompetitors.length,
        judgeCount: allJudgeSessions.length,
      };
    });
  }),
```

Also add `events` and `competitorGroupAssignments` imports at the top of the router file, and `max` from `drizzle-orm`.

Add import for `CompetitionStartedPayload` from `@competition-platform/shared` and `roundRobinAssign` from `../../modules/competition/domain/group-assigner`.

### `getJudgeAssignments` tRPC Query

This is a public procedure (no Clerk auth required — uses judge token). Add to the tournament router:

```typescript
getJudgeAssignments: t.procedure
  .input(z.object({ token: z.string().min(1) }))
  .query(async ({ input }) => {
    // Validate token
    const hash = createHash('sha256').update(input.token).digest('hex');
    const [session] = await db.db
      .select({
        id: judgeSessions.id,
        competitionId: judgeSessions.competitionId,
        groupIndex: judgeSessions.groupIndex,
        label: judgeSessions.label,
      })
      .from(judgeSessions)
      .where(eq(judgeSessions.tokenHash, hash));
    if (!session) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Link not valid' });
    }
    if (session.groupIndex === null) {
      // Phase not started yet — return empty assignments with phase status
      return {
        judgeSessionId: session.id,
        label: session.label,
        competitionId: session.competitionId,
        phaseStarted: false,
        assignedCompetitors: [],
      };
    }
    // Get competitors assigned to this judge's group
    const assigned = await db.db
      .select({
        id: competitors.id,
        participantId: competitors.participantId,
        name: competitors.name,
      })
      .from(competitorGroupAssignments)
      .innerJoin(competitors, eq(competitors.id, competitorGroupAssignments.competitorId))
      .where(
        and(
          eq(competitorGroupAssignments.competitionId, session.competitionId),
          eq(competitorGroupAssignments.groupIndex, session.groupIndex),
        ),
      )
      .orderBy(asc(competitors.name));
    return {
      judgeSessionId: session.id,
      label: session.label,
      competitionId: session.competitionId,
      phaseStarted: true,
      assignedCompetitors: assigned,
    };
  }),
```

### WebSocket Gateway: CompetitionGateway

Create `apps/api/src/modules/websocket/gateways/competition.gateway.ts`:

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { createHash } from 'node:crypto';
import type { CompetitionStartedPayload } from '@competition-platform/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySocket = Socket<any, any, any, any>;

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/competition',
})
export class CompetitionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(CompetitionGateway.name);

  handleConnection(client: AnySocket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: AnySocket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Judge joins their room: competition:{id}:judge:{sessionId}
  @SubscribeMessage('join.judge')
  async handleJudgeJoin(
    @MessageBody() data: { competitionId: string; sessionId: string },
    @ConnectedSocket() client: AnySocket,
  ): Promise<void> {
    const room = `competition:${data.competitionId}:judge:${data.sessionId}`;
    await client.join(room);
    this.logger.log(`Judge ${data.sessionId} joined room: ${room}`);
  }

  // Organizer joins admin room: competition:{id}:admin
  @SubscribeMessage('join.admin')
  async handleAdminJoin(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: AnySocket,
  ): Promise<void> {
    const room = `competition:${data.competitionId}:admin`;
    await client.join(room);
    this.logger.log(`Admin joined room: ${room}`);
  }

  // Public joins read-only room: competition:{id}:public
  @SubscribeMessage('join.public')
  async handlePublicJoin(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: AnySocket,
  ): Promise<void> {
    const room = `competition:${data.competitionId}:public`;
    await client.join(room);
    this.logger.log(`Public client joined room: ${room}`);
  }

  // Called by tRPC router after successful startCypherPhase
  broadcastCompetitionStarted(competitionId: string, payload: CompetitionStartedPayload): void {
    const adminRoom = `competition:${competitionId}:admin`;
    const publicRoom = `competition:${competitionId}:public`;
    this.server.to(adminRoom).to(publicRoom).emit('competition.started', payload);
    this.logger.log(`Broadcast competition.started for ${competitionId}`);
  }
}
```

### WebSocket Module Update

Update `apps/api/src/modules/websocket/websocket.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CompetitionGateway } from './gateways/competition.gateway';

@Module({
  providers: [CompetitionGateway],
  exports: [CompetitionGateway],
})
export class WebsocketModule {}
```

### TrpcModule Update — Inject CompetitionGateway

The current `apps/api/src/trpc/trpc.module.ts` only takes `DatabaseService`. Add `CompetitionGateway` injection:

```typescript
// apps/api/src/trpc/trpc.module.ts
import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { verifyToken } from '@clerk/backend';
import type { Request, Response } from 'express';
import { createAppRouter } from './trpc.router';
import type { TrpcContext } from './trpc.context';
import { DatabaseService } from '../modules/database/database.service';
import { CompetitionGateway } from '../modules/websocket/gateways/competition.gateway';

// ... createContext function unchanged ...

@Module({})
export class TrpcModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly databaseService: DatabaseService,
    private readonly competitionGateway: CompetitionGateway, // ADD THIS
  ) {}

  onModuleInit(): void {
    const appRouter = createAppRouter(this.databaseService, this.competitionGateway); // ADD gateway
    // ... rest unchanged ...
  }
}
```

Update `apps/api/src/trpc/trpc.router.ts` signature:

```typescript
// Before:
export function createAppRouter(db: DatabaseService) {
  return t.router({
    auth: authRouter,
    tournament: createTournamentRouter(db),
  });
}

// After:
import type { CompetitionGateway } from '../modules/websocket/gateways/competition.gateway';

export function createAppRouter(db: DatabaseService, gateway: CompetitionGateway) {
  return t.router({
    auth: authRouter,
    tournament: createTournamentRouter(db, gateway),
  });
}
```

Update `apps/api/src/app.module.ts`:

```typescript
@Module({
  imports: [DatabaseModule, AuthModule, WebsocketModule, TrpcModule],
  ...
})
```

**IMPORTANT**: NestJS module import order matters for dependency injection. `WebsocketModule` must be imported before `TrpcModule` since `TrpcModule` depends on `CompetitionGateway`. The `WebsocketModule` must export `CompetitionGateway` (it does — see Task 6).

The router factory signature becomes:

```typescript
export function createTournamentRouter(db: DatabaseService, gateway: CompetitionGateway);
```

### `startCypherPhaseSchema` in Shared Package

Add to `packages/shared/validation/competition.schema.ts`:

```typescript
export const startCypherPhaseSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});
```

### Frontend: Start Cypher Phase Button

The competition detail page at `apps/web/src/app/(admin)/competitions/[id]/page.tsx` needs:

1. A "Start Cypher Phase" button visible when `competition.status === 'draft'`
2. The button calls `trpc.tournament.startCypherPhase.mutate({ competitionId: id })`
3. On success: show success message + assignment summary (group count, competitors per group, judge count)
4. On error: display the error message from the server (e.g., "At least one criterion must be defined")
5. After starting: the button disappears and the page shows "Cypher Phase Active"

Use the existing tRPC client pattern from prior stories. Check how `apps/web` currently calls tRPC for the pattern to follow.

### Project Structure Notes

**New files to create:**

```
packages/db/schema/competitor-group-assignments.ts  (new)
packages/db/migrations/0007_add_events_and_group_assignments.sql  (new)
apps/api/src/modules/competition/domain/group-assigner.ts  (new)
apps/api/src/modules/competition/domain/group-assigner.spec.ts  (new)
apps/api/src/modules/websocket/gateways/competition.gateway.ts  (new)
apps/api/src/modules/websocket/guards/ws-auth.guard.ts  (new — can be a stub for now)
```

**Modified files:**

```
packages/db/schema/events.ts                       (implement from stub)
packages/db/schema/judge-sessions.ts               (add groupIndex column)
packages/db/schema/index.ts                        (add competitor-group-assignments export)
packages/shared/events/tournament-events.ts        (implement from stub)
packages/shared/validation/competition.schema.ts   (add startCypherPhaseSchema)
packages/shared/index.ts                           (verify exports are complete)
apps/api/src/trpc/routers/tournament.router.ts     (add startCypherPhase + getJudgeAssignments)
apps/api/src/trpc/trpc.module.ts                   (inject WebsocketModule + CompetitionGateway)
apps/api/src/trpc/trpc.router.ts                   (pass gateway to tournament router)
apps/api/src/trpc/routers/tournament.router.spec.ts (add startCypherPhase tests)
apps/api/src/modules/websocket/websocket.module.ts  (register CompetitionGateway)
apps/api/src/app.module.ts                         (import WebsocketModule)
apps/api/package.json                              (add socket.io deps)
apps/web/src/app/(admin)/competitions/[id]/page.tsx (add Start Cypher Phase button)
```

### Imports to Add to Tournament Router

```typescript
import { events, competitorGroupAssignments } from '@competition-platform/db';
import { max } from 'drizzle-orm';
import { startCypherPhaseSchema } from '@competition-platform/shared';
import type { CompetitionStartedPayload } from '@competition-platform/shared';
import { roundRobinAssign } from '../../modules/competition/domain/group-assigner';
import type { CompetitionGateway } from '../../modules/websocket/gateways/competition.gateway';
```

### Validation Order in `startCypherPhase`

The validation order is important to give the organizer the most actionable error first:

1. Competition exists (NOT_FOUND if missing)
2. Status is 'draft' (already started guard)
3. Judge config is set (`cypherGroupCount` not null)
4. Criteria exist
5. Participants exist
6. Enough judge links generated (`count >= groupCount`)

This order matches the natural competition setup flow: judge config → criteria → participants → judge links.

### Error Codes to Use

These error codes should be added to `packages/shared/errors/error-codes.ts` if that file has them enumerated. Check the current content. If it's a stub, add:

```typescript
export const ErrorCodes = {
  COMPETITION_ALREADY_STARTED: 'COMPETITION_ALREADY_STARTED',
  JUDGE_CONFIG_MISSING: 'JUDGE_CONFIG_MISSING',
  NO_CRITERIA_DEFINED: 'NO_CRITERIA_DEFINED',
  NO_PARTICIPANTS_REGISTERED: 'NO_PARTICIPANTS_REGISTERED',
  INSUFFICIENT_JUDGE_LINKS: 'INSUFFICIENT_JUDGE_LINKS',
} as const;
```

### Gotchas from Previous Stories (Still Apply)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy at `apps/web/src/proxy.ts`. WebSocket client connects from the browser — no proxy needed for WS, it connects directly to the API.
2. **No floating point scores**: Not directly relevant to this story, but competitorGroupAssignment.groupIndex is always an integer.
3. **No `any` type**: Use `unknown` + type guards or explicit types everywhere.
4. **`pnpm install` after adding socket.io deps**: Run `pnpm install` after updating package.json before running typecheck.
5. **NestJS WebSocket and Express**: `@WebSocketGateway` creates a separate WebSocket server that attaches to the same HTTP server. No port conflict — NestJS handles this automatically.
6. **`@WebSocketServer()` may be undefined before connection**: The `server` field is injected by NestJS after module init. Don't call `broadcastCompetitionStarted` in constructors or module init hooks.
7. **Drizzle `max()` returns `null` for empty tables**: Handle `(maxSeq ?? 0) + 1` correctly — if no prior events, sequence starts at 1.
8. **Socket.IO CORS**: For local dev, `origin: '*'` is fine. For production, this should be locked to the Next.js app origin via environment variable.
9. **`judge_sessions.group_index` is nullable**: The `getJudgeAssignments` procedure handles `null` gracefully (phase not started yet).
10. **`gateway.broadcastCompetitionStarted` inside transaction**: This is called inside `db.db.transaction()`. If the broadcast succeeds but the transaction rolls back, the WS message will have been sent for a failed operation. This is acceptable for MVP — real solutions use transactional outbox pattern (post-MVP).

### WebSocket Integration Test Note

Full Socket.IO integration testing (testing actual WS connections) is deferred to the E2E test suite in `apps/web/e2e/`. Unit tests in `tournament.router.spec.ts` mock the gateway:

```typescript
const mockGateway = {
  broadcastCompetitionStarted: vi.fn(),
} as unknown as CompetitionGateway;

const router = createTournamentRouter(mockDb, mockGateway);
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.2]
- [Source: _bmad-output/planning-artifacts/epics.md#FR11 — System-generated judge group assignments]
- [Source: _bmad-output/planning-artifacts/epics.md#FR12 — Judge sees only assigned participants]
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Plugin Architecture — group-assigner.service.ts]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture — Event Store (append-only events table)]
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns — WebSocket single namespace, role-based rooms]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — Domain Event Envelope]
- [Source: _bmad-output/planning-artifacts/architecture.md#Structure Patterns — NestJS Backend Organization]
- [Source: _bmad-output/implementation-artifacts/3-1-format-sdk-and-cypher-battles-format-definition.md#Dev Notes — Architecture Mandate: Format Isolation]
- [Source: packages/db/schema/competitions.ts — competition status enum (draft/active/completed/archived)]
- [Source: apps/api/src/trpc/routers/tournament.router.ts — existing procedure patterns (protectedProcedure, RLS setup, error handling)]
- [Source: apps/api/package.json — existing dependencies (@nestjs/platform-express, not yet socket.io)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TypeScript error TS2352: `CompetitionStartedPayload` to `Record<string, unknown>` cast — fixed by casting via `unknown` first.
- Web typecheck failing because web's tsconfig followed the import chain through `AppRouter` → `createTournamentRouter` → `CompetitionGateway` (NestJS decorators, no `experimentalDecorators`). Fixed by introducing `ICompetitionGateway` interface in `apps/api/src/modules/websocket/competition-gateway.interface.ts` and using it in tRPC router instead of the concrete class.
- ESLint error in `ws-auth.guard.ts`: `_context` parameter defined but never used. Fixed by removing the parameter name from the `canActivate` stub.

### Completion Notes List

- Implemented append-only event store schema (`events` table) with aggregate indexes.
- Created `competitor_group_assignments` table with unique constraint on (competition_id, competitor_id).
- Extended `judge_sessions` with nullable `group_index` column (null until phase starts).
- Wrote DB migration 0007 covering all three schema changes.
- Added `startCypherPhaseSchema` and `StartCypherPhaseInput` to shared validation.
- Implemented `CompetitionStartedPayload` and `CompetitionStartedEvent` types (replacing stubs).
- Added `ErrorCodes` constants to shared errors package.
- Installed `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` in API.
- Built `CompetitionGateway` with namespace `/competition`, rooms `admin/judge/public`, `broadcastCompetitionStarted`.
- Created `ICompetitionGateway` interface to decouple tRPC router from NestJS decorator types.
- `WsAuthGuard` stub created (full JWT validation deferred to Story 3.3).
- `startCypherPhase` tRPC mutation: 6-step validation chain → round-robin assignment → DB writes → event store → WS broadcast.
- `getJudgeAssignments` public tRPC query: validates token hash, returns assigned competitors or empty if phase not started.
- `roundRobinAssign` domain function: generic, pure, 8 unit tests covering all edge cases.
- Frontend `StartCypherPhasePanel` component: shows button when draft, shows "Cypher Phase Active" card when active.
- All 51 tests pass, 13/13 CI tasks green (lint + typecheck + test).

### File List

**New files:**

- `packages/db/schema/competitor-group-assignments.ts`
- `packages/db/migrations/0007_add_events_and_group_assignments.sql`
- `apps/api/src/modules/competition/domain/group-assigner.ts`
- `apps/api/src/modules/competition/domain/group-assigner.spec.ts`
- `apps/api/src/modules/websocket/gateways/competition.gateway.ts`
- `apps/api/src/modules/websocket/guards/ws-auth.guard.ts`
- `apps/api/src/modules/websocket/competition-gateway.interface.ts`
- `apps/web/src/components/admin/start-cypher-phase-panel.tsx`

**Modified files:**

- `packages/db/schema/events.ts` (implemented from stub)
- `packages/db/schema/judge-sessions.ts` (added groupIndex + FK to competitions)
- `packages/db/schema/index.ts` (added competitor-group-assignments export)
- `packages/shared/events/tournament-events.ts` (implemented from stub)
- `packages/shared/validation/competition.schema.ts` (added startCypherPhaseSchema)
- `packages/shared/errors/error-codes.ts` (added ErrorCodes constants)
- `apps/api/src/modules/websocket/websocket.module.ts` (registered CompetitionGateway)
- `apps/api/src/app.module.ts` (imported WebsocketModule)
- `apps/api/src/trpc/trpc.module.ts` (injected WebsocketModule + CompetitionGateway)
- `apps/api/src/trpc/trpc.router.ts` (pass gateway to tournament router)
- `apps/api/src/trpc/routers/tournament.router.ts` (added startCypherPhase + getJudgeAssignments)
- `apps/api/src/trpc/routers/tournament.router.spec.ts` (added startCypherPhase + getJudgeAssignments tests)
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx` (added StartCypherPhasePanel)
- `pnpm-lock.yaml` (new socket.io deps)

## Senior Developer Review (AI)

**Review Date:** 2026-04-23
**Outcome:** Changes Requested → Fixed

### Action Items

- [x] [High] `judge_sessions.competition_id` missing FK constraint to `competitions` — added `.references(() => competitions.id, { onDelete: 'cascade' })` and `ALTER TABLE ADD CONSTRAINT` in migration 0007. `packages/db/schema/judge-sessions.ts`
- [x] [High] Frontend status check `!== 'draft'` incorrectly showed "Cypher Phase Active" for completed/archived competitions — changed to `=== 'active'`. `apps/web/src/components/admin/start-cypher-phase-panel.tsx:32`
- [x] [Medium] `ErrorCodes` defined but never referenced in TRPCError `cause` fields — added `cause: { errorCode: ErrorCodes.X }` to all 4 validation errors in `startCypherPhase`. `apps/api/src/trpc/routers/tournament.router.ts`
- [x] [Medium] N+1 judge session group_index updates (one UPDATE per judge in a loop) — replaced with single batch SQL CASE UPDATE. `apps/api/src/trpc/routers/tournament.router.ts`

### Deferred (Low)

- `WsAuthGuard` is an open stub — deferred to Story 3.3 (judge scoring interface)
- `socket-event-map.ts` still `export {}` — deferred to Story 3.3 when client subscribes

## Change Log

- 2026-04-23: Story 3.2 implementation complete — Cypher Phase Start & Judge Group Assignment. Added events table, competitor_group_assignments table, judge_sessions.group_index column, WebSocket gateway with Socket.IO namespace /competition, startCypherPhase tRPC mutation with 6-step validation and round-robin assignment, getJudgeAssignments public query, and Start Cypher Phase button on competition config page. 51 tests pass, full CI green.
- 2026-04-23: Code review fixes applied — added missing FK on judge_sessions, corrected frontend status check, wired ErrorCodes into TRPCError cause fields, replaced N+1 loop with batch SQL CASE update. CI remains green.
