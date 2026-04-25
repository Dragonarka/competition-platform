# Story 2.2: Define Cypher Evaluation Criteria

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to define the scoring criteria for the Cypher phase (e.g., Musicality, Technique, Creativity),
so that judges know exactly what to score and on what scale.

## Acceptance Criteria

1. Given I am on the competition configuration screen, when I add a criterion with a name, minimum (0.00), maximum (10.00), and 2-decimal precision, then the criterion is saved and appears in my criteria list.

2. Given I have at least one criterion defined, when I add another criterion, then I can have multiple criteria with independent names and score ranges.

3. Given I try to save a criterion with min ≥ max, when the form validates, then a validation error is shown: "Minimum must be less than maximum".

4. Given I have configured criteria for a previous competition, when I create a new competition, then I can select "Use existing template" to copy those criteria into the new competition (FR10).

## Tasks / Subtasks

- [x] Task 1: DB schema — `evaluation_criteria` table (AC: #1, #2, #4)
  - [x] Create `packages/db/schema/evaluation-criteria.ts` with `evaluationCriteria` table: `id` (text PK, `nanoid(21)`), `competitionId` (text FK → competitions.id, cascade delete), `name` (text, notNull), `minScore` (text, notNull, default `'0.00'`), `maxScore` (text, notNull, default `'10.00'`), `precision` (smallint, notNull, default `2`), `displayOrder` (integer, notNull, default `0`), `createdAt` (timestamp with timezone, defaultNow)
  - [x] Export `evaluationCriteria`, `EvaluationCriterionRow`, `NewEvaluationCriterionRow` from `packages/db/schema/index.ts`
  - [x] Create migration `packages/db/migrations/0003_add_evaluation_criteria.sql` with `CREATE TABLE evaluation_criteria (...)` and appropriate indexes

- [x] Task 2: Shared types and validation schema (AC: #1, #2, #3)
  - [x] Create `packages/shared/types/criterion.types.ts`: `EvaluationCriterion` interface with fields: `id`, `competitionId`, `name`, `minScore`, `maxScore`, `precision`, `displayOrder`, `createdAt` (all typed)
  - [x] Create `packages/shared/validation/criterion.schema.ts`:
    - `addCriterionSchema`: `{ competitionId: string min 1, name: string trim min 1 max 100, minScore: string decimal-regex, maxScore: string decimal-regex }` with `.refine()` that `parseFloat(minScore) < parseFloat(maxScore)` → error `"Minimum must be less than maximum"` on path `['minScore']`
    - `copyCriteriaTemplateSchema`: `{ sourceCompetitionId: string min 1, targetCompetitionId: string min 1 }`
  - [x] Export both from `packages/shared/index.ts`

- [x] Task 3: tRPC tournament router — criteria procedures (AC: #1, #2, #3, #4)
  - [x] Add `tournament.listCriteria` — input `{ competitionId: z.string().min(1) }`, RLS transaction, returns rows from `evaluationCriteria` ordered by `displayOrder` for the given competition
  - [x] Add `tournament.addCriterion` — input `addCriterionSchema`, RLS transaction, verify competition belongs to organizer (select from `competitions` where `id = input.competitionId` inside same transaction), compute `displayOrder` as `MAX(displayOrder) + 1`, insert into `evaluationCriteria` with fresh `nanoid(21)`, return created row
  - [x] Add `tournament.removeCriterion` — input `{ criterionId: z.string().min(1) }`, RLS transaction, delete from `evaluationCriteria` where `id = criterionId AND competition_id IN (SELECT id FROM competitions WHERE organizer_clerk_id = ctx.userId)` — ownership enforced by subquery
  - [x] Add `tournament.listCompetitionsWithCriteria` — no input, RLS transaction, returns organizer's competitions (name + id) that have at least one row in `evaluationCriteria` (use `EXISTS` subquery or `INNER JOIN`)
  - [x] Add `tournament.copyCriteriaTemplate` — input `copyCriteriaTemplateSchema`, RLS transaction, verify both competition IDs belong to organizer, load source criteria, bulk-insert into target with fresh `nanoid(21)` IDs (append, do not delete existing target criteria)
  - [x] All new procedures follow exact same RLS pattern: `db.db.transaction(async (tx) => { await tx.execute(sql\`SET LOCAL session.current_organizer_id = ${ctx.userId}\`); ... })`

- [x] Task 4: Frontend — criteria management UI (AC: #1, #2, #3, #4)
  - [x] Create `apps/web/src/components/admin/criteria-manager.tsx` — client component (`"use client"`):
    - Accepts `competitionId: string` as prop
    - `trpc.tournament.listCriteria.useQuery({ competitionId })` for existing criteria
    - `trpc.tournament.addCriterion.useMutation()` — on success, invalidate `listCriteria` query
    - `trpc.tournament.removeCriterion.useMutation()` — on success, invalidate `listCriteria` query
    - `trpc.tournament.listCompetitionsWithCriteria.useQuery()` — for template dropdown
    - `trpc.tournament.copyCriteriaTemplate.useMutation()` — on success, invalidate `listCriteria` query
    - Add-criterion form: name `<Input>`, minScore `<Input type="number" step="0.01" min="0">`, maxScore `<Input type="number" step="0.01" min="0">`, "Add Criterion" `<Button>`
    - On form submit: convert numeric inputs to decimal strings via `.toFixed(2)` before calling `addCriterion`
    - Inline validation error under minScore field when min ≥ max (use `aria-describedby` per Story 2.1 pattern)
    - Existing criteria list: show `name` + `minScore–maxScore` range + delete button per row
    - Template section (only rendered when `listCompetitionsWithCriteria.data?.length > 0`): native `<select>` with competition options + "Copy Template" button
  - [x] Update `apps/web/src/app/(admin)/competitions/[id]/page.tsx` — replace stub `<p>` content with `<CriteriaManager competitionId={id} />`; import `CriteriaManager` component; page remains a server component, `CriteriaManager` is the client boundary

- [x] Task 5: Tests (AC: #3)
  - [x] Add to `apps/api/src/trpc/routers/tournament.router.spec.ts`:
    - `addCriterion` rejects when `minScore === maxScore` → Zod refine error "Minimum must be less than maximum"
    - `addCriterion` rejects when `minScore > maxScore`
    - `addCriterion` rejects empty/whitespace name
    - `listCriteria` caller with null userId (not authed) → throws UNAUTHORIZED

- [x] Task 6: Verify CI (AC: all)
  - [x] Run `pnpm exec turbo run lint typecheck test build` — all tasks pass (15 tests, 11/11 turbo tasks green)

## Dev Notes

### CRITICAL — Gotchas from Stories 1.x and 2.1 (MUST READ BEFORE CODING)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy is `apps/web/src/proxy.ts` with exported `proxy` function. Never create `middleware.ts`. This is a confirmed project convention established in Story 1.2.

2. **`reflect-metadata` in Vitest**: `apps/api/vitest.config.ts` has `setupFiles: ['reflect-metadata']`. All NestJS spec files get it automatically — do NOT import manually.

3. **tRPC client sends Clerk JWT automatically**: `apps/web/src/lib/trpc.tsx` uses `useAuth().getToken()` in `httpBatchLink.headers()`. Every `trpc.*` query/mutation from client components sends the correct `Authorization: Bearer <token>`. **Do not re-implement auth on the client side.**

4. **Factory router pattern**: `createTournamentRouter(db: DatabaseService)` receives DB as parameter. Do NOT use NestJS DI in router files. Import `t` from `'../trpc.init'`, not from the router itself.

5. **RLS transaction pattern CRITICAL**: Always `await tx.execute(sql\`SET LOCAL session.current_organizer_id = ${ctx.userId}\`)`inside`db.db.transaction()`. `SET LOCAL` scopes to the transaction only. Every single procedure touching the DB must follow this pattern.

6. **protectedProcedure from shared module**: Import from `'../trpc.procedures'` — NOT redefined per router. Already in use in `tournament.router.ts`.

7. **postgres-js (not pg) for runtime**: Use `postgres` package. `pg` is devDependency only (Drizzle Kit).

8. **IDs are server-generated nanoid(21)**: Call `nanoid(21)` explicitly in the insert. The `$defaultFn` is a Drizzle schema default — always verify it's called on INSERT, not relying solely on it.

9. **Scores/ranges as strings with 2 decimal places — enforcement rule #7**: `minScore` and `maxScore` must be stored as text `"X.XX"` (e.g., `"0.00"`, `"10.00"`). When receiving numeric form input, convert with `.toFixed(2)` in the client component before sending to tRPC. On the server in `addCriterion`, normalize input to 2 decimal places: `parseFloat(input.minScore).toFixed(2)`.

10. **Zod for ALL input validation — enforcement rule #5**: All schemas live in `packages/shared/validation/`. The `addCriterionSchema` cross-field `refine()` for min < max is mandatory. Never use manual if/else checks.

11. **shadcn/ui Button does NOT support `asChild`**: This component uses `@base-ui/react`, not Radix. Use `buttonVariants()` className on `<Link>` for link-as-button. (Established in Story 2.1 debug notes.)

12. **Next.js 16 async params**: `params: Promise<{ id: string }>` must be `await`-ed. Already correct in current `[id]/page.tsx`. Do not change the page server component to a client component — keep it server, add `CriteriaManager` as the client boundary.

13. **No `competitions` tRPC namespace**: Use `tournament` bounded context. The tournament module owns competitions, evaluation_criteria, and participants per architecture data boundaries.

14. **tRPC `z` import in router**: Import `{ z }` from `'zod'` directly in the router file for inline schemas (e.g., `z.object({ competitionId: z.string().min(1) })`). Import named schemas from `@competition-platform/shared`.

15. **Drizzle `sql` import**: Already imported in `tournament.router.ts` as `import { sql, eq, desc } from 'drizzle-orm'`. Add `max` if needed for displayOrder calculation: `import { sql, eq, desc, max } from 'drizzle-orm'`.

16. **FK reference in Drizzle**: The `evaluationCriteria.competitionId` references `competitions.id`. Drizzle FK references work at schema level for type safety; the actual DB constraint is created in the migration SQL.

### Architecture Compliance

- **Module boundary**: All criteria procedures belong in `tournament.router.ts`. The `tournament` module owns `competitions`, `evaluation_criteria`, `phases`, `competitors`, `evaluation_templates` (per `architecture.md` Data Boundaries table).
- **Score storage**: `min_score` and `max_score` columns are `text` type — never `numeric`, `decimal`, or `float`. Store `"0.00"` not `0.00`.
- **Shared types in `packages/shared`**: `EvaluationCriterion` interface in `criterion.types.ts`, Zod schemas in `criterion.schema.ts`. Never define types or schemas in `apps/web` or `apps/api`.
- **RLS enforcement**: Every DB operation sets RLS. For `addCriterion`, verify competition ownership explicitly (select from competitions inside same transaction) — do NOT rely solely on RLS for this check, as the RLS policy filters rows but won't throw a useful error.
- **Error handling**: `TRPCError({ code: 'NOT_FOUND', message: '...' })` when competition not found. Client-side: let tRPC handle display.
- **Naming conventions**: DB table `evaluation_criteria` (snake_case plural), columns `competition_id`, `min_score`, `max_score`, `display_order`, `created_at`. Drizzle exports: `evaluationCriteria` (camelCase). React component: `CriteriaManager` (PascalCase). File: `criteria-manager.tsx` (kebab-case).

### DB Schema Detail

```typescript
// packages/db/schema/evaluation-criteria.ts
import { pgTable, text, smallint, integer, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { competitions } from './competitions';

export const evaluationCriteria = pgTable('evaluation_criteria', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  minScore: text('min_score').notNull().default('0.00'),
  maxScore: text('max_score').notNull().default('10.00'),
  precision: smallint('precision').notNull().default(2),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EvaluationCriterionRow = typeof evaluationCriteria.$inferSelect;
export type NewEvaluationCriterionRow = typeof evaluationCriteria.$inferInsert;
```

Migration SQL (0003):

```sql
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id         text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name       text NOT NULL,
  min_score  text NOT NULL DEFAULT '0.00',
  max_score  text NOT NULL DEFAULT '10.00',
  precision  smallint NOT NULL DEFAULT 2,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_competition_id
  ON evaluation_criteria(competition_id);
```

### Validation Schema Detail

```typescript
// packages/shared/validation/criterion.schema.ts
import { z } from 'zod';

const decimalStringSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal number');

export const addCriterionSchema = z
  .object({
    competitionId: z.string().min(1),
    name: z
      .string()
      .trim()
      .min(1, 'Criterion name is required')
      .max(100, 'Name must be 100 characters or fewer'),
    minScore: decimalStringSchema,
    maxScore: decimalStringSchema,
  })
  .refine((data) => parseFloat(data.minScore) < parseFloat(data.maxScore), {
    message: 'Minimum must be less than maximum',
    path: ['minScore'],
  });

export type AddCriterionInput = z.infer<typeof addCriterionSchema>;

export const copyCriteriaTemplateSchema = z.object({
  sourceCompetitionId: z.string().min(1),
  targetCompetitionId: z.string().min(1),
});

export type CopyCriteriaTemplateInput = z.infer<typeof copyCriteriaTemplateSchema>;
```

### tRPC Procedures — Implementation Sketch

Add these after the `create` procedure in `tournament.router.ts`:

```typescript
listCriteria: protectedProcedure
  .input(z.object({ competitionId: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      return tx
        .select()
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.competitionId, input.competitionId))
        .orderBy(evaluationCriteria.displayOrder);
    });
  }),

addCriterion: protectedProcedure
  .input(addCriterionSchema)
  .mutation(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      // Verify competition ownership
      const [comp] = await tx
        .select({ id: competitions.id })
        .from(competitions)
        .where(eq(competitions.id, input.competitionId));
      if (!comp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
      // Get next displayOrder
      const [{ maxOrder }] = await tx
        .select({ maxOrder: max(evaluationCriteria.displayOrder) })
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.competitionId, input.competitionId));
      const nextOrder = (maxOrder ?? -1) + 1;
      // Insert
      const [created] = await tx
        .insert(evaluationCriteria)
        .values({
          competitionId: input.competitionId,
          name: input.name,
          minScore: parseFloat(input.minScore).toFixed(2),
          maxScore: parseFloat(input.maxScore).toFixed(2),
          displayOrder: nextOrder,
        })
        .returning();
      return created;
    });
  }),

removeCriterion: protectedProcedure
  .input(z.object({ criterionId: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      // Delete only if criterion's competition belongs to this organizer
      await tx.execute(
        sql`DELETE FROM evaluation_criteria
            WHERE id = ${input.criterionId}
              AND competition_id IN (
                SELECT id FROM competitions
                WHERE organizer_clerk_id = ${ctx.userId}
              )`,
      );
    });
  }),

listCompetitionsWithCriteria: protectedProcedure
  .query(async ({ ctx }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      return tx
        .selectDistinct({ id: competitions.id, name: competitions.name })
        .from(competitions)
        .innerJoin(
          evaluationCriteria,
          eq(evaluationCriteria.competitionId, competitions.id),
        )
        .where(eq(competitions.organizerClerkId, ctx.userId))
        .orderBy(desc(competitions.createdAt));
    });
  }),

copyCriteriaTemplate: protectedProcedure
  .input(copyCriteriaTemplateSchema)
  .mutation(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      // Verify source competition belongs to organizer
      const [source] = await tx
        .select({ id: competitions.id })
        .from(competitions)
        .where(eq(competitions.id, input.sourceCompetitionId));
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source competition not found' });
      // Verify target competition belongs to organizer
      const [target] = await tx
        .select({ id: competitions.id })
        .from(competitions)
        .where(eq(competitions.id, input.targetCompetitionId));
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target competition not found' });
      // Load source criteria
      const sourceCriteria = await tx
        .select()
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.competitionId, input.sourceCompetitionId))
        .orderBy(evaluationCriteria.displayOrder);
      if (sourceCriteria.length === 0) return { copied: 0 };
      // Get current max order on target
      const [{ maxOrder }] = await tx
        .select({ maxOrder: max(evaluationCriteria.displayOrder) })
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.competitionId, input.targetCompetitionId));
      const startOrder = (maxOrder ?? -1) + 1;
      // Bulk insert (append)
      await tx.insert(evaluationCriteria).values(
        sourceCriteria.map((c, i) => ({
          competitionId: input.targetCompetitionId,
          name: c.name,
          minScore: c.minScore,
          maxScore: c.maxScore,
          precision: c.precision,
          displayOrder: startOrder + i,
        })),
      );
      return { copied: sourceCriteria.length };
    });
  }),
```

Note: Import `TRPCError` from `'@trpc/server'` and `max` from `'drizzle-orm'` in `tournament.router.ts`. Also import `evaluationCriteria` from `'@competition-platform/db'`, and add criterion schemas from `'@competition-platform/shared'`.

### Frontend Implementation Notes

**`criteria-manager.tsx` structure:**

```tsx
'use client';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CriteriaManagerProps {
  competitionId: string;
}

export function CriteriaManager({ competitionId }: CriteriaManagerProps) {
  // form state: name, minScore, maxScore (strings)
  // validation error state
  // useQuery + useMutations
  // render: criteria list, add form, template section
}
```

**Form score handling:**

- Use `<Input type="number" step="0.01" min="0">` for minScore/maxScore
- On submit, convert to string: `parseFloat(formMinScore).toFixed(2)`
- Client-side validation before calling tRPC: check `parseFloat(min) >= parseFloat(max)` and show inline error without calling mutation

**Template section:**

- Only show if `listCompetitionsWithCriteria.data?.length > 0`
- Filter out current competition from dropdown
- `<select>` with native HTML options (no need for shadcn Select component)
- After copy succeeds, refetch `listCriteria`

**Updated `[id]/page.tsx`:**

```tsx
import { CriteriaManager } from '@/components/admin/criteria-manager';

export default async function CompetitionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-6">Competition Configuration</h1>
      <CriteriaManager competitionId={id} />
    </div>
  );
}
```

### Testing Standards

- Primary CI gate: `pnpm exec turbo run lint typecheck test build`
- No live DB in CI — do NOT run migrations in tests
- Co-located test file: `tournament.router.spec.ts` (already exists from Story 2.1)
- New tests to add to the existing spec file:

```typescript
describe('tournament.addCriterion', () => {
  it('rejects when minScore equals maxScore', async () => {
    // create caller with valid ctx.userId
    // call addCriterion with minScore: '5.00', maxScore: '5.00'
    // expect TRPCError or ZodError with 'Minimum must be less than maximum'
  });
  it('rejects when minScore greater than maxScore', async () => { ... });
  it('rejects empty name', async () => { ... });
  it('requires auth (null userId)', async () => { ... });
});
```

### Project Structure — Files to Create/Modify

**New files:**

```
packages/db/schema/evaluation-criteria.ts
packages/db/migrations/0003_add_evaluation_criteria.sql
packages/shared/types/criterion.types.ts
packages/shared/validation/criterion.schema.ts
apps/web/src/components/admin/criteria-manager.tsx
```

**Modified files:**

```
packages/db/schema/index.ts                         — add export for evaluation-criteria
packages/shared/index.ts                            — add exports for criterion.types + criterion.schema
apps/api/src/trpc/routers/tournament.router.ts      — add 5 new procedures + new imports
apps/api/src/trpc/routers/tournament.router.spec.ts — add criterion tests
apps/web/src/app/(admin)/competitions/[id]/page.tsx — replace stub with CriteriaManager
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.2]
- [Source: _bmad-output/planning-artifacts/epics.md#FR2 — Evaluation criteria for Cypher phase]
- [Source: _bmad-output/planning-artifacts/epics.md#FR10 — Evaluation criteria template reuse]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries — tournament module owns evaluation_templates]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #7 — scores as strings with 2 decimal places]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #5 — Zod for all input validation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #8 — nanoid server-generated IDs]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns — snake_case DB, camelCase Drizzle exports]
- [Source: _bmad-output/planning-artifacts/prd.md#FR2, FR10]
- [Source: _bmad-output/implementation-artifacts/2-1-create-a-competition.md#Dev Notes — Critical gotchas]
- [Source: _bmad-output/implementation-artifacts/2-1-create-a-competition.md#Debug Log — asChild, zod, shared package]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Removed unused `ZodError` import from spec file to fix ESLint `no-unused-vars` error

### Completion Notes List

- Implemented `evaluation_criteria` Drizzle schema with text-typed score columns (architecture rule #7)
- Created DB migration `0003_add_evaluation_criteria.sql` with FK, cascade delete, and competition_id index
- Added `EvaluationCriterion` interface and Zod schemas (`addCriterionSchema`, `copyCriteriaTemplateSchema`) in shared package
- Implemented 5 tRPC procedures in `tournament.router.ts`: `listCriteria`, `addCriterion`, `removeCriterion`, `listCompetitionsWithCriteria`, `copyCriteriaTemplate` — all use RLS transaction pattern
- `addCriterion` enforces competition ownership via explicit SELECT inside same transaction before insert
- `removeCriterion` enforces ownership via subquery in raw SQL DELETE
- Created `CriteriaManager` client component with add-form, criteria list, delete buttons, and template copy section
- Template section only renders when other competitions with criteria exist (filters out current competition)
- All tests pass (15 total), full CI green: lint, typecheck, test, build

### Code Review Fixes (Adversarial Review)

- [H1] Added RLS policy to migration 0003 — `evaluation_criteria` table now enforces organizer isolation via `competition_id IN (SELECT id FROM competitions WHERE ...)`, matching the `competitions` table pattern from 0001
- [H2] Added explicit competition ownership check to `listCriteria` — SELECT from competitions before querying criteria, throws NOT_FOUND if competition doesn't belong to organizer
- [M1] Added `.refine()` to `copyCriteriaTemplateSchema` — prevents `sourceCompetitionId === targetCompetitionId` (self-copy duplicate)
- [M2] `removeCriterion` now uses `RETURNING id` and throws NOT_FOUND when criterion doesn't exist or isn't owned
- [M3] Added 4 new tests: auth tests for `listCriteria`, `removeCriterion`, `copyCriteriaTemplate` (null userId → UNAUTHORIZED), plus source==target validation test for `copyCriteriaTemplate`
- [L1] `copyCriteriaTemplate.onSuccess` now invalidates `listCompetitionsWithCriteria` in addition to `listCriteria`
- All tests pass (19 total), full CI green: lint, typecheck, test, build (11/11 turbo tasks)

### File List

packages/db/schema/evaluation-criteria.ts (new)
packages/db/migrations/0003_add_evaluation_criteria.sql (new)
packages/shared/types/criterion.types.ts (new)
packages/shared/validation/criterion.schema.ts (new)
apps/web/src/components/admin/criteria-manager.tsx (new)
packages/db/schema/index.ts (modified)
packages/shared/index.ts (modified)
apps/api/src/trpc/routers/tournament.router.ts (modified)
apps/api/src/trpc/routers/tournament.router.spec.ts (modified)
apps/web/src/app/(admin)/competitions/[id]/page.tsx (modified)
