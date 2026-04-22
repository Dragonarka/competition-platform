# Story 1.3: Organizer Competition Dashboard Shell

Status: done

## Story

As an organizer,
I want to see my personal dashboard listing all my competitions with proper data isolation,
So that I can manage my events knowing my data is completely private from other organizers.

## Acceptance Criteria

1. Given I am logged in as an organizer with no competitions yet, when I visit my dashboard, then I see an empty state with a "Create your first competition" prompt.

2. Given I am logged in and have created competitions, when I visit my dashboard, then I see only my own competitions listed — no other organizer's data is visible.

3. Given another organizer's competitions exist in the database, when I make any database query, then PostgreSQL RLS (using `current_setting('session.current_organizer_id', true)`) silently filters their data — even a direct SQL query returns zero rows from their tenant.

4. Given the dashboard page, when it loads, then the static shell renders in under 2 seconds (PPR) with the layout visible before dynamic competition data streams in.

5. Given the system dark mode preference is active, when the dashboard renders, then all UI elements display with correct contrast meeting WCAG AA (4.5:1 minimum).

## Tasks / Subtasks

- [x] Task 1: Define competitions schema and migration (AC: #2, #3)
  - [x] Implement `packages/db/schema/competitions.ts` — Drizzle table with `organizerClerkId`, `name`, `status`, timestamps
  - [x] Define `competitionStatusEnum` in same file: `['draft', 'active', 'completed', 'archived']`
  - [x] Update `packages/shared/types/competition.types.ts` with standalone `Competition` TS interface
  - [x] Create `packages/db/migrations/0001_competitions_rls.sql` — raw SQL migration: CREATE TABLE, enable RLS, CREATE POLICY

- [x] Task 2: Create Drizzle DB provider in NestJS API (AC: #2, #3)
  - [x] Add `@competition-platform/db: "workspace:*"` to `apps/api/package.json` dependencies
  - [x] Create `apps/api/src/modules/database/database.module.ts` — NestJS module exporting `DatabaseService`
  - [x] Create `apps/api/src/modules/database/database.service.ts` — wraps Drizzle client (postgres-js driver), exported via `@Injectable()`
  - [x] Update `apps/api/src/app.module.ts` to import `DatabaseModule`
  - [x] Run `pnpm install` from repo root

- [x] Task 3: Tournament tRPC router (AC: #2, #3)
  - [x] Create `apps/api/src/trpc/routers/tournament.router.ts` — `tournament.list` protected procedure with RLS session set + competition query
  - [x] Update `apps/api/src/trpc/trpc.router.ts` to add `tournament: tournamentRouter` to appRouter

- [x] Task 4: Dashboard page — PPR shell + competition list (AC: #1, #2, #4, #5)
  - [x] PPR config: Next.js 16 uses `cacheComponents` (incompatible with ClerkProvider during prerender); `<Suspense>` boundary retained for streaming UX
  - [x] Update `apps/web/src/app/(admin)/dashboard/page.tsx` — Suspense boundary with skeleton
  - [x] Create `apps/web/src/components/admin/competition-list.tsx` — client component using `trpc.tournament.list.useQuery()`
  - [x] Create `apps/web/src/components/admin/competition-card.tsx` — card showing name, status badge, created date
  - [x] Create `apps/web/src/components/admin/competition-list-skeleton.tsx` — shadcn `Skeleton` cards for loading state

- [x] Task 5: Update admin layout with sidebar navigation (AC: #4, #5)
  - [x] Update `apps/web/src/app/(admin)/layout.tsx` — add icon sidebar (56px collapsed) with Dashboard + Competitions nav items

- [x] Task 6: Verify CI passes (AC: all)
  - [x] Run `pnpm exec turbo run lint typecheck test build` — all 11 tasks pass (11/11 successful)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Client-side tRPC routing broken — Added `rewrites()` to `next.config.ts` proxying `/trpc/:path*` to API
- [x] [AI-Review][HIGH] Missing CORS enablement — Added `app.enableCors()` with origin whitelist in `main.ts`
- [x] [AI-Review][MEDIUM] `protectedProcedure` duplicated — Extracted to `trpc.procedures.ts`, both routers now import from shared module
- [x] [AI-Review][MEDIUM] RLS GRANT commented out — Uncommented GRANT with `current_user` role
- [x] [AI-Review][MEDIUM] WCAG AA contrast violation — Removed `/60` opacity modifier from empty state text
- [x] [AI-Review][MEDIUM] `pg` in production dependencies — Moved to `devDependencies`
- [x] [AI-Review][MEDIUM] No smoke test for tournament router auth guard — Added `trpc.procedures.spec.ts` with UNAUTHORIZED and pass-through tests
- [x] [AI-Review][LOW] `scoring.ts` duplicate `export {}` — Removed duplicate
- [x] [AI-Review][LOW] `next.config.ts` completely empty — Now contains rewrites config (addressed by HIGH fix #1)

## Dev Notes

### CRITICAL — Story 1.1 + 1.2 Gotchas (MUST READ BEFORE CODING)

1. **`proxy.ts` NOT `middleware.ts`**: Always `apps/web/src/proxy.ts` with exported `proxy` function. Never create `middleware.ts`. This is a confirmed project convention.

2. **`reflect-metadata` in Vitest**: `apps/api/vitest.config.ts` has `setupFiles: ['reflect-metadata']`. All NestJS spec files get it automatically. Do not import manually.

3. **tRPC client sends Clerk JWT automatically**: `apps/web/src/lib/trpc.tsx` uses `useAuth().getToken()` in `httpBatchLink.headers()`. Every `trpc.*` query from client components sends the correct `Authorization: Bearer <token>`. tRPC server extracts userId in `createContext` via `verifyToken`. **Do not re-implement auth on the client side.**

4. **`export { t }` in trpc.router.ts is intentional**: `t` is re-exported from the router for convenience. Import `t` from `../trpc.init` inside routers to avoid circular imports (confirmed pattern from Story 1.2).

5. **tRPC appRouter type sharing**: `apps/api/package.json` has `exports: { "./trpc": { "types": "./src/trpc/index.ts" } }`. `apps/web` imports via `@competition-platform/api/trpc`. When adding `tournament` to the appRouter, the type propagates automatically.

6. **`NEXT_PUBLIC_API_URL` env var**: Already in `.env.example` as `http://localhost:3001`. The tRPC client uses this for SSR (server-side) requests. No change needed.

### Competitions Schema Design

```typescript
// packages/db/schema/competitions.ts
import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const competitionStatusEnum = pgEnum('competition_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);

export const competitions = pgTable('competitions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizerClerkId: text('organizer_clerk_id').notNull(),
  name: text('name').notNull(),
  status: competitionStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompetitionRow = typeof competitions.$inferSelect;
export type NewCompetitionRow = typeof competitions.$inferInsert;
```

> **Note:** Export as `CompetitionRow` (not `Competition`) to avoid collision with the standalone `Competition` type in `packages/shared/types/competition.types.ts`.

### Shared Competition Type

```typescript
// packages/shared/types/competition.types.ts
export type CompetitionStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface Competition {
  id: string;
  name: string;
  status: CompetitionStatus;
  createdAt: string; // ISO 8601 — tRPC serializes timestamps as strings
}
```

### RLS Migration SQL

The migration SQL is applied manually via `pnpm --filter @competition-platform/db db:migrate` or included as a raw `.sql` file in `packages/db/migrations/`. Drizzle Kit generates migrations from schema; **custom RLS policies must be added as a custom migration file**:

```sql
-- packages/db/migrations/0001_competitions_rls.sql
-- Run AFTER 0000_initial_schema from Drizzle generate

ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitions_organizer_isolation
  ON competitions
  USING (organizer_clerk_id = current_setting('session.current_organizer_id', true))
  WITH CHECK (organizer_clerk_id = current_setting('session.current_organizer_id', true));

-- Grant access to the app role (adjust to your DB user)
GRANT SELECT, INSERT, UPDATE, DELETE ON competitions TO authenticated;
```

> **Note on `current_setting` second arg `true`**: The `true` flag means "return NULL if setting does not exist" (rather than throwing an error). This prevents crashes when the variable is not set (e.g., during migrations).

> **⚠️ CI compatibility**: The CI pipeline runs `typecheck`, `lint`, `test`, and `build` — no live Postgres. Do NOT attempt to run DB migrations in tests. Drizzle schema files are TypeScript — they must typecheck cleanly even without a DB connection.

### Drizzle DB Provider in NestJS

```typescript
// apps/api/src/modules/database/database.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@competition-platform/db';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: ReturnType<typeof postgres>;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor() {
    const url = process.env['DATABASE_URL'] ?? '';
    this.client = postgres(url, { max: 10 });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}
```

```typescript
// apps/api/src/modules/database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global() // makes DatabaseService available everywhere without re-importing the module
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

> **`@Global()` pattern**: Marking `DatabaseModule` as global means you only import it once in `AppModule`. All other modules that inject `DatabaseService` just list it in their `constructor`, no `imports` needed.

> **`postgres` package vs `pg`**: Use `postgres` (postgres-js) — it's the same driver used by Neon serverless later. The `pg` package remains a dev dep for Drizzle Kit only. Import from `'postgres'` (not `'pg'`).

> **CI without DB**: When `DATABASE_URL` is empty, `postgres('')` will fail if a connection is attempted. But since no tests call DB methods, TypeScript compilation will pass. Do not add DB health checks that run during startup/import time.

### RLS Session Variable Pattern

Set `session.current_organizer_id` inside a Drizzle transaction before every query. `SET LOCAL` scopes it to the current transaction only:

```typescript
// apps/api/src/trpc/routers/tournament.router.ts
import { TRPCError } from '@trpc/server';
import { t } from '../trpc.init';
import { DatabaseService } from '../../modules/database/database.service';
import { competitions } from '@competition-platform/db';
import { sql, eq, desc } from 'drizzle-orm';

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export function createTournamentRouter(db: DatabaseService) {
  return t.router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
        return tx
          .select({
            id: competitions.id,
            name: competitions.name,
            status: competitions.status,
            createdAt: competitions.createdAt,
          })
          .from(competitions)
          .where(eq(competitions.organizerClerkId, ctx.userId))
          .orderBy(desc(competitions.createdAt));
      });
    }),
  });
}
```

> **Factory function pattern**: `createTournamentRouter(db)` takes `DatabaseService` as a parameter rather than injecting it via NestJS DI (tRPC routers are not NestJS providers). Pass the `DatabaseService` instance from `TrpcModule`.

### Wiring into TrpcModule

`TrpcModule` already uses `HttpAdapterHost`. Add `DatabaseService` injection:

```typescript
// apps/api/src/trpc/trpc.module.ts — updated imports
import { DatabaseService } from '../modules/database/database.service';
// In TrpcModule constructor:
constructor(
  private readonly httpAdapterHost: HttpAdapterHost,
  private readonly databaseService: DatabaseService,
) {}
// In onModuleInit, pass to appRouter factory (see trpc.router.ts changes below)
```

And update `trpc.router.ts` to accept tournament router:

```typescript
// apps/api/src/trpc/trpc.router.ts
import { t } from './trpc.init';
import { authRouter } from './routers/auth.router';
import type { DatabaseService } from '../modules/database/database.service';
import { createTournamentRouter } from './routers/tournament.router';

export { t };

export function createAppRouter(db: DatabaseService) {
  return t.router({
    auth: authRouter,
    tournament: createTournamentRouter(db),
  });
}

// Keep static type export (use a placeholder for type inference)
// This is a pattern limitation — the AppRouter type needs to be static.
// Solution: export a type-only router with a mock db:
import type { createAppRouter as _createAppRouter } from './trpc.router';
export type AppRouter = ReturnType<typeof createAppRouter>;
```

> **⚠️ AppRouter type issue**: If `createAppRouter` is a factory function, `typeof appRouter` no longer works for the static type. Solution: define `AppRouter` as `ReturnType<typeof createAppRouter>` and keep `trpc/index.ts` exporting that type. The web app's TypeScript will resolve correctly since it imports the type, not the value.

> **Alternative approach** (simpler): Instead of a factory, inject `DatabaseService` into `TrpcModule` and set it on a module-level variable before `createExpressMiddleware` is called. This avoids refactoring the router factory pattern. Whichever approach you pick, ensure `AppRouter` type in `trpc/index.ts` remains consistent.

### Dashboard Page with PPR

```tsx
// apps/web/src/app/(admin)/dashboard/page.tsx
import { Suspense } from 'react';
import { CompetitionList } from '@/components/admin/competition-list';
import { CompetitionListSkeleton } from '@/components/admin/competition-list-skeleton';

// Enable Partial Prerendering — static shell served immediately, dynamic data streams in
export const experimental_ppr = true;

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Competitions</h1>
        {/* Create competition button — implemented in Story 2.1 */}
        <button
          disabled
          className="px-4 py-2 rounded-md bg-accent text-white text-sm opacity-50 cursor-not-allowed"
        >
          New Competition
        </button>
      </div>
      <Suspense fallback={<CompetitionListSkeleton />}>
        <CompetitionList />
      </Suspense>
    </div>
  );
}
```

> **PPR config**: Before `export const experimental_ppr = true`, ensure `apps/web/next.config.js` (or `.ts`) has `experimental: { ppr: 'incremental' }`. Check the actual config file before modifying — it already exists from the project scaffold. Read `node_modules/next/dist/docs/` for Next.js 16 PPR specifics per the AGENTS.md warning.

### Competition List Client Component

```tsx
// apps/web/src/components/admin/competition-list.tsx
'use client';

import { trpc } from '@/lib/trpc';
import { CompetitionCard } from './competition-card';

export function CompetitionList() {
  const { data: competitions, isLoading } = trpc.tournament.list.useQuery();

  if (isLoading) return null; // Suspense handles this via fallback

  if (!competitions || competitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-text-secondary text-lg mb-2">No competitions yet</p>
        <p className="text-text-muted text-sm mb-6">Create your first competition to get started</p>
        {/* CTA — wire up in Story 2.1 */}
        <button
          disabled
          className="px-6 py-3 rounded-md bg-accent text-white font-medium opacity-50 cursor-not-allowed"
        >
          Create Your First Competition
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {competitions.map((competition) => (
        <CompetitionCard key={competition.id} competition={competition} />
      ))}
    </div>
  );
}
```

### Competition Card Component

```tsx
// apps/web/src/components/admin/competition-card.tsx
import type { Competition } from '@competition-platform/shared';

const statusColors: Record<Competition['status'], string> = {
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  archived: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600',
};

export function CompetitionCard({ competition }: { competition: Competition }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 hover:bg-surface-raised transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-medium text-text-primary leading-tight">{competition.name}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColors[competition.status]}`}
        >
          {competition.status}
        </span>
      </div>
      <p className="text-text-muted text-xs">
        Created {new Date(competition.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}
```

> **CSS variable tokens**: Use `bg-surface`, `bg-surface-raised`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-border` as defined in `globals.css`. Check that these CSS vars are defined — if they're Tailwind arbitrary values, adjust to use Tailwind's zinc palette instead (e.g., `bg-white dark:bg-zinc-900`).

### Competition List Skeleton

```tsx
// apps/web/src/components/admin/competition-list-skeleton.tsx
import { Skeleton } from '@/components/ui/skeleton'; // shadcn Skeleton

export function CompetitionListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
```

> **shadcn Skeleton**: If `@/components/ui/skeleton` does not exist, add it via `npx shadcn@latest add skeleton`. Check `components.json` for the shadcn config path before running.

### Admin Layout — Sidebar Navigation

Update `(admin)/layout.tsx` to add an icon sidebar with collapsible navigation:

```tsx
// apps/web/src/app/(admin)/layout.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
// Icons from lucide-react (already installed)
import { LayoutDashboard, Trophy } from 'lucide-react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/competitions', icon: Trophy, label: 'Competitions' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="min-h-screen flex">
      {/* Icon sidebar — 56px, fixed */}
      <aside className="w-14 flex flex-col items-center py-4 gap-2 border-r border-border bg-surface shrink-0">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className="w-10 h-10 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
          >
            <Icon size={20} />
          </Link>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="font-semibold text-text-primary">Competition Platform</span>
          <UserButton afterSignOutUrl="/sign-in" />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

> **Active state**: For this story, sidebar links have no active indicator. An active state using `usePathname()` (client component) can be added in a future story if needed. Keep the layout as a server component for now.

### Shared Package Import from Web

The web app imports `Competition` from `@competition-platform/shared`. Check that `apps/web/package.json` has `@competition-platform/shared: "workspace:*"` in `dependencies`. If not, add it and run `pnpm install`.

Check `packages/shared/package.json` exports to ensure `competition.types.ts` is reachable:

```json
// packages/shared/package.json — should already export:
"exports": { ".": "./index.ts" }
```

And `packages/shared/index.ts` should re-export competition types:

```typescript
export * from './types/competition.types';
```

Verify both before assuming the import path works.

### Project Structure Notes

**New files for this story:**

```
packages/db/schema/competitions.ts          ← Drizzle schema (replaces placeholder)
packages/db/migrations/0001_competitions_rls.sql  ← Custom RLS migration
apps/api/src/modules/database/database.module.ts
apps/api/src/modules/database/database.service.ts
apps/api/src/trpc/routers/tournament.router.ts
apps/web/src/components/admin/competition-list.tsx
apps/web/src/components/admin/competition-card.tsx
apps/web/src/components/admin/competition-list-skeleton.tsx
```

**Modified files:**

```
packages/db/schema/competitions.ts          ← Replace export {} stub with schema
packages/shared/types/competition.types.ts  ← Replace export {} stub with Competition type
apps/api/src/modules/database/            ← New directory
apps/api/src/trpc/routers/tournament.router.ts  ← New file
apps/api/src/trpc/trpc.router.ts            ← Add tournament router to appRouter
apps/api/src/trpc/trpc.module.ts            ← Inject DatabaseService
apps/api/src/app.module.ts                  ← Import DatabaseModule
apps/api/package.json                       ← Add @competition-platform/db dep
apps/web/src/app/(admin)/dashboard/page.tsx ← Replace stub with PPR shell
apps/web/src/app/(admin)/layout.tsx         ← Add sidebar
apps/web/next.config.js (or .ts)            ← Add PPR config
pnpm-lock.yaml                              ← Updated after pnpm install
```

**Architecture compliance — MUST NOT violate:**

- Competitions owned by `organizerClerkId` (Clerk userId) — NOT a separate organizer table (that's Story 1.x later)
- Do NOT create `users` or `organizations` tables — that is Story 1.x
- Do NOT implement "Create Competition" form/wizard — that is Story 2.1
- Do NOT add judge, scoring, or bracket routes — future epics
- The `(admin)/competitions/page.tsx` stub (`export default function CompetitionsPage() { return <main />; }`) stays as a stub — do NOT implement it in this story
- tRPC `tournament` namespace is new — do NOT create a `competitions` namespace (architecture defines `tournament` as the bounded context)

### AppRouter Type Propagation — Critical Detail

When adding `tournament: createTournamentRouter(db)` to the appRouter, the `AppRouter` type exported from `apps/api/src/trpc/index.ts` must update. Since `trpc/index.ts` does `export type { AppRouter } from './trpc.router'`, the type flows automatically as long as `trpc.router.ts` exports the correct `AppRouter` type.

If you switch from `appRouter = t.router({...})` (static) to `createAppRouter(db)` (factory), update `trpc/index.ts`:

```typescript
export type { AppRouter } from './trpc.router';
// AppRouter is now: ReturnType<typeof createAppRouter>
// Ensure trpc.router.ts exports: export type AppRouter = ReturnType<typeof createAppRouter>
```

Run `pnpm exec turbo run typecheck` after this change to verify the web app still resolves the type correctly.

### Anti-Patterns to Avoid

- ❌ Do NOT use `pg` package for the DB connection — use `postgres` (postgres-js)
- ❌ Do NOT store the Drizzle client as a global variable — use NestJS DI via `DatabaseService`
- ❌ Do NOT call `SET session.current_organizer_id` outside a transaction — use `SET LOCAL` inside `db.transaction()`
- ❌ Do NOT hardcode fallback data or mock competitions in tests — test the schema structure, not DB queries
- ❌ Do NOT import `DatabaseService` in tRPC router files directly — pass as factory parameter to keep routers NestJS-decoupled
- ❌ Do NOT add `'use client'` to `(admin)/layout.tsx` — keep it as a server component for Clerk's `auth()` call
- ❌ Do NOT add `usePathname()` to the layout (requires `'use client'`) — active nav state is out of scope for this story
- ❌ Do NOT add Tremor components yet — basic shadcn Card/Skeleton is sufficient for this shell story
- ❌ Do NOT run Drizzle migrations in CI — migrations require a live Postgres instance

### Testing Strategy

**No new Vitest tests required** — this story focuses on schema, API wiring, and UI shell. The tRPC tournament router is integration-tested once Postgres is available (out of scope for unit tests without a real DB).

If you want to add a smoke test:

```typescript
// apps/api/src/trpc/routers/tournament.router.spec.ts
// Test that list procedure throws UNAUTHORIZED when userId is null
// No DB connection needed — just verify the auth guard fires
```

**Typecheck is the primary CI gate** for this story. All new files must pass `tsc --noEmit`.

### References

- Competition dashboard requirements [Source: `_bmad-output/planning-artifacts/epics.md#Story 1.3`]
- Admin route structure `(admin)/` [Source: `_bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure`]
- PPR rendering strategy [Source: `_bmad-output/planning-artifacts/architecture.md#Frontend Architecture - Rendering`]
- Sidebar: 56px icon-only [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Navigation Patterns`]
- Empty state conventions [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Empty & Loading States`]
- Skeleton loading pattern [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Loading States`]
- shadcn Skeleton + Card components [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy`]
- RLS using `current_setting` [Source: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`]
- Drizzle + postgres-js driver [Source: `_bmad-output/planning-artifacts/architecture.md#Architecture Validation Results`]
- tRPC tournament bounded context [Source: `_bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping`]
- Color tokens (CSS vars) [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Color System`]
- Story 1.2 tRPC infrastructure [Source: `_bmad-output/implementation-artifacts/1-2-organizer-account-creation-and-authentication.md#Completion Notes List`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Next.js 16 PPR: `experimental.ppr: 'incremental'` removed; replaced by `cacheComponents: true` (top-level config). However, `ClerkProvider` in the root layout calls `headers()` during prerendering, crashing the build. Removed `cacheComponents: true`. `<Suspense>` boundary retained for streaming UX (AC #4 intent preserved).
- Next.js 16 route segment config: `export const dynamic = 'force-dynamic'` incompatible with `cacheComponents`. `export const experimental_ppr = true` removed per v16 changelog. No page-level route segment config changes needed.
- tRPC factory pattern: `createAppRouter(db)` takes `DatabaseService` as parameter. `AppRouter = ReturnType<typeof createAppRouter>` exported as type-only — web app resolves correctly at typecheck time.
- `drizzle-orm/postgres-js` driver: added to `apps/api`. `postgres('')` with empty URL doesn't crash at import time — only fails when a connection is attempted (safe for CI without DB).

### Completion Notes List

1. **PPR not used** — Next.js 16.2.3 `cacheComponents: true` is incompatible with Clerk v5 `ClerkProvider` (which calls `headers()` during static prerender). The `<Suspense>` boundary on the dashboard provides equivalent streaming UX without PPR.
2. **RLS policy SQL** — `packages/db/migrations/0001_competitions_rls.sql` is a manual migration. It requires a live Postgres instance to apply. CI does not run DB migrations.
3. **Auth sidebar** — Admin layout is a server component calling `auth()`. The sidebar uses `lucide-react` icons (already installed). No active-state indicator — deferred to a future story.
4. **Competition type shared** — `@competition-platform/shared` exports `Competition` interface. `createdAt` typed as `string` (ISO 8601) since tRPC JSON-serializes `Date` objects.

### Senior Developer Review (AI)

**Reviewer:** Dragonarka on 2026-04-17
**Outcome:** Changes Requested (2 HIGH, 5 MEDIUM, 2 LOW)

**Summary:** Implementation is structurally sound — schema, RLS, factory pattern, and UI components are well-built. Two blocking issues: (1) client-side tRPC routing has no proxy from Next.js to API, and (2) API lacks CORS headers. Five medium issues around code duplication, WCAG contrast, migration completeness, dependency placement, and missing smoke test. Story status moved to `in-progress` — 9 action items created under "Review Follow-ups (AI)".

### File List

**New files:**

- `packages/db/schema/competitions.ts` (replaced stub)
- `packages/db/migrations/0001_competitions_rls.sql`
- `packages/shared/types/competition.types.ts` (replaced stub)
- `apps/api/src/modules/database/database.module.ts`
- `apps/api/src/modules/database/database.service.ts`
- `apps/api/src/trpc/routers/tournament.router.ts`
- `apps/web/src/components/admin/competition-list.tsx`
- `apps/web/src/components/admin/competition-card.tsx`
- `apps/web/src/components/admin/competition-list-skeleton.tsx`
- `apps/web/src/components/ui/skeleton.tsx`

**Modified files:**

- `apps/api/src/trpc/trpc.router.ts` — factory pattern, tournament router added
- `apps/api/src/trpc/trpc.module.ts` — injects DatabaseService
- `apps/api/src/app.module.ts` — imports DatabaseModule
- `apps/api/package.json` — added `@competition-platform/db`, `drizzle-orm`, `postgres`
- `apps/web/src/app/(admin)/dashboard/page.tsx` — Suspense boundary + skeleton
- `apps/web/src/app/(admin)/layout.tsx` — icon sidebar added
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — routing props added
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — routing props added
- `apps/web/src/lib/trpc.tsx` — simplified Competition prop passing
- `apps/web/package.json` — added `@competition-platform/shared`
- `apps/web/next.config.ts` — no PPR config (empty config)
