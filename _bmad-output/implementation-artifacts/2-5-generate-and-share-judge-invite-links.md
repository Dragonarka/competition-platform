# Story 2.5: Generate & Share Judge Invite Links

Status: done

## Story

As an organizer,
I want to generate cryptographically secure judge invite links for my competition,
so that judges can access the scoring interface instantly via WhatsApp without creating an account.

## Acceptance Criteria

1. Given I am on the competition configuration screen, when I click "Generate Judge Links" and specify a count, then judge invite links are created with cryptographically random tokens (256-bit entropy via `crypto.randomBytes`) scoped to this competition, and the raw URLs are displayed once for copying (FR58, FR59).

2. Given judge links have been generated, when the organizer returns to the Judge Links tab, then previously generated links are listed with their labels ("Judge 1", "Judge 2", etc.) and revoke buttons — raw tokens are never shown again after the one-time reveal.

3. Given a judge token is validated on the server, when the token is not found in the database, then `validateJudgeToken` throws `NOT_FOUND` and the judge sees a "Link Not Valid" error page — they cannot access any competition data.

4. Given a judge opens their invite link at `/judge/{token}`, when the token is valid, then they see the competition name and their judge label — no competition management, no other judges' data, no admin controls (FR60).

5. And judge tokens are stored as SHA-256 hashes in the `token_hash` column — the raw token is never stored in the database (NFR14).

## Tasks / Subtasks

- [x] Task 1: DB schema — implement `judge_sessions` table (AC: #1, #5)
  - [x] Implement `packages/db/schema/judge-sessions.ts` (currently `export {};` — overwrite completely)
    - Import: `pgTable, text, timestamp` from `'drizzle-orm/pg-core'`; `nanoid` from `'nanoid'`
    - Define `judgeSessions = pgTable('judge_sessions', {...})` — see "DB Schema Detail" in Dev Notes
    - Export `JudgeSessionRow` and `NewJudgeSessionRow` types
  - [x] `packages/db/schema/index.ts` already has `export * from './judge-sessions'` ✅ no change needed
  - [x] Create `packages/db/migrations/0006_add_judge_sessions.sql` — see "Migration SQL" in Dev Notes

- [x] Task 2: Shared types and validation schemas (AC: #1, #3, #5)
  - [x] Create `packages/shared/types/judge-session.types.ts`
    - `JudgeLinkCreated` interface (with raw token — only at creation)
    - `JudgeLinkSummary` interface (no token — for listing)
  - [x] Create `packages/shared/validation/judge-session.schema.ts`
    - `generateJudgeLinksSchema`: `competitionId: string`, `count: int min(1) max(50)`
    - `validateJudgeTokenSchema`: `token: string.min(1)`
  - [x] Add exports to `packages/shared/index.ts`

- [x] Task 3: tRPC procedures in `tournament.router.ts` (AC: #1, #2, #3, #4)
  - [x] Add `import { createHash, randomBytes } from 'node:crypto'` at top of router file
  - [x] Add `judgeSessions` to import from `'@competition-platform/db'`
  - [x] Add `generateJudgeLinksSchema, validateJudgeTokenSchema` to import from `'@competition-platform/shared'`
  - [x] Add `generateJudgeLinks` protectedProcedure (generates N tokens, hashes, stores, returns raw tokens ONCE)
  - [x] Add `listJudgeLinks` protectedProcedure (returns id/label/createdAt — NEVER tokenHash or raw token)
  - [x] Add `revokeJudgeLink` protectedProcedure (deletes by id, verifies ownership via competitions join)
  - [x] Add `validateJudgeToken` **public** procedure using `t.procedure` (no auth, hashes input, looks up by hash)
  - [x] See "tRPC Procedures" section for complete implementation sketches

- [x] Task 4: Frontend — JudgeLinksManager component (AC: #1, #2)
  - [x] Create `apps/web/src/components/admin/judge-links-manager.tsx` (client component)
    - `trpc.tournament.listJudgeLinks.useQuery({ competitionId })` — existing links list
    - `trpc.tournament.generateJudgeLinks.useMutation()` — generates new links
    - `trpc.tournament.revokeJudgeLink.useMutation()` — revokes a link
    - One-time reveal card for newly generated tokens (copy-to-clipboard, "save now" warning)
    - Generate form with count input (default: 3)
    - Existing links list with label + created date + Revoke button
  - [x] Update `apps/web/src/app/(admin)/competitions/[id]/page.tsx`:
    - Add `import { JudgeLinksManager } from '@/components/admin/judge-links-manager'`
    - Add 4th tab: `<TabsTrigger value="judge-links">Judge Links</TabsTrigger>`
    - Add 4th content: `<TabsContent value="judge-links"><JudgeLinksManager competitionId={id} /></TabsContent>`

- [x] Task 5: Judge landing page stub (AC: #3, #4)
  - [x] Implement `apps/web/src/app/(judge)/judge/[token]/page.tsx` as client component
    - Use `useParams<{ token: string }>()` from `'next/navigation'`
    - Call `trpc.tournament.validateJudgeToken.useQuery({ token }, { retry: false })`
    - Loading state → Valid state (competition name + judge label) → Invalid state ("Link Not Valid")
    - No admin controls, no scoring UI (full scoring interface deferred to Story 3.3)
    - See "Judge Landing Page" section for implementation

- [x] Task 6: Tests (AC: #1, #3)
  - [x] Add 5 tests to `apps/api/src/trpc/routers/tournament.router.spec.ts`
  - [x] See "Testing" section for full test implementations

- [x] Task 7: Verify CI
  - [x] Run `pnpm exec turbo run lint typecheck test build` — all tasks pass

## Dev Notes

### CRITICAL — All Gotchas from Stories 2.1–2.4 (MUST READ)

All 22 gotchas from Story 2.4 apply. Key ones most relevant to this story:

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy at `apps/web/src/proxy.ts`. Never create `middleware.ts`.
2. **`reflect-metadata` in Vitest**: Already configured in `apps/api/vitest.config.ts`. Never import manually in spec files.
3. **Factory router pattern**: `createTournamentRouter(db: DatabaseService)`. Import `t` from `'../trpc.init'`.
4. **RLS transaction CRITICAL**: Every `protectedProcedure` uses `SET LOCAL`. The new `validateJudgeToken` is a **public procedure** (`t.procedure`) — it does NOT use RLS and has no organizer context.
5. **`protectedProcedure` from `'../trpc.procedures'`**; `t.procedure` (the base public procedure) from `'../trpc.init'`.
6. **shadcn/ui Button `asChild` pattern**: Does NOT work — use `buttonVariants()` on `<Link>` for link-as-button.
7. **Next.js 16 async params in server components**: `await params`. Client components: use `useParams()` hook instead.
8. **No `onSuccess` in TanStack Query v5**: Use `useEffect` or derive state directly.
9. **Tabs already installed**: `@/components/ui/tabs` available. Do NOT re-run `shadcn add tabs`.
10. **ESLint hook lint rule**: If using `useEffect` for state init, the `react-hooks/set-state-in-effect` rule (eslint-plugin-react-hooks@7.0.1) may fire. Use the split component pattern (loader + inner form) as done in `JudgeGroupsManager` if needed.

### New Gotchas for This Story

11. **Use Node.js `crypto` built-in — zero new dependencies**:

    ```typescript
    import { createHash, randomBytes } from 'node:crypto';
    ```

    Available in Node.js 18+ (already required by this project). Do NOT add `nanoid` or any hashing library to apps/api.

12. **Token generation pattern** (put in router file):

    ```typescript
    function generateJudgeToken() {
      const raw = randomBytes(32).toString('hex'); // 64-char hex, 256-bit entropy
      const hash = createHash('sha256').update(raw).digest('hex');
      return { raw, hash };
    }
    ```

13. **Raw tokens returned ONCE only**: `generateJudgeLinks` returns raw tokens in the mutation response. `listJudgeLinks` returns ONLY `{ id, label, createdAt }` — never `tokenHash` or raw token. Make this explicit in the select shape.

14. **Label assignment**: Count existing judge_sessions before inserting to determine label numbers:

    ```typescript
    const existing = await tx
      .select({ id: judgeSessions.id })
      .from(judgeSessions)
      .where(eq(judgeSessions.competitionId, input.competitionId));
    const startLabel = existing.length + 1;
    // Generates: "Judge 1", "Judge 2", etc.
    ```

15. **`revokeJudgeLink` raw SQL ownership check** (same pattern as `removeParticipant`):

    ```typescript
    sql`DELETE FROM judge_sessions
        WHERE id = ${input.judgeSessionId}
          AND competition_id IN (
            SELECT id FROM competitions WHERE organizer_clerk_id = ${ctx.userId}
          )
        RETURNING id`;
    ```

16. **`validateJudgeToken` is public — no RLS, no transaction**:

    ```typescript
    validateJudgeToken: t.procedure.input(validateJudgeTokenSchema).query(async ({ input }) => {
      const hash = createHash('sha256').update(input.token).digest('hex');
      const [session] = await db.db
        .select({
          id: judgeSessions.id,
          competitionId: judgeSessions.competitionId,
          label: judgeSessions.label,
        })
        .from(judgeSessions)
        .where(eq(judgeSessions.tokenHash, hash));
      // ...
    });
    ```

    `ctx.userId` is null here — do NOT use it. No `db.db.transaction()` needed. Direct `db.db.select()`.

17. **One-time reveal UX requirement**: The `JudgeLinksManager` must show a prominent card after generation with all URLs and copy buttons + warning: "These links can only be seen now. Copy them before leaving this page." The `generatedLinks` state should be cleared only when the user navigates away or generates new links (not automatically).

18. **URL format**: Frontend constructs URL from raw token:

    ```typescript
    const url = `${window.location.origin}/judge/${link.token}`;
    ```

    Route exists at `apps/web/src/app/(judge)/judge/[token]/page.tsx`.

19. **Judge landing page uses `useParams()` NOT props-based params**: Since it's a client component, use `useParams<{ token: string }>()` from `'next/navigation'`. Do NOT declare `params: Promise<...>` prop.

20. **`apps/web/AGENTS.md` warning**: This Next.js version has breaking changes. Before writing any Next.js code, check: `node_modules/next/dist/docs/`. The existing patterns in `apps/web` are the authoritative reference.

21. **Judge session DB schema has NO RLS policy**: judge_sessions are not organizer-tenant-scoped. Ownership is verified in protected procedures by joining through `competitions` (which IS RLS-protected via SET LOCAL). `validateJudgeToken` is intentionally unscoped — any valid token from any organizer is a valid judge link.

22. **`nanoid` in schema vs `crypto` in router**: The `judgeSessions` schema uses `$defaultFn(() => nanoid(21))` for the `id` column — this runs automatically at insert time. The tRPC router generates the raw token using `crypto.randomBytes`, not nanoid. These are different: nanoid for DB row IDs, crypto.randomBytes for the judge access token.

### DB Schema Detail

```typescript
// packages/db/schema/judge-sessions.ts — FULL REPLACEMENT (file currently has export {};)
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const judgeSessions = pgTable('judge_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(21)),
  competitionId: text('competition_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JudgeSessionRow = typeof judgeSessions.$inferSelect;
export type NewJudgeSessionRow = typeof judgeSessions.$inferInsert;
```

Note: No Drizzle-level FK for `competitionId` (consistent with how `evaluationCriteria.competitionId` is defined — check `packages/db/schema/evaluation-criteria.ts`). The SQL migration has the FK constraint.

### Migration SQL

```sql
-- packages/db/migrations/0006_add_judge_sessions.sql

CREATE TABLE IF NOT EXISTS judge_sessions (
  id text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judge_sessions_competition_id
  ON judge_sessions(competition_id);

CREATE INDEX IF NOT EXISTS idx_judge_sessions_token_hash
  ON judge_sessions(token_hash);

-- No RLS policy needed:
-- Protected procedures verify ownership by joining through competitions table (which has RLS).
-- validateJudgeToken is a public procedure: intentionally unscoped.
```

### Shared Types Detail

```typescript
// packages/shared/types/judge-session.types.ts
export interface JudgeLinkCreated {
  id: string;
  label: string;
  token: string; // raw token — ONLY returned at creation, never recoverable
  createdAt: string; // ISO 8601
}

export interface JudgeLinkSummary {
  id: string;
  label: string;
  createdAt: string; // ISO 8601
  // tokenHash and raw token intentionally absent
}
```

### Shared Validation Schema Detail

```typescript
// packages/shared/validation/judge-session.schema.ts
import { z } from 'zod';

export const generateJudgeLinksSchema = z.object({
  competitionId: z.string().min(1),
  count: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Must generate at least 1 link')
    .max(50, 'Maximum 50 links at once'),
});
export type GenerateJudgeLinksInput = z.infer<typeof generateJudgeLinksSchema>;

export const validateJudgeTokenSchema = z.object({
  token: z.string().min(1),
});
export type ValidateJudgeTokenInput = z.infer<typeof validateJudgeTokenSchema>;
```

### tRPC Procedures — Implementation Sketches

**New imports for `tournament.router.ts` (add to existing imports):**

```typescript
import { createHash, randomBytes } from 'node:crypto';
import {
  competitions,
  evaluationCriteria,
  competitors,
  judgeSessions, // ADD THIS
} from '@competition-platform/db';
import {
  // ...existing imports...
  generateJudgeLinksSchema,
  validateJudgeTokenSchema,
} from '@competition-platform/shared';
```

**Helper function (add before `createTournamentRouter`):**

```typescript
function generateJudgeToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}
```

**`generateJudgeLinks` procedure:**

```typescript
generateJudgeLinks: protectedProcedure
  .input(generateJudgeLinksSchema)
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
      const existing = await tx
        .select({ id: judgeSessions.id })
        .from(judgeSessions)
        .where(eq(judgeSessions.competitionId, input.competitionId));
      const startLabel = existing.length + 1;
      const links: { id: string; label: string; token: string; createdAt: string }[] = [];
      for (let i = 0; i < input.count; i++) {
        const { raw, hash } = generateJudgeToken();
        const label = `Judge ${startLabel + i}`;
        const [inserted] = await tx
          .insert(judgeSessions)
          .values({
            competitionId: input.competitionId,
            tokenHash: hash,
            label,
            createdBy: ctx.userId,
          })
          .returning({
            id: judgeSessions.id,
            label: judgeSessions.label,
            createdAt: judgeSessions.createdAt,
          });
        links.push({
          id: inserted.id,
          label: inserted.label,
          token: raw,
          createdAt: inserted.createdAt.toISOString(),
        });
      }
      return links;
    });
  }),
```

**`listJudgeLinks` procedure:**

```typescript
listJudgeLinks: protectedProcedure
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
        .select({
          id: judgeSessions.id,
          label: judgeSessions.label,
          createdAt: judgeSessions.createdAt,
          // NEVER include tokenHash
        })
        .from(judgeSessions)
        .where(eq(judgeSessions.competitionId, input.competitionId))
        .orderBy(asc(judgeSessions.createdAt));
    });
  }),
```

**`revokeJudgeLink` procedure:**

```typescript
revokeJudgeLink: protectedProcedure
  .input(z.object({ judgeSessionId: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    return db.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
      const result = await tx.execute(
        sql`DELETE FROM judge_sessions
            WHERE id = ${input.judgeSessionId}
              AND competition_id IN (
                SELECT id FROM competitions WHERE organizer_clerk_id = ${ctx.userId}
              )
            RETURNING id`,
      );
      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge link not found' });
      }
    });
  }),
```

**`validateJudgeToken` procedure (PUBLIC — no auth, no RLS):**

```typescript
validateJudgeToken: t.procedure
  .input(validateJudgeTokenSchema)
  .query(async ({ input }) => {
    const hash = createHash('sha256').update(input.token).digest('hex');
    const [session] = await db.db
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
    const [comp] = await db.db
      .select({ id: competitions.id, name: competitions.name, status: competitions.status })
      .from(competitions)
      .where(eq(competitions.id, session.competitionId));
    if (!comp) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Link not valid' });
    }
    return {
      judgeSessionId: session.id,
      label: session.label,
      competitionId: comp.id,
      competitionName: comp.name,
      competitionStatus: comp.status,
    };
  }),
```

### Frontend Component — JudgeLinksManager

```tsx
// apps/web/src/components/admin/judge-links-manager.tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GeneratedLink {
  id: string;
  label: string;
  token: string;
  url: string;
}

export function JudgeLinksManager({ competitionId }: { competitionId: string }) {
  const { data: links, isLoading } = trpc.tournament.listJudgeLinks.useQuery({ competitionId });
  const utils = trpc.useUtils();
  const [count, setCount] = useState<number | ''>(3);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateMutation = trpc.tournament.generateJudgeLinks.useMutation({
    onSuccess: (data) => {
      const base = window.location.origin;
      setGeneratedLinks(
        data.map((l) => ({
          id: l.id,
          label: l.label,
          token: l.token,
          url: `${base}/judge/${l.token}`,
        })),
      );
      utils.tournament.listJudgeLinks.invalidate({ competitionId });
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const revokeMutation = trpc.tournament.revokeJudgeLink.useMutation({
    onSuccess: () => utils.tournament.listJudgeLinks.invalidate({ competitionId }),
    onError: (err) => setError(err.message),
  });

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof count !== 'number' || count < 1) return;
    setGeneratedLinks(null);
    setError(null);
    generateMutation.mutate({ competitionId, count });
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading judge links...</p>;

  return (
    <div className="space-y-6">
      {/* One-time reveal card */}
      {generatedLinks && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base text-primary">
              New Links Generated — Save These Now
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These links can only be seen once. Copy them before leaving this page.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {generatedLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2">
                <span className="text-sm font-medium w-20 shrink-0">{link.label}</span>
                <code className="flex-1 text-xs bg-muted px-2 py-1 rounded truncate">
                  {link.url}
                </code>
                <Button size="sm" variant="outline" onClick={() => handleCopy(link.id, link.url)}>
                  {copiedId === link.id ? 'Copied ✓' : 'Copy'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Generate form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate New Judge Links</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="linkCount">Number of Links</Label>
              <Input
                id="linkCount"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setCount(isNaN(v) ? '' : v);
                }}
                className="w-24"
                disabled={generateMutation.isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={generateMutation.isPending || typeof count !== 'number'}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate Links'}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Existing links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Judge Links ({links?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!links?.length ? (
            <p className="text-sm text-muted-foreground">No judge links generated yet.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between py-1.5 border-b last:border-0"
                >
                  <span className="text-sm font-medium">{link.label}</span>
                  <span className="text-xs text-muted-foreground mr-auto ml-3">
                    Created {new Date(link.createdAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => revokeMutation.mutate({ judgeSessionId: link.id })}
                    disabled={revokeMutation.isPending}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### Updated `[id]/page.tsx` (4th tab)

```tsx
// apps/web/src/app/(admin)/competitions/[id]/page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CriteriaManager } from '@/components/admin/criteria-manager';
import { ParticipantsManager } from '@/components/admin/participants-manager';
import { JudgeGroupsManager } from '@/components/admin/judge-groups-manager';
import { JudgeLinksManager } from '@/components/admin/judge-links-manager';

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
          <TabsTrigger value="judge-links">Judge Links</TabsTrigger>
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
        <TabsContent value="judge-links">
          <JudgeLinksManager competitionId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Judge Landing Page

```tsx
// apps/web/src/app/(judge)/judge/[token]/page.tsx
// Client component — validates token, shows stub scoring interface
// Full scoring UI implemented in Story 3.3
'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export default function JudgePage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = trpc.tournament.validateJudgeToken.useQuery(
    { token },
    { retry: false }, // Don't retry 404s — invalid link is invalid
  );

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Validating link...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-2xl font-bold">Link Not Valid</h1>
          <p className="text-muted-foreground">
            This judge link is invalid or has been revoked. Contact the organizer for a new link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <h1 className="text-2xl font-bold">Welcome, {data?.label}</h1>
        <p className="text-muted-foreground">
          Competition: <strong>{data?.competitionName}</strong>
        </p>
        <p className="text-sm text-muted-foreground">Waiting for the competition to start.</p>
      </div>
    </main>
  );
}
```

### Testing

```typescript
// Add to apps/api/src/trpc/routers/tournament.router.spec.ts

describe('tournament.generateJudgeLinks', () => {
  it('rejects count of 0', async () => {
    await expect(
      caller('user_123').tournament.generateJudgeLinks({
        competitionId: 'comp_abc',
        count: 0,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('rejects count greater than 50', async () => {
    await expect(
      caller('user_123').tournament.generateJudgeLinks({
        competitionId: 'comp_abc',
        count: 51,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.generateJudgeLinks({
        competitionId: 'comp_abc',
        count: 3,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('tournament.validateJudgeToken', () => {
  it('rejects empty token string (Zod error)', async () => {
    await expect(caller(null).tournament.validateJudgeToken({ token: '' })).rejects.toThrow(
      TRPCError,
    );
  });
});

describe('tournament.listJudgeLinks', () => {
  it('requires auth (null userId)', async () => {
    await expect(
      caller(null).tournament.listJudgeLinks({ competitionId: 'comp_abc' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
```

Expected: 34 existing + 5 new = **39 total tests passing**.

### Project Structure Notes

- `packages/db/schema/judge-sessions.ts` — overwrite current empty stub (the schema/index.ts already exports it)
- `packages/db/schema/index.ts` — **no change needed**, already has `export * from './judge-sessions'`
- Judge route already exists at `apps/web/src/app/(judge)/judge/[token]/page.tsx` — overwrite the stub
- `apps/web/src/app/(judge)/layout.tsx` — no change needed (no auth guard, FR60 requires no account)
- `auth.router.ts` — **no change** in this story; `validateJudgeToken` goes in `tournament.router.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.5]
- [Source: _bmad-output/planning-artifacts/epics.md#FR58 — Judge invite link generation per competition]
- [Source: _bmad-output/planning-artifacts/epics.md#FR59 — Judge link authentication (competition-scoped, no signup)]
- [Source: _bmad-output/planning-artifacts/epics.md#FR60 — RBAC enforcement]
- [Source: _bmad-output/planning-artifacts/epics.md#NFR14 — Judge links are unguessable (cryptographically random tokens)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security — Judge Auth]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries — auth module owns judge_sessions]
- [Source: \_bmad-output/planning-artifacts/architecture.md#Project Structure — (judge)/judge/[token]/]
- [Source: _bmad-output/implementation-artifacts/2-4-configure-judge-groups-and-advancement-rules.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/2-4-configure-judge-groups-and-advancement-rules.md#Dev Agent Record — ESLint hook lint rule pattern]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

None — clean implementation with no blockers.

### Completion Notes List

- Task 1: Implemented `judge_sessions` DB schema with nanoid primary key, SHA-256 token hash (unique), competition FK, label, createdBy, timestamps. Migration includes indexes on competition_id and token_hash.
- Task 2: Created shared types (`JudgeLinkCreated` with raw token, `JudgeLinkSummary` without) and Zod validation schemas (`generateJudgeLinksSchema` with count 1-50, `validateJudgeTokenSchema`). Exported from shared index.
- Task 3: Added 4 tRPC procedures — `generateJudgeLinks` (protected, generates crypto tokens, hashes with SHA-256, stores hashes, returns raw tokens once), `listJudgeLinks` (protected, returns id/label/createdAt only), `revokeJudgeLink` (protected, ownership via competitions join), `validateJudgeToken` (public `t.procedure`, no auth/RLS, hashes input token and looks up session).
- Task 4: Created `JudgeLinksManager` component with one-time reveal card (copy-to-clipboard), generate form (count 1-50), existing links list with revoke. Added 4th "Judge Links" tab to competition config page.
- Task 5: Implemented judge landing page at `/judge/[token]` as client component using `useParams()`. Shows loading → valid (competition name + judge label) → invalid ("Link Not Valid") states.
- Task 6: Added 5 tests — generateJudgeLinks rejects count 0, rejects count >50, requires auth; validateJudgeToken rejects empty string; listJudgeLinks requires auth. Total: 39 passing tests.
- Task 7: Full CI pipeline passes (lint, typecheck, test, build).

### Change Log

- 2026-04-22: Implemented Story 2.5 — judge_sessions schema, 4 tRPC procedures (generate/list/revoke/validate), JudgeLinksManager UI with one-time reveal, judge landing page stub, 5 new tests (39 total passing).
- 2026-04-22: Code review fixes — M1: added revokeJudgeLink auth test; M2: distinguished NOT_FOUND from generic errors on judge landing page; M3: converted sequential for-loop inserts to single batch insert in generateJudgeLinks; L1: added clipboard error feedback; L2: removed unnecessary optional chaining (added data guard instead). CI 11/11 passing.

### File List

**New files:**

- packages/db/migrations/0006_add_judge_sessions.sql
- packages/shared/types/judge-session.types.ts
- packages/shared/validation/judge-session.schema.ts
- apps/web/src/components/admin/judge-links-manager.tsx

**Modified files:**

- packages/db/schema/judge-sessions.ts (implemented schema from empty stub)
- packages/shared/index.ts (added judge-session type and validation exports)
- apps/api/src/trpc/routers/tournament.router.ts (added crypto import, generateJudgeToken helper, 4 new procedures)
- apps/api/src/trpc/routers/tournament.router.spec.ts (added 5 tests for judge link procedures)
- apps/web/src/app/(admin)/competitions/[id]/page.tsx (added 4th Judge Links tab)
- apps/web/src/app/(judge)/judge/[token]/page.tsx (implemented from stub with token validation)
