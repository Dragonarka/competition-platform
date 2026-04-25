# Story 2.4: Configure Judge Groups & Advancement Rules

Status: done

## Story

As an organizer,
I want to configure how many judges will participate, how they are divided into groups, and how many participants advance to Battles,
so that the system can auto-assign participants and determine the Battles bracket size.

## Acceptance Criteria

1. Given I am on the competition configuration screen, when I set the number of judges and the number of judge groups, then the system shows a live preview of how participants will be distributed across groups (e.g., "3 groups of 3 judges — each judge evaluates ~8 participants").

2. Given I set an advancement threshold of top N, when the Cypher phase completes, then exactly the top N ranked participants advance to Battles (FR7) — this configuration is stored and used by Story 3.2 when the phase starts.

3. Given I configure the Battles phase judge count independently, when I set a different number from the Cypher judge count, then both values are saved independently and used in their respective phases (FR8).

4. Given I configure tie-breaking as "re-vote", when a Battles matchup ends in a tie, then judges are prompted to vote again on that matchup (FR9) — this configuration is stored and enforced in Story 5.3.

5. And all numeric configuration values are validated with Zod schemas before saving — invalid values (e.g., zero judges, groups > judges) are rejected with clear error messages.

## Tasks / Subtasks

- [x] Task 1: DB schema — add judge config columns to competitions (AC: #1, #2, #3, #4, #5)
  - [x] Add `tieBreakingRuleEnum = pgEnum('tie_breaking_rule', ['re_vote', 'organizer_decision'])` to `packages/db/schema/competitions.ts`
  - [x] Add `integer` to pg-core import
  - [x] Add 5 nullable columns to `competitions` table:
    - `cypherJudgeCount: integer('cypher_judge_count')` — total judges for Cypher phase
    - `cypherGroupCount: integer('cypher_group_count')` — number of judge groups for Cypher
    - `advancementThreshold: integer('advancement_threshold')` — top N advancing to Battles
    - `battlesJudgeCount: integer('battles_judge_count')` — judges for Battles phase (independent)
    - `tieBreakingRule: tieBreakingRuleEnum('tie_breaking_rule')` — 're_vote' | 'organizer_decision'
  - [x] Export `tieBreakingRuleEnum` from `packages/db/schema/index.ts`
  - [x] Create migration `packages/db/migrations/0005_add_judge_config.sql`:
    - `CREATE TYPE tie_breaking_rule AS ENUM ('re_vote', 'organizer_decision')`
    - `ALTER TABLE competitions ADD COLUMN IF NOT EXISTS cypher_judge_count integer`
    - `ALTER TABLE competitions ADD COLUMN IF NOT EXISTS cypher_group_count integer`
    - `ALTER TABLE competitions ADD COLUMN IF NOT EXISTS advancement_threshold integer`
    - `ALTER TABLE competitions ADD COLUMN IF NOT EXISTS battles_judge_count integer`
    - `ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tie_breaking_rule tie_breaking_rule`
    - No RLS changes needed — existing competitions RLS policy already covers all columns

- [x] Task 2: Shared types and validation schema (AC: #1, #2, #3, #4, #5)
  - [x] Create `packages/shared/types/judge-config.types.ts`:
    - `TieBreakingRule` type = `'re_vote' | 'organizer_decision'`
    - `JudgeConfig` interface: `{ cypherJudgeCount: number; cypherGroupCount: number; advancementThreshold: number; battlesJudgeCount: number; tieBreakingRule: TieBreakingRule }`
    - `JudgeConfigPartial` interface with all fields optional (for when config not yet saved)
  - [x] Create `packages/shared/validation/judge-config.schema.ts`:
    - `setJudgeConfigSchema`: `{ competitionId: z.string().min(1), cypherJudgeCount: z.number().int().min(1, '...').max(100, '...'), cypherGroupCount: z.number().int().min(1, '...').max(50, '...'), advancementThreshold: z.number().int().min(1, '...'), battlesJudgeCount: z.number().int().min(1, '...').max(100, '...'), tieBreakingRule: z.enum(['re_vote', 'organizer_decision']) }`
    - Add cross-field refinement: `.refine((d) => d.cypherGroupCount <= d.cypherJudgeCount, { message: 'Number of groups cannot exceed total judge count', path: ['cypherGroupCount'] })`
    - Export `SetJudgeConfigInput = z.infer<typeof setJudgeConfigSchema>`
  - [x] Add exports to `packages/shared/index.ts`: `export * from './types/judge-config.types'` and `export * from './validation/judge-config.schema'`

- [x] Task 3: tRPC tournament router — judge config procedures (AC: #1, #2, #3, #4, #5)
  - [x] Add `setJudgeConfigSchema` to imports from `@competition-platform/shared` in `tournament.router.ts`
  - [x] Add `tieBreakingRuleEnum` is NOT needed as a direct import in the router — Drizzle infers it from the schema type. Only the competitions schema import is needed.
  - [x] Update `getCompetition` procedure: extend the `.select()` to also return `cypherJudgeCount`, `cypherGroupCount`, `advancementThreshold`, `battlesJudgeCount`, and `tieBreakingRule` from `competitions`. All five fields are nullable and will be `null` until `setJudgeConfig` is called.
  - [x] Add `setJudgeConfig` procedure:
    - Input: `setJudgeConfigSchema`
    - RLS transaction: `SET LOCAL session.current_organizer_id = ${ctx.userId}`
    - Verify ownership: `SELECT id FROM competitions WHERE id = $competitionId` — throw `NOT_FOUND` if missing
    - UPDATE competitions: set all 5 fields from input
    - Return updated row with the 5 judge config fields + id

- [x] Task 4: Frontend — judge groups management UI (AC: #1, #2, #3, #4, #5)
  - [x] Create `apps/web/src/components/admin/judge-groups-manager.tsx` — client component (`"use client"`):
    - Props: `competitionId: string`
    - `trpc.tournament.getCompetition.useQuery({ competitionId })` — reads current judge config for prefilling; also reads competition status to guard config changes
    - `trpc.tournament.listParticipants.useQuery({ competitionId })` — reads `data.length` for live preview calculation
    - `trpc.tournament.setJudgeConfig.useMutation()` — on success invalidate `getCompetition`; on error show inline error
    - Form state (controlled): `cypherJudgeCount`, `cypherGroupCount`, `advancementThreshold`, `battlesJudgeCount`, `tieBreakingRule` — initialize from `getCompetition` data when it loads
    - **Live preview** (computed, updates as user types):
      ```
      judgesPerGroup = cypherGroupCount > 0 && cypherJudgeCount >= cypherGroupCount
        ? Math.floor(cypherJudgeCount / cypherGroupCount)
        : 0
      participantsPerGroup = participantCount > 0 && cypherGroupCount > 0
        ? Math.ceil(participantCount / cypherGroupCount)
        : 0
      previewText = `${cypherGroupCount} group(s) of ${judgesPerGroup} judges — each judge evaluates ~${participantsPerGroup} participants`
      ```
    - Render preview only when all values are valid positive integers
    - Form layout:
      - **Cypher Phase** section:
        - "Total Judges (Cypher)" `<Input type="number" min="1" max="100">`
        - "Number of Groups" `<Input type="number" min="1" max="50">`
        - Live preview `<p>` rendered when inputs are valid
      - **Battles Phase** section:
        - "Total Judges (Battles)" `<Input type="number" min="1" max="100">`
        - "Tie-breaking Rule" — native `<select>` with options "Re-vote" (value `re_vote`) and "Organizer Decision" (value `organizer_decision`)
      - **Advancement** section:
        - "Participants Advancing to Battles" `<Input type="number" min="1">`
        - Helper text: "Top N participants by Cypher score advance to Battles"
      - "Save Configuration" `<Button>` — calls `setJudgeConfig.mutate(...)` with all fields
    - Show inline error below form if mutation fails (use `setJudgeConfig.error?.message`)
    - Show saved state: when mutation succeeds, brief "Saved ✓" state (same pattern as other managers)
    - Disable form and button while `setJudgeConfig.isPending`
  - [x] Update `apps/web/src/app/(admin)/competitions/[id]/page.tsx`:
    - Add `import { JudgeGroupsManager } from '@/components/admin/judge-groups-manager'`
    - Add third tab: `<TabsTrigger value="judge-groups">Judge Groups</TabsTrigger>`
    - Add third tab content: `<TabsContent value="judge-groups"><JudgeGroupsManager competitionId={id} /></TabsContent>`
    - Keep existing two tabs unchanged

- [x] Task 5: Tests (AC: #5)
  - [x] Add to `apps/api/src/trpc/routers/tournament.router.spec.ts`:
    - `setJudgeConfig` rejects `cypherJudgeCount = 0` → Zod error
    - `setJudgeConfig` rejects `cypherGroupCount > cypherJudgeCount` → Zod error (cross-field)
    - `setJudgeConfig` rejects `advancementThreshold = 0` → Zod error
    - `setJudgeConfig` rejects invalid `tieBreakingRule` value → Zod error
    - `setJudgeConfig` with null userId → throws UNAUTHORIZED

- [x] Task 6: Verify CI (AC: all)
  - [x] Run `pnpm exec turbo run lint typecheck test build` — all tasks pass

## Dev Notes

### CRITICAL — Accumulated Gotchas from Stories 1.x through 2.3 (MUST READ)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy is `apps/web/src/proxy.ts` with exported `proxy` function. Do NOT create `middleware.ts`.

2. **`reflect-metadata` in Vitest**: `apps/api/vitest.config.ts` has `setupFiles: ['reflect-metadata']`. Do NOT import manually in spec files.

3. **Factory router pattern**: `createTournamentRouter(db: DatabaseService)` receives DB as parameter. Import `t` from `'../trpc.init'`, not from the router itself.

4. **RLS transaction pattern CRITICAL**: Every procedure must `await tx.execute(sql\`SET LOCAL session.current_organizer_id = ${ctx.userId}\`)`inside`db.db.transaction()`. `SET LOCAL` scopes to the transaction only. NO EXCEPTIONS.

5. **protectedProcedure from shared module**: Import from `'../trpc.procedures'` — never redefine.

6. **IDs are server-generated nanoid(21)**: Not applicable for judge config (no new table, columns are on competitions which already has its nanoid).

7. **Zod for ALL input validation**: Schema lives in `packages/shared/validation/judge-config.schema.ts`. Cross-field refinements must use `.refine()` or `.superRefine()`.

8. **shadcn/ui Button does NOT support `asChild`**: Uses `@base-ui/react`. Use `buttonVariants()` className on `<Link>` for link-as-button.

9. **Next.js 16 async params**: `params: Promise<{ id: string }>` must be `await`-ed. Keep `[id]/page.tsx` as server component — `JudgeGroupsManager` is the client boundary.

10. **`z` import in router**: Import `{ z }` from `'zod'` directly in the router file for inline schemas. Import named schemas from `@competition-platform/shared`.

11. **pgEnum creates a Postgres TYPE**: `tieBreakingRuleEnum` must be exported from `competitions.ts` and the migration must `CREATE TYPE` before `ALTER TABLE`. The enum type name in SQL must exactly match the string passed to `pgEnum('tie_breaking_rule', ...)`.

12. **Tabs component already installed**: `@/components/ui/tabs` was added in Story 2.3. Do NOT re-run `pnpm dlx shadcn@latest add tabs`.

13. **No `onSuccess` in `useQuery` (TanStack Query v5)**: If you need to react to query data loading, use `useEffect(() => { if (data) {...} }, [data])` or derive state directly (`const initialValues = data ?? defaultValues`). Confirmed pattern from Story 2.3 code review.

14. **`getCompetition` already exists**: Added in Story 2.3 code review. It returns `{ id, name, status, participantFormat }`. This story extends it to also return the 5 judge config fields. All 5 new fields will be `null` until `setJudgeConfig` is called — handle null in the form by using empty string or `undefined` for number inputs.

15. **`listParticipants` for count**: Calling `listParticipants` in `JudgeGroupsManager` is acceptable for MVP. The query is already RLS-protected and returns an array — use `.length`. Do NOT create a separate count-only procedure for this story.

16. **Integer columns in Drizzle**: Use `integer` from `'drizzle-orm/pg-core'`. Already used in other schemas. For nullable integers: do NOT add `.notNull()` — Drizzle treats absence of `.notNull()` as nullable.

17. **Drizzle UPDATE with nullable enum**: Setting a nullable enum column works with `tieBreakingRule: input.tieBreakingRule`. The Drizzle type will be `'re_vote' | 'organizer_decision' | null`. The Zod schema requires it (non-optional), so it will always be set on save.

18. **Cross-field Zod validation order**: The `.refine()` call must come AFTER the `.object()` definition. If using `setJudgeConfigSchema.parse(...)`, the cross-field error will have `path: ['cypherGroupCount']`.

19. **Form initialization from server data**: Use a `useEffect` that fires when `getCompetition` data loads to initialize form state. Pattern:

    ```typescript
    useEffect(() => {
      if (comp) {
        setCypherJudgeCount(comp.cypherJudgeCount ?? 0);
        // etc.
      }
    }, [comp?.id]); // only re-init when competition changes, not on every re-render
    ```

    Or use a controlled form with `defaultValues` approach where the form only initializes once.

20. **Number input parsing**: HTML `<input type="number">` returns strings via `e.target.value`. Parse with `parseInt(e.target.value, 10)` and handle `NaN` by keeping previous value or setting 0.

21. **`integer` type in Drizzle already imported?**: Check `competitions.ts` imports. If `integer` is not currently imported from `'drizzle-orm/pg-core'`, add it. Current import: `import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'` — you need to add `integer` to this import.

22. **Ownership verification for update**: The `setJudgeConfig` mutation must verify competition ownership before updating. Use the same pattern as `setParticipantFormat`: SELECT competitions where id = competitionId (RLS filters to organizer's competitions only), throw NOT_FOUND if missing, then UPDATE.

### Architecture Compliance

- **Module boundary**: All judge config procedures belong in `tournament.router.ts`. Architecture data boundary: `tournament` module owns `competitions`.
- **RLS enforcement**: Every DB operation sets `session.current_organizer_id` via SET LOCAL. RLS on `competitions` table already enforces tenant isolation — the 5 new nullable columns are covered by the existing policy.
- **Error handling**: `TRPCError({ code: 'NOT_FOUND' })` for missing competition. Client-side: show `setJudgeConfig.error?.message` inline below the form.
- **No separate judge_config table**: All 5 fields go directly on `competitions` (nullable) — this is the MVP approach and avoids a join for the common case of reading competition config.
- **Shared types in `packages/shared`**: `JudgeConfig` interface and `TieBreakingRule` type in `judge-config.types.ts`, Zod schema in `judge-config.schema.ts`.

### DB Schema Changes (competitions.ts)

```typescript
// packages/db/schema/competitions.ts — full updated file
import { pgTable, text, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const competitionStatusEnum = pgEnum('competition_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);

export const participantFormatEnum = pgEnum('participant_format', ['individual', 'pairs']);

export const tieBreakingRuleEnum = pgEnum('tie_breaking_rule', ['re_vote', 'organizer_decision']);

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
  // Judge config (nullable until configured via setJudgeConfig)
  cypherJudgeCount: integer('cypher_judge_count'),
  cypherGroupCount: integer('cypher_group_count'),
  advancementThreshold: integer('advancement_threshold'),
  battlesJudgeCount: integer('battles_judge_count'),
  tieBreakingRule: tieBreakingRuleEnum('tie_breaking_rule'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompetitionRow = typeof competitions.$inferSelect;
export type NewCompetitionRow = typeof competitions.$inferInsert;
```

### Migration SQL (0005)

```sql
-- packages/db/migrations/0005_add_judge_config.sql

-- 1. Create tie_breaking_rule enum type
CREATE TYPE tie_breaking_rule AS ENUM ('re_vote', 'organizer_decision');

-- 2. Add judge config columns to competitions (all nullable — not required until phase starts)
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS cypher_judge_count integer,
  ADD COLUMN IF NOT EXISTS cypher_group_count integer,
  ADD COLUMN IF NOT EXISTS advancement_threshold integer,
  ADD COLUMN IF NOT EXISTS battles_judge_count integer,
  ADD COLUMN IF NOT EXISTS tie_breaking_rule tie_breaking_rule;

-- No RLS changes needed — existing competitions_organizer_isolation policy
-- already covers all columns on the competitions table.
```

### Shared Types Detail

```typescript
// packages/shared/types/judge-config.types.ts
export type TieBreakingRule = 're_vote' | 'organizer_decision';

export interface JudgeConfig {
  cypherJudgeCount: number;
  cypherGroupCount: number;
  advancementThreshold: number;
  battlesJudgeCount: number;
  tieBreakingRule: TieBreakingRule;
}

export interface JudgeConfigPartial {
  cypherJudgeCount: number | null;
  cypherGroupCount: number | null;
  advancementThreshold: number | null;
  battlesJudgeCount: number | null;
  tieBreakingRule: TieBreakingRule | null;
}
```

### Validation Schema Detail

```typescript
// packages/shared/validation/judge-config.schema.ts
import { z } from 'zod';

export const setJudgeConfigSchema = z
  .object({
    competitionId: z.string().min(1),
    cypherJudgeCount: z
      .number()
      .int('Must be a whole number')
      .min(1, 'Must have at least 1 judge')
      .max(100, 'Maximum 100 judges'),
    cypherGroupCount: z
      .number()
      .int('Must be a whole number')
      .min(1, 'Must have at least 1 group')
      .max(50, 'Maximum 50 groups'),
    advancementThreshold: z
      .number()
      .int('Must be a whole number')
      .min(1, 'At least 1 participant must advance'),
    battlesJudgeCount: z
      .number()
      .int('Must be a whole number')
      .min(1, 'Must have at least 1 battles judge')
      .max(100, 'Maximum 100 judges'),
    tieBreakingRule: z.enum(['re_vote', 'organizer_decision']),
  })
  .refine((d) => d.cypherGroupCount <= d.cypherJudgeCount, {
    message: 'Number of groups cannot exceed total judge count',
    path: ['cypherGroupCount'],
  });

export type SetJudgeConfigInput = z.infer<typeof setJudgeConfigSchema>;
```

### tRPC Procedures — Implementation Sketch

**Imports to add at the top of `tournament.router.ts`:**

```typescript
import { setJudgeConfigSchema } from '@competition-platform/shared';
```

**Updated `getCompetition` select** (replace current select shape):

```typescript
getCompetition: protectedProcedure
  .input(z.object({ competitionId: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      const [comp] = await tx
        .select({
          id: competitions.id,
          name: competitions.name,
          status: competitions.status,
          participantFormat: competitions.participantFormat,
          // Judge config fields (nullable)
          cypherJudgeCount: competitions.cypherJudgeCount,
          cypherGroupCount: competitions.cypherGroupCount,
          advancementThreshold: competitions.advancementThreshold,
          battlesJudgeCount: competitions.battlesJudgeCount,
          tieBreakingRule: competitions.tieBreakingRule,
        })
        .from(competitions)
        .where(eq(competitions.id, input.competitionId));
      if (!comp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competition not found' });
      }
      return comp;
    });
  }),
```

**New `setJudgeConfig` procedure** (add after `setParticipantFormat`):

```typescript
setJudgeConfig: protectedProcedure
  .input(setJudgeConfigSchema)
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
        .set({
          cypherJudgeCount: input.cypherJudgeCount,
          cypherGroupCount: input.cypherGroupCount,
          advancementThreshold: input.advancementThreshold,
          battlesJudgeCount: input.battlesJudgeCount,
          tieBreakingRule: input.tieBreakingRule,
        })
        .where(eq(competitions.id, input.competitionId))
        .returning({
          id: competitions.id,
          cypherJudgeCount: competitions.cypherJudgeCount,
          cypherGroupCount: competitions.cypherGroupCount,
          advancementThreshold: competitions.advancementThreshold,
          battlesJudgeCount: competitions.battlesJudgeCount,
          tieBreakingRule: competitions.tieBreakingRule,
        });
      return updated;
    });
  }),
```

### Frontend Component — JudgeGroupsManager Structure

```tsx
// apps/web/src/components/admin/judge-groups-manager.tsx
'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JudgeGroupsManagerProps {
  competitionId: string;
}

export function JudgeGroupsManager({ competitionId }: JudgeGroupsManagerProps) {
  const { data: comp, isLoading: compLoading } = trpc.tournament.getCompetition.useQuery({
    competitionId,
  });
  const { data: participants } = trpc.tournament.listParticipants.useQuery({ competitionId });
  const utils = trpc.useUtils();

  const participantCount = participants?.length ?? 0;

  // Form state
  const [cypherJudgeCount, setCypherJudgeCount] = useState<number | ''>('');
  const [cypherGroupCount, setCypherGroupCount] = useState<number | ''>('');
  const [advancementThreshold, setAdvancementThreshold] = useState<number | ''>('');
  const [battlesJudgeCount, setBattlesJudgeCount] = useState<number | ''>('');
  const [tieBreakingRule, setTieBreakingRule] = useState<'re_vote' | 'organizer_decision'>(
    're_vote',
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Prefill form from existing competition config
  useEffect(() => {
    if (comp) {
      setCypherJudgeCount(comp.cypherJudgeCount ?? '');
      setCypherGroupCount(comp.cypherGroupCount ?? '');
      setAdvancementThreshold(comp.advancementThreshold ?? '');
      setBattlesJudgeCount(comp.battlesJudgeCount ?? '');
      if (comp.tieBreakingRule) setTieBreakingRule(comp.tieBreakingRule);
    }
  }, [comp?.id]); // only re-init when competition identity changes

  const mutation = trpc.tournament.setJudgeConfig.useMutation({
    onSuccess: () => {
      utils.tournament.getCompetition.invalidate({ competitionId });
      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });

  // Live preview calculation
  const validJudges = typeof cypherJudgeCount === 'number' && cypherJudgeCount > 0;
  const validGroups = typeof cypherGroupCount === 'number' && cypherGroupCount > 0;
  const validConfig = validJudges && validGroups && cypherGroupCount <= cypherJudgeCount;
  const judgesPerGroup = validConfig ? Math.floor(cypherJudgeCount / cypherGroupCount) : 0;
  const participantsPerGroup =
    validConfig && participantCount > 0 ? Math.ceil(participantCount / cypherGroupCount) : null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (
      typeof cypherJudgeCount !== 'number' ||
      typeof cypherGroupCount !== 'number' ||
      typeof advancementThreshold !== 'number' ||
      typeof battlesJudgeCount !== 'number'
    ) {
      setSaveError('All fields are required');
      return;
    }
    mutation.mutate({
      competitionId,
      cypherJudgeCount,
      cypherGroupCount,
      advancementThreshold,
      battlesJudgeCount,
      tieBreakingRule,
    });
  };

  const parseIntField = (val: string): number | '' => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? '' : parsed;
  };

  if (compLoading) {
    return <p className="text-muted-foreground text-sm">Loading configuration...</p>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Cypher Phase Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cypher Phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cypherJudgeCount">Total Judges</Label>
              <Input
                id="cypherJudgeCount"
                type="number"
                min={1}
                max={100}
                value={cypherJudgeCount}
                onChange={(e) => setCypherJudgeCount(parseIntField(e.target.value))}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cypherGroupCount">Number of Groups</Label>
              <Input
                id="cypherGroupCount"
                type="number"
                min={1}
                max={50}
                value={cypherGroupCount}
                onChange={(e) => setCypherGroupCount(parseIntField(e.target.value))}
                disabled={mutation.isPending}
              />
            </div>
          </div>
          {/* Live preview */}
          {validConfig && (
            <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded">
              {cypherGroupCount} group(s) of {judgesPerGroup} judge(s)
              {participantsPerGroup !== null
                ? ` — each judge evaluates ~${participantsPerGroup} participants`
                : participantCount === 0
                  ? ' — add participants to see distribution preview'
                  : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Advancement Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advancement to Battles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="advancementThreshold">Top N Participants Advance</Label>
          <Input
            id="advancementThreshold"
            type="number"
            min={1}
            value={advancementThreshold}
            onChange={(e) => setAdvancementThreshold(parseIntField(e.target.value))}
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            The top N participants by Cypher score advance to the Battles bracket.
          </p>
        </CardContent>
      </Card>

      {/* Battles Phase Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Battles Phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="battlesJudgeCount">Total Judges (Battles)</Label>
            <Input
              id="battlesJudgeCount"
              type="number"
              min={1}
              max={100}
              value={battlesJudgeCount}
              onChange={(e) => setBattlesJudgeCount(parseIntField(e.target.value))}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Configured independently from Cypher judges (FR8).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tieBreakingRule">Tie-breaking Rule</Label>
            <select
              id="tieBreakingRule"
              value={tieBreakingRule}
              onChange={(e) =>
                setTieBreakingRule(e.target.value as 're_vote' | 'organizer_decision')
              }
              disabled={mutation.isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="re_vote">Re-vote (judges vote again)</option>
              <option value="organizer_decision">
                Organizer Decision (organizer picks winner)
              </option>
            </select>
          </div>
        </CardContent>
      </Card>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save Configuration'}
      </Button>
    </form>
  );
}
```

### Updated `[id]/page.tsx`

```tsx
// apps/web/src/app/(admin)/competitions/[id]/page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CriteriaManager } from '@/components/admin/criteria-manager';
import { ParticipantsManager } from '@/components/admin/participants-manager';
import { JudgeGroupsManager } from '@/components/admin/judge-groups-manager';

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
          <TabsTrigger value="judge-groups">Judge Groups</TabsTrigger>
        </TabsList>
        <TabsContent value="criteria">
          <CriteriaManager competitionId={id} />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsManager competitionId={id} />
        </TabsContent>
        <TabsContent value="judge-groups">
          <JudgeGroupsManager competitionId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Testing Standards

- Primary CI gate: `pnpm exec turbo run lint typecheck test build`
- No live DB in CI — do NOT run migrations in tests
- Co-located test file: `tournament.router.spec.ts` (already exists from Stories 2.1–2.3)
- All new tests use the existing `mockDb` and `caller()` helpers — no DB reached in Zod/auth tests

```typescript
describe('tournament.setJudgeConfig', () => {
  it('rejects cypherJudgeCount of 0', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 0,
        cypherGroupCount: 1,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects cypherGroupCount greater than cypherJudgeCount', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 3,
        cypherGroupCount: 5, // 5 > 3, invalid
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects advancementThreshold of 0', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 0,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects invalid tieBreakingRule value', async () => {
    await expect(
      caller('user_123').tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 'coin_flip' as any,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.setJudgeConfig({
        competitionId: 'comp_abc',
        cypherJudgeCount: 9,
        cypherGroupCount: 3,
        advancementThreshold: 8,
        battlesJudgeCount: 3,
        tieBreakingRule: 're_vote',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
```

### Project Structure — Files to Create/Modify

**New files:**

```
packages/db/migrations/0005_add_judge_config.sql
packages/shared/types/judge-config.types.ts
packages/shared/validation/judge-config.schema.ts
apps/web/src/components/admin/judge-groups-manager.tsx
```

**Modified files:**

```
packages/db/schema/competitions.ts              — add tieBreakingRuleEnum + 5 new nullable columns + integer import
packages/db/schema/index.ts                     — add export for tieBreakingRuleEnum (via competitions.ts re-export)
packages/shared/index.ts                        — add exports for judge-config.types + judge-config.schema
apps/api/src/trpc/routers/tournament.router.ts  — add setJudgeConfigSchema import + setJudgeConfig procedure + update getCompetition select
apps/api/src/trpc/routers/tournament.router.spec.ts — add 5 judge config test cases
apps/web/src/app/(admin)/competitions/[id]/page.tsx — add JudgeGroupsManager import + 3rd tab
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.4]
- [Source: _bmad-output/planning-artifacts/epics.md#FR5 — Judge count and group division configuration]
- [Source: _bmad-output/planning-artifacts/epics.md#FR7 — Advancement threshold top N]
- [Source: _bmad-output/planning-artifacts/epics.md#FR8 — Battles judge count independent from Cypher]
- [Source: _bmad-output/planning-artifacts/epics.md#FR9 — Tie-breaking rules (re-vote or organizer decision)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries — tournament module owns competitions]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #5 — Zod for all input validation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns — snake_case DB, camelCase Drizzle exports]
- [Source: _bmad-output/implementation-artifacts/2-2-define-cypher-evaluation-criteria.md#Dev Notes — Critical gotchas]
- [Source: _bmad-output/implementation-artifacts/2-3-register-participants.md#Dev Notes — Critical gotchas]
- [Source: _bmad-output/implementation-artifacts/2-3-register-participants.md#Code Review Fixes — TOCTOU, auth tests, onError handlers, getCompetition procedure]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Lint failure on initial `JudgeGroupsManager`: `react-hooks/set-state-in-effect` (eslint-plugin-react-hooks@7.0.1) fired on `useEffect` form-init pattern. Fixed by splitting into `JudgeGroupsManager` (loader) + `JudgeGroupsForm` (inner form initialized from props via `useState` initial value + `key={comp.id}`). This avoids `useEffect` state setting entirely.

### Completion Notes List

- Added `tieBreakingRuleEnum` + 5 nullable integer/enum columns to `competitions` table in Drizzle schema and migration `0005_add_judge_config.sql`. No new RLS policy needed — existing policy covers all columns.
- Created shared types (`JudgeConfig`, `JudgeConfigPartial`, `TieBreakingRule`) and Zod schema (`setJudgeConfigSchema`) with cross-field refinement ensuring `cypherGroupCount <= cypherJudgeCount`.
- Extended `getCompetition` tRPC procedure to return 5 judge config fields (all nullable until `setJudgeConfig` is called).
- Added `setJudgeConfig` tRPC mutation with RLS transaction, ownership verification, and `.returning()` of updated fields.
- `JudgeGroupsManager` component uses split-component pattern (loader + inner form) to satisfy `react-hooks/set-state-in-effect` lint rule from eslint-plugin-react-hooks@7.0.1. Inner form `JudgeGroupsForm` initializes state from `comp` prop in `useState` initial values; `key={comp.id}` resets it if competition identity changes.
- Live preview computes `judgesPerGroup` and `participantsPerGroup` derived values synchronously — no effects.
- Added "Judge Groups" as third tab in `/competitions/[id]/page.tsx`.
- 5 new `setJudgeConfig` test cases added: invalid `cypherJudgeCount`, cross-field `cypherGroupCount > cypherJudgeCount`, invalid `advancementThreshold`, invalid `tieBreakingRule`, and UNAUTHORIZED. All 32 tests pass.
- Full CI pipeline passes: lint, typecheck, test (32), build.

### File List

**New files:**

- packages/db/migrations/0005_add_judge_config.sql
- packages/shared/types/judge-config.types.ts
- packages/shared/validation/judge-config.schema.ts
- apps/web/src/components/admin/judge-groups-manager.tsx

**Modified files:**

- packages/db/schema/competitions.ts
- packages/shared/index.ts
- apps/api/src/trpc/routers/tournament.router.ts
- apps/api/src/trpc/routers/tournament.router.spec.ts
- apps/web/src/app/(admin)/competitions/[id]/page.tsx
- \_bmad-output/implementation-artifacts/sprint-status.yaml
- \_bmad-output/implementation-artifacts/2-4-configure-judge-groups-and-advancement-rules.md

## Change Log

- 2026-04-22: Story 2.4 implemented — judge group configuration, advancement threshold, tie-breaking rule. Added `tieBreakingRuleEnum` + 5 nullable columns to `competitions`, migration `0005`, shared types + Zod schema, `setJudgeConfig` tRPC procedure, `getCompetition` extended, `JudgeGroupsManager` React component with live preview, third tab on competition config page. 5 new tests added (32 total passing).

### Code Review Fixes (Adversarial Review)

- [M1] Added `updatedAt: new Date()` to `setJudgeConfig` mutation `.set()` — previously the `competitions.updatedAt` column was not updated when saving judge config, leaving it at the original creation timestamp
- [M2] Added `tournament.getCompetition` auth test — null userId now verified to throw UNAUTHORIZED. Gap inherited from Story 2.3 when procedure was created, now covered
- [M3] Added `battlesJudgeCount: 0` rejection test — completes symmetric coverage for all `min(1)` Zod validations across all integer config fields
- All fixes pass CI: lint, typecheck, 34 tests (28 in router spec, up from 27), build — 11/11 turbo tasks green
