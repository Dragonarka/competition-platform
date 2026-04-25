# Story 2.3: Register Participants

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to manually register participants by name and unique ID,
so that the system knows who is competing and can track them through the competition.

## Acceptance Criteria

1. Given I am on the competition configuration screen, when I enter a participant name and unique ID and click "Add", then the participant appears in my participant list.

2. Given I try to add a participant with a duplicate ID (same `participantId` in the same competition), when I submit, then an error is shown: "A participant with this ID already exists in this competition".

3. Given I have registered participants, when I select "Individual" or "Pairs" as the participant format, then this preference is saved on the competition and will be used by the Cypher scoring engine for partner rotation (FR4).

4. Given I want to remove a participant before the competition starts, when I click the remove button next to their name, then they are removed from the participant list.

## Tasks / Subtasks

- [x] Task 1: DB schema — `competitors` table + `participant_format` on competitions (AC: #1, #2, #3, #4)
  - [x] Create `packages/db/schema/competitors.ts` with `competitors` table: `id` (text PK, `nanoid(21)`), `competitionId` (text FK → competitions.id, cascade delete), `participantId` (text, notNull — organizer-provided unique ID), `name` (text, notNull), `createdAt` (timestamp with timezone, defaultNow); add unique constraint on `(competitionId, participantId)`
  - [x] Add `participantFormatEnum = pgEnum('participant_format', ['individual', 'pairs'])` and `participantFormat: participantFormatEnum('participant_format').notNull().default('individual')` to `packages/db/schema/competitions.ts`
  - [x] Export `competitors`, `CompetitorRow`, `NewCompetitorRow` and `participantFormatEnum` from `packages/db/schema/index.ts`
  - [x] Create migration `packages/db/migrations/0004_add_participant_registration.sql` with: `CREATE TABLE competitors (...)`, unique constraint, index, RLS policy (matching evaluation_criteria pattern from 0003), `GRANT` statement; and `CREATE TYPE participant_format AS ENUM ('individual', 'pairs')` + `ALTER TABLE competitions ADD COLUMN participant_format participant_format NOT NULL DEFAULT 'individual'`

- [x] Task 2: Shared types and validation schema (AC: #1, #2, #3, #4)
  - [x] Create `packages/shared/types/participant.types.ts`: `Participant` interface with fields: `id`, `competitionId`, `participantId`, `name`, `createdAt`; `ParticipantFormat` type = `'individual' | 'pairs'`
  - [x] Create `packages/shared/validation/participant.schema.ts`:
    - `addParticipantSchema`: `{ competitionId: z.string().min(1), participantId: z.string().trim().min(1, 'Participant ID is required').max(50, 'ID must be 50 characters or fewer'), name: z.string().trim().min(1, 'Participant name is required').max(100, 'Name must be 100 characters or fewer') }`
    - `setParticipantFormatSchema`: `{ competitionId: z.string().min(1), format: z.enum(['individual', 'pairs']) }`
  - [x] Export both from `packages/shared/index.ts`

- [x] Task 3: tRPC tournament router — participant procedures (AC: #1, #2, #3, #4)
  - [x] Add `tournament.listParticipants` — input `{ competitionId: z.string().min(1) }`, RLS transaction, verify competition ownership (SELECT from competitions, throw NOT_FOUND if not found), return rows from `competitors` ordered by `createdAt` asc
  - [x] Add `tournament.addParticipant` — input `addParticipantSchema`, RLS transaction, verify competition ownership, check for existing competitor with same `(competitionId, participantId)` and throw `CONFLICT` with message `"A participant with this ID already exists in this competition"` if found, insert into `competitors` with fresh `nanoid(21)`, return created row
  - [x] Add `tournament.removeParticipant` — input `{ competitorDbId: z.string().min(1) }` (DB id, not participantId), RLS transaction, delete with ownership subquery (same pattern as removeCriterion), use `RETURNING id`, throw NOT_FOUND on zero rows
  - [x] Add `tournament.setParticipantFormat` — input `setParticipantFormatSchema`, RLS transaction, verify competition ownership, `UPDATE competitions SET participant_format = $format WHERE id = $competitionId`, return updated row
  - [x] All procedures follow exact RLS pattern: `db.db.transaction(async (tx) => { await tx.execute(sql\`SET LOCAL session.current_organizer_id = ${ctx.userId}\`); ... })`

- [x] Task 4: Frontend — participants management UI (AC: #1, #2, #3, #4)
  - [x] Create `apps/web/src/components/admin/participants-manager.tsx` — client component (`"use client"`):
    - Accepts `competitionId: string` as prop
    - `trpc.tournament.listParticipants.useQuery({ competitionId })` for existing participants
    - `trpc.tournament.addParticipant.useMutation()` — on success invalidate `listParticipants`
    - `trpc.tournament.removeParticipant.useMutation()` — on success invalidate `listParticipants`
    - `trpc.tournament.setParticipantFormat.useMutation()` — on success invalidate no extra query (competition format only)
    - Add-participant form: participantId `<Input>` (label "Participant ID"), name `<Input>` (label "Name"), "Add Participant" `<Button>`
    - Show inline error under participantId field when API returns CONFLICT (use `aria-describedby` pattern from Story 2.1)
    - Existing participants list: show `participantId` + `name` + remove button per row
    - Format section: label "Participant Format", two radio-style buttons or native `<select>` with options "Individual" and "Pairs", call `setParticipantFormat` on change
    - Load initial `participantFormat` from competition data — see note below on fetching current format
  - [x] Update `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — add import for `ParticipantsManager`; wrap existing `CriteriaManager` and new `ParticipantsManager` in shadcn `<Tabs>` with tab values "criteria" and "participants"; keep page as server component, both managers are client boundaries

- [x] Task 5: Tests (AC: #2, #3)
  - [x] Add to `apps/api/src/trpc/routers/tournament.router.spec.ts`:
    - `addParticipant` rejects empty name → Zod error
    - `addParticipant` rejects empty participantId → Zod error
    - `addParticipant` rejects whitespace-only name (uses `.trim()`) → Zod error
    - `setParticipantFormat` rejects invalid format value (not 'individual'/'pairs') → Zod error
    - `listParticipants` with null userId → throws UNAUTHORIZED
    - `removeParticipant` with null userId → throws UNAUTHORIZED

- [x] Task 6: Verify CI (AC: all)
  - [x] Run `pnpm exec turbo run lint typecheck test build` — all tasks pass

## Dev Notes

### CRITICAL — Gotchas from Stories 1.x through 2.2 (MUST READ BEFORE CODING)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy is `apps/web/src/proxy.ts` with exported `proxy` function. Never create `middleware.ts`. Confirmed project convention from Story 1.2.

2. **`reflect-metadata` in Vitest**: `apps/api/vitest.config.ts` has `setupFiles: ['reflect-metadata']`. All NestJS spec files get it automatically — do NOT import manually.

3. **tRPC client sends Clerk JWT automatically**: `apps/web/src/lib/trpc.tsx` uses `useAuth().getToken()` in `httpBatchLink.headers()`. Do not re-implement auth on the client side.

4. **Factory router pattern**: `createTournamentRouter(db: DatabaseService)` receives DB as parameter. Do NOT use NestJS DI in router files. Import `t` from `'../trpc.init'`, not from the router itself.

5. **RLS transaction pattern CRITICAL**: Always `await tx.execute(sql\`SET LOCAL session.current_organizer_id = ${ctx.userId}\`)`inside`db.db.transaction()`. `SET LOCAL` scopes to the transaction only. Every single procedure touching the DB must follow this pattern.

6. **protectedProcedure from shared module**: Import from `'../trpc.procedures'` — NOT redefined per router. Already in use in `tournament.router.ts`.

7. **postgres-js (not pg) for runtime**: Use `postgres` package. `pg` is devDependency only (Drizzle Kit).

8. **IDs are server-generated nanoid(21)**: Call `nanoid(21)` explicitly in the insert. Always verify it's called on INSERT.

9. **Zod for ALL input validation**: All schemas live in `packages/shared/validation/`. Trim participant name and participantId in the schema (`.trim()`) before calling mutation.

10. **shadcn/ui Button does NOT support `asChild`**: Uses `@base-ui/react`, not Radix. Use `buttonVariants()` className on `<Link>` for link-as-button.

11. **Next.js 16 async params**: `params: Promise<{ id: string }>` must be `await`-ed. Keep `[id]/page.tsx` as a server component — `ParticipantsManager` is the client boundary.

12. **No `competitions` tRPC namespace**: Use `tournament` bounded context. The tournament module owns `competitions`, `evaluation_criteria`, `competitors`, `phases`, `evaluation_templates` per architecture data boundaries.

13. **`z` import in router**: Import `{ z }` from `'zod'` directly in the router file for inline schemas. Import named schemas from `@competition-platform/shared`.

14. **Drizzle `and` import**: Need to import `and` from `'drizzle-orm'` for the duplicate-check WHERE clause: `and(eq(competitors.competitionId, input.competitionId), eq(competitors.participantId, input.participantId))`.

15. **pgEnum in Drizzle creates a Postgres TYPE**: `participantFormatEnum` must be exported from `competitions.ts` and the migration must create the TYPE before altering the table. The enum type name in SQL must exactly match the string passed to `pgEnum('participant_format', ...)`.

16. **Loading current participantFormat in the UI**: The `tournament.list` procedure currently returns competition rows but does NOT include `participantFormat` (it was added in this story's migration). You must update the `list` procedure's `select` to include `participantFormat`, OR create a `getCompetition({ id })` procedure. The simpler approach: add `participantFormat: competitions.participantFormat` to the `list` query's select shape. The `ParticipantsManager` component can call `trpc.tournament.list.useQuery()` and find its own competition to read the current format. Alternatively, pass `initialFormat` as a prop from the server page — server reads competition directly from DB (not shown in current page.tsx, but possible). Simplest: add a `trpc.tournament.getCompetition({ competitionId })` query that returns the competition row including `participantFormat`.

17. **Drizzle schema for `competitions.ts` update**: Must add `participantFormatEnum` and the `participantFormat` column to the existing Drizzle schema. Export `participantFormatEnum` from `index.ts` for use in the router.

18. **Unique constraint in Drizzle**: Use the third argument of `pgTable()` to define table-level constraints:

    ```typescript
    (table) => [
      uniqueIndex('uq_competitors_competition_participant').on(
        table.competitionId,
        table.participantId,
      ),
    ];
    ```

    The SQL migration still needs explicit `UNIQUE (competition_id, participant_id)` or a unique index.

19. **`removeCriterion` pattern for `removeParticipant`**: Use raw SQL `DELETE FROM competitors WHERE id = ${input.competitorDbId} AND competition_id IN (SELECT id FROM competitions WHERE organizer_clerk_id = ${ctx.userId}) RETURNING id` — same ownership-via-subquery pattern from Story 2.2's `removeCriterion`.

20. **Tabs component**: Import `{ Tabs, TabsContent, TabsList, TabsTrigger }` from `'@/components/ui/tabs'`. This requires shadcn/ui tabs component to be installed. If not present, run `pnpm dlx shadcn@latest add tabs` from `apps/web`.

### Architecture Compliance

- **Module boundary**: All participant procedures belong in `tournament.router.ts`. Architecture data boundaries: `tournament` module owns `competitions`, `phases`, `competitors`, `evaluation_templates`.
- **RLS enforcement**: Every DB operation sets `session.current_organizer_id` via SET LOCAL. For `addParticipant` and `listParticipants`, verify competition ownership explicitly (SELECT from competitions) before any write/read on competitors.
- **Ownership subquery for delete**: `removeParticipant` deletes only if `competition_id IN (SELECT id FROM competitions WHERE organizer_clerk_id = ctx.userId)` — same defense-in-depth pattern as `removeCriterion`.
- **Error handling**: `TRPCError({ code: 'NOT_FOUND' })` for missing competition, `TRPCError({ code: 'CONFLICT' })` for duplicate participantId. Client-side: catch tRPC error code CONFLICT to show inline error message.
- **Naming conventions**: DB table `competitors` (snake_case plural), columns `competition_id`, `participant_id`, `created_at`. Drizzle exports: `competitors` (camelCase). React component: `ParticipantsManager` (PascalCase). File: `participants-manager.tsx` (kebab-case).
- **Shared types in `packages/shared`**: `Participant` and `ParticipantFormat` in `participant.types.ts`, Zod schemas in `participant.schema.ts`. Never define types or schemas in `apps/web` or `apps/api`.

### DB Schema Detail

```typescript
// packages/db/schema/competitors.ts
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';

export const competitors = pgTable(
  'competitors',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(21)),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    participantId: text('participant_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_competitors_competition_participant').on(
      table.competitionId,
      table.participantId,
    ),
  ],
);

export type CompetitorRow = typeof competitors.$inferSelect;
export type NewCompetitorRow = typeof competitors.$inferInsert;
```

```typescript
// packages/db/schema/competitions.ts — additions
import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const competitionStatusEnum = pgEnum('competition_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);

export const participantFormatEnum = pgEnum('participant_format', ['individual', 'pairs']);

export const competitions = pgTable('competitions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  organizerClerkId: text('organizer_clerk_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  date: timestamp('date', { withTimezone: true }),
  status: competitionStatusEnum('status').notNull().default('draft'),
  participantFormat: participantFormatEnum('participant_format').notNull().default('individual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompetitionRow = typeof competitions.$inferSelect;
export type NewCompetitionRow = typeof competitions.$inferInsert;
```

### Migration SQL (0004)

```sql
-- packages/db/migrations/0004_add_participant_registration.sql

-- 1. Create participant_format enum type
CREATE TYPE participant_format AS ENUM ('individual', 'pairs');

-- 2. Add participant_format column to competitions
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS participant_format participant_format NOT NULL DEFAULT 'individual';

-- 3. Create competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id             text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  name           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_competitors_competition_id
  ON competitors(competition_id);

-- 4. Enable RLS (matches competitions and evaluation_criteria pattern from 0001/0003)
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitors_organizer_isolation
  ON competitors
  USING (
    competition_id IN (
      SELECT id FROM competitions
      WHERE organizer_clerk_id = current_setting('session.current_organizer_id', true)
    )
  )
  WITH CHECK (
    competition_id IN (
      SELECT id FROM competitions
      WHERE organizer_clerk_id = current_setting('session.current_organizer_id', true)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON competitors TO current_user;
```

### Validation Schema Detail

```typescript
// packages/shared/validation/participant.schema.ts
import { z } from 'zod';

export const addParticipantSchema = z.object({
  competitionId: z.string().min(1),
  participantId: z
    .string()
    .trim()
    .min(1, 'Participant ID is required')
    .max(50, 'ID must be 50 characters or fewer'),
  name: z
    .string()
    .trim()
    .min(1, 'Participant name is required')
    .max(100, 'Name must be 100 characters or fewer'),
});

export type AddParticipantInput = z.infer<typeof addParticipantSchema>;

export const setParticipantFormatSchema = z.object({
  competitionId: z.string().min(1),
  format: z.enum(['individual', 'pairs']),
});

export type SetParticipantFormatInput = z.infer<typeof setParticipantFormatSchema>;
```

```typescript
// packages/shared/types/participant.types.ts
export type ParticipantFormat = 'individual' | 'pairs';

export interface Participant {
  id: string;
  competitionId: string;
  participantId: string;
  name: string;
  createdAt: Date;
}
```

### tRPC Procedures — Implementation Sketch

Add these after `copyCriteriaTemplate` in `tournament.router.ts`.

New imports to add at the top:

```typescript
import { competitors } from '@competition-platform/db';
import { addParticipantSchema, setParticipantFormatSchema } from '@competition-platform/shared';
// Also add 'and' and 'asc' to the drizzle-orm import:
import { sql, eq, desc, max, and, asc } from 'drizzle-orm';
```

```typescript
    listParticipants: protectedProcedure
      .input(z.object({ competitionId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
          }
          return tx
            .select()
            .from(competitors)
            .where(eq(competitors.competitionId, input.competitionId))
            .orderBy(asc(competitors.createdAt));
        });
      }),

    addParticipant: protectedProcedure
      .input(addParticipantSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
          }
          const [existing] = await tx
            .select({ id: competitors.id })
            .from(competitors)
            .where(
              and(
                eq(competitors.competitionId, input.competitionId),
                eq(competitors.participantId, input.participantId),
              ),
            );
          if (existing) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'A participant with this ID already exists in this competition',
            });
          }
          const [created] = await tx
            .insert(competitors)
            .values({
              competitionId: input.competitionId,
              participantId: input.participantId,
              name: input.name,
            })
            .returning();
          return created;
        });
      }),

    removeParticipant: protectedProcedure
      .input(z.object({ competitorDbId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
          const result = await tx.execute(
            sql`DELETE FROM competitors
                WHERE id = ${input.competitorDbId}
                  AND competition_id IN (
                    SELECT id FROM competitions
                    WHERE organizer_clerk_id = ${ctx.userId}
                  )
                RETURNING id`,
          );
          if (result.length === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Participant not found' });
          }
        });
      }),

    setParticipantFormat: protectedProcedure
      .input(setParticipantFormatSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
          const [comp] = await tx
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, input.competitionId));
          if (!comp) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
          }
          const [updated] = await tx
            .update(competitions)
            .set({ participantFormat: input.format })
            .where(eq(competitions.id, input.competitionId))
            .returning({
              id: competitions.id,
              participantFormat: competitions.participantFormat,
            });
          return updated;
        });
      }),
```

### Frontend Implementation Notes

**`participants-manager.tsx` structure:**

```tsx
'use client';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ParticipantsManagerProps {
  competitionId: string;
  initialFormat?: 'individual' | 'pairs';
}

export function ParticipantsManager({
  competitionId,
  initialFormat = 'individual',
}: ParticipantsManagerProps) {
  const [participantId, setParticipantId] = useState('');
  const [name, setName] = useState('');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [format, setFormat] = useState<'individual' | 'pairs'>(initialFormat);

  const { data: participants, isLoading } = trpc.tournament.listParticipants.useQuery({
    competitionId,
  });
  const utils = trpc.useUtils();

  const addMutation = trpc.tournament.addParticipant.useMutation({
    onSuccess: () => {
      utils.tournament.listParticipants.invalidate({ competitionId });
      setParticipantId('');
      setName('');
      setConflictError(null);
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        setConflictError(err.message);
      }
    },
  });

  const removeMutation = trpc.tournament.removeParticipant.useMutation({
    onSuccess: () => {
      utils.tournament.listParticipants.invalidate({ competitionId });
    },
  });

  const formatMutation = trpc.tournament.setParticipantFormat.useMutation();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setConflictError(null);
    addMutation.mutate({ competitionId, participantId: participantId.trim(), name: name.trim() });
  };

  const handleFormatChange = (newFormat: 'individual' | 'pairs') => {
    setFormat(newFormat);
    formatMutation.mutate({ competitionId, format: newFormat });
  };

  // render: participants list, add form, format selector
}
```

**Inline error display:**

- When `conflictError` is set, render it as `<p id="pid-error" className="text-sm text-destructive">{conflictError}</p>` below the Participant ID input
- Add `aria-describedby="pid-error"` to the participantId `<Input>` when error is present

**Format selector:**

- Use a native `<select>` or two `<Button>` variants (outline vs default) to select Individual/Pairs
- On change, immediately call `handleFormatChange` — optimistic UI (update local state, fire mutation)
- `formatMutation.isPending` can disable the format selector during save

**Getting initial format for the ParticipantsManager prop:**
The server page `[id]/page.tsx` does not currently query the competition directly. Simplest approach: Pass no `initialFormat` and let the component fetch its own competition data via `trpc.tournament.getCompetition` (which you'll add as a new tRPC procedure). OR fetch it inline in the page server component. Recommended: add `tournament.getCompetition({ competitionId })` returning `{ id, name, participantFormat }`. Alternative minimal approach: render without initial format (default 'individual') and update via `setParticipantFormat` only on explicit user action.

**Updated `[id]/page.tsx` with Tabs:**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CriteriaManager } from '@/components/admin/criteria-manager';
import { ParticipantsManager } from '@/components/admin/participants-manager';

export default async function CompetitionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-6">Competition Configuration</h1>
      <Tabs defaultValue="criteria">
        <TabsList>
          <TabsTrigger value="criteria">Evaluation Criteria</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
        </TabsList>
        <TabsContent value="criteria">
          <CriteriaManager competitionId={id} />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsManager competitionId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

If `@/components/ui/tabs` does not exist, run: `pnpm dlx shadcn@latest add tabs` from `apps/web`.

### Testing Standards

- Primary CI gate: `pnpm exec turbo run lint typecheck test build`
- No live DB in CI — do NOT run migrations in tests
- Co-located test file: `tournament.router.spec.ts` (already exists from Stories 2.1/2.2)
- All new tests use the existing `mockDb` and `caller()` helpers — no DB reached in Zod/auth tests

```typescript
describe('tournament.addParticipant', () => {
  it('rejects empty name', async () => {
    await expect(
      caller('user_123').tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: 'MC-001',
        name: '',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects whitespace-only name', async () => {
    await expect(
      caller('user_123').tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: 'MC-001',
        name: '   ',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects empty participantId', async () => {
    await expect(
      caller('user_123').tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: '',
        name: 'DJ Sample',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.addParticipant({
        competitionId: 'comp_abc',
        participantId: 'MC-001',
        name: 'DJ Sample',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.setParticipantFormat', () => {
  it('rejects invalid format value', async () => {
    await expect(
      caller('user_123').tournament.setParticipantFormat({
        competitionId: 'comp_abc',
        format: 'trio' as any,
      }),
    ).rejects.toThrow(TRPCError);
  });
});

describe('tournament.listParticipants', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.listParticipants({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.removeParticipant', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.removeParticipant({ competitorDbId: 'abc123' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
```

### Project Structure — Files to Create/Modify

**New files:**

```
packages/db/schema/competitors.ts
packages/db/migrations/0004_add_participant_registration.sql
packages/shared/types/participant.types.ts
packages/shared/validation/participant.schema.ts
apps/web/src/components/admin/participants-manager.tsx
```

**Modified files:**

```
packages/db/schema/competitions.ts             — add participantFormatEnum + participantFormat column
packages/db/schema/index.ts                    — add export for competitors.ts + participantFormatEnum
packages/shared/index.ts                       — add exports for participant.types + participant.schema
apps/api/src/trpc/routers/tournament.router.ts — add 4 new procedures + new imports (competitors, and, asc, addParticipantSchema, setParticipantFormatSchema)
apps/api/src/trpc/routers/tournament.router.spec.ts — add participant tests
apps/web/src/app/(admin)/competitions/[id]/page.tsx — wrap with Tabs, add ParticipantsManager
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.3]
- [Source: _bmad-output/planning-artifacts/epics.md#FR3 — Manual participant registration]
- [Source: _bmad-output/planning-artifacts/epics.md#FR4 — Participant format Individual/Pairs]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries — tournament module owns competitors]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #5 — Zod for all input validation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #8 — nanoid server-generated IDs]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns — snake_case DB, camelCase Drizzle exports]
- [Source: _bmad-output/implementation-artifacts/2-2-define-cypher-evaluation-criteria.md#Dev Notes — Critical gotchas]
- [Source: _bmad-output/implementation-artifacts/2-2-define-cypher-evaluation-criteria.md#Code Review Fixes — RLS policy pattern, ownership checks, RETURNING id]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed lint error: TanStack Query v5 removed `onSuccess` from `useQuery`. Replaced `useEffect`+`setState` approach with derived state pattern (`formatOverride ?? serverFormat`) to avoid React strict mode cascading render warning.

### Completion Notes List

- Task 1: Created `competitors` table schema with unique constraint on `(competitionId, participantId)`, added `participantFormatEnum` and `participantFormat` column to `competitions`, created migration 0004 with RLS policy matching existing patterns.
- Task 2: Created `Participant` interface, `ParticipantFormat` type, `addParticipantSchema` and `setParticipantFormatSchema` Zod validators with trim and length constraints.
- Task 3: Added 4 tRPC procedures (`listParticipants`, `addParticipant`, `removeParticipant`, `setParticipantFormat`) all following RLS transaction pattern. Also added `participantFormat` to the `list` query select shape for frontend consumption.
- Task 4: Created `ParticipantsManager` component with add form, participant list, remove buttons, CONFLICT error display, and format toggle buttons. Updated competition config page with shadcn Tabs wrapping CriteriaManager and ParticipantsManager.
- Task 5: Added 7 test cases for participant procedures covering Zod validation (empty name, whitespace name, empty ID, invalid format) and auth (UNAUTHORIZED for null userId).
- Task 6: Full CI pipeline passes — lint, typecheck, 26 tests, build all green.

### Change Log

- 2026-04-22: Story 2.3 implementation — participant registration with CRUD, format selection, tabbed UI, validation tests

### File List

**New files:**

- `packages/db/schema/competitors.ts`
- `packages/db/migrations/0004_add_participant_registration.sql`
- `packages/shared/types/participant.types.ts`
- `packages/shared/validation/participant.schema.ts`
- `apps/web/src/components/admin/participants-manager.tsx`
- `apps/web/src/components/ui/tabs.tsx` (shadcn generated)

**Modified files:**

- `packages/db/schema/competitions.ts` — added `participantFormatEnum` + `participantFormat` column
- `packages/db/schema/index.ts` — added export for `competitors.ts`
- `packages/shared/index.ts` — added exports for participant types + schema
- `apps/api/src/trpc/routers/tournament.router.ts` — added 4 participant procedures + `participantFormat` to `list` select
- `apps/api/src/trpc/routers/tournament.router.spec.ts` — added 7 participant test cases

### Code Review Fixes (Adversarial Review)

- [H1] Fixed TOCTOU race condition in `addParticipant` — added try-catch around INSERT to catch postgres unique constraint violation code `23505` and rethrow as CONFLICT, guaranteeing friendly error message even under concurrent requests
- [M1] Added `setParticipantFormat` auth test — null userId now verified to throw UNAUTHORIZED, matching the pattern established in Story 2.2 [M3] for all new procedures
- [M2] Added `onError` to `removeMutation` in `ParticipantsManager` — stores error message in `removeError` state and displays it below the participant list; `onSuccess` clears it
- [M3] Added `onError` to `formatMutation` in `ParticipantsManager` — rolls back `formatOverride` to `null` on failure so UI reverts to server state instead of showing an unsaved value
- [M4] Replaced `trpc.tournament.list.useQuery()` overfetch with new `tournament.getCompetition({ competitionId })` procedure — eliminated loading all competitions to read one field; format buttons now disabled while competition data loads, preventing flash of incorrect active state
- All fixes pass CI: lint, typecheck, 27 tests (21 in router spec, up from 19), build — 11/11 turbo tasks green
- `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — wrapped with Tabs, added ParticipantsManager
