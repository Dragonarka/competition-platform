# Story 2.1: Create a Competition

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an organizer,
I want to create a new competition with a name, date, and description,
so that I have a configured event container to build my competition around.

## Acceptance Criteria

1. Given I am on my dashboard, when I click "Create Competition" and fill in the name, date, and optional description, then a new competition is created in draft state and I am taken to the competition configuration screen.

2. Given I submit the form with a missing required name, when the form validates, then a validation error is shown and the competition is not created.

3. Given I create a competition, when it is saved, then it belongs to my organization (RLS) and is invisible to other organizers.

4. And the competition is stored with a server-generated nanoid (never auto-increment integer).

## Tasks / Subtasks

- [x] Task 1: Extend competitions DB schema and shared types (AC: #3, #4)
  - [x] Add `nanoid` dependency to `packages/db`
  - [x] Update `packages/db/schema/competitions.ts`: replace `crypto.randomUUID()` with `nanoid(21)`, add `description` (text, nullable) and `date` (timestamp with timezone, nullable) columns
  - [x] Create migration `packages/db/migrations/0002_add_competition_description_date.sql` for the new columns (ALTER TABLE ADD COLUMN)
  - [x] Update `packages/shared/types/competition.types.ts`: add `description: string | null` and `date: string | null` to `Competition` interface
  - [x] Create `packages/shared/validation/competition.schema.ts`: Zod schemas for `CreateCompetitionInput` (name required string min 1 max 200, date optional ISO string, description optional string max 2000)

- [x] Task 2: Add `tournament.create` tRPC mutation (AC: #1, #2, #3, #4)
  - [x] Update `apps/api/src/trpc/routers/tournament.router.ts`: add `create` protected mutation using Zod input schema from `@competition-platform/shared`
  - [x] Mutation sets RLS session variable within transaction (same pattern as `list`)
  - [x] Insert into competitions table with `organizerClerkId: ctx.userId`, return created competition
  - [x] Update `tournament.list` query to also select `description` and `date` columns

- [x] Task 3: Install required shadcn/ui components (AC: #1, #2)
  - [x] Install `input`, `label`, `card`, `textarea` shadcn/ui components via CLI

- [x] Task 4: Create competition form page (AC: #1, #2)
  - [x] Create `apps/web/src/app/(admin)/competitions/new/page.tsx` — server component wrapper with heading
  - [x] Create `apps/web/src/components/admin/create-competition-form.tsx` — client component with tRPC mutation, Zod-validated form, redirect on success to `/competitions/[id]`
  - [x] Form fields: name (text input, required), date (date input, optional), description (textarea, optional)
  - [x] Display inline validation errors from Zod schema
  - [x] On successful creation, use `router.push(`/competitions/${result.id}`)` to redirect

- [x] Task 5: Wire up CTA and navigation (AC: #1)
  - [x] Update `apps/web/src/components/admin/competition-list.tsx`: replace disabled button with `<Link href="/competitions/new">` using buttonVariants
  - [x] Add "New Competition" button to competitions page header
  - [x] Create `apps/web/src/app/(admin)/competitions/[id]/page.tsx` stub (competition config screen — placeholder for Story 2.2+)

- [x] Task 6: Update competition card to show new fields (AC: #1)
  - [x] Update `apps/web/src/components/admin/competition-card.tsx` to display `date` (if present) and `description` (truncated with line-clamp-2), wrapped in Link to config page
  - [x] CompetitionListSkeleton unchanged — card layout minimal change

- [x] Task 7: Verify CI passes (AC: all)
  - [x] Run `pnpm exec turbo run lint typecheck test build` — 11/11 tasks pass

## Dev Notes

### CRITICAL — Story 1.2 + 1.3 Gotchas (MUST READ BEFORE CODING)

1. **`proxy.ts` NOT `middleware.ts`**: Always `apps/web/src/proxy.ts` with exported `proxy` function. Never create `middleware.ts`. This is a confirmed project convention.

2. **`reflect-metadata` in Vitest**: `apps/api/vitest.config.ts` has `setupFiles: ['reflect-metadata']`. All NestJS spec files get it automatically. Do not import manually.

3. **tRPC client sends Clerk JWT automatically**: `apps/web/src/lib/trpc.tsx` uses `useAuth().getToken()` in `httpBatchLink.headers()`. Every `trpc.*` query from client components sends the correct `Authorization: Bearer <token>`. **Do not re-implement auth on the client side.**

4. **`export { t }` in trpc.router.ts is intentional**: `t` is re-exported from the router for convenience. Import `t` from `../trpc.init` inside routers to avoid circular imports (confirmed pattern from Story 1.2).

5. **tRPC appRouter type sharing**: `apps/api/package.json` has `exports: { "./trpc": { "types": "./src/trpc/index.ts" } }`. `apps/web` imports via `@competition-platform/api/trpc`. When adding `create` to the tournament router, the type propagates automatically.

6. **Factory router pattern**: `createTournamentRouter(db: DatabaseService)` receives DB as parameter. Do NOT use NestJS DI in router files.

7. **RLS transaction pattern**: Always `SET LOCAL session.current_organizer_id = ${ctx.userId}` inside `db.db.transaction()`. `SET LOCAL` scopes to the transaction only.

8. **protectedProcedure from shared module**: Import from `../trpc.procedures` — NOT redefined per router.

9. **postgres-js (not pg) for runtime**: Use `postgres` package. `pg` is devDependency only (Drizzle Kit).

10. **IDs are server-generated**: AC #4 specifies nanoid. Current schema uses `crypto.randomUUID()` — this story MUST switch to nanoid.

11. **Scores as strings**: All numeric precision values stored as strings with 2 decimal places — never floating point. (Not directly relevant to this story, but noted for future context.)

12. **Zod for ALL input validation** (enforcement rule #5): Never manual if/else. Create schema in `packages/shared/validation/`.

13. **shadcn/ui components**: Only `button.tsx` and `skeleton.tsx` are installed. Must install `input`, `label`, `card`, `textarea` for the form. Use `npx shadcn@latest add <component>` from `apps/web/`.

14. **Next.js 16 with non-standard APIs**: This version has breaking changes. Check `apps/web/node_modules/next/dist/docs/` for correct patterns. Router navigation uses `useRouter()` from `next/navigation`.

15. **No `competitions` tRPC namespace**: Use `tournament` bounded context (per architecture data boundaries).

### Architecture Compliance

- **Module boundary**: Competition creation goes through `tournament` tRPC router, NOT a separate `competition` router. The `tournament` module owns the `competitions` table per data boundaries.
- **Shared types in `packages/shared`**: `Competition` interface and Zod schemas live in shared, not in `apps/web` or `apps/api`.
- **RLS enforcement**: Every DB query touching competitions MUST set the RLS session variable inside a transaction.
- **File naming**: kebab-case for all files. PascalCase for React components. camelCase for functions/variables.
- **Database columns**: snake_case. Drizzle exports: camelCase.
- **tRPC procedure naming**: verb-first camelCase — `tournament.create`, `tournament.list`.
- **Error handling**: Use `TRPCError` with structured codes. Client-side: let tRPC client handle error display.

### Project Structure Notes

Files to create:

```
packages/shared/validation/competition.schema.ts    — Zod schemas
packages/db/migrations/0002_add_competition_description_date.sql
apps/web/src/app/(admin)/competitions/new/page.tsx   — Create form page
apps/web/src/app/(admin)/competitions/[id]/page.tsx  — Config screen stub
apps/web/src/components/admin/create-competition-form.tsx
```

Files to modify:

```
packages/db/schema/competitions.ts                  — Add description, date, switch to nanoid
packages/db/package.json                             — Add nanoid dependency
packages/shared/types/competition.types.ts          — Add description, date
apps/api/src/trpc/routers/tournament.router.ts      — Add create mutation, update list select
apps/web/src/components/admin/competition-list.tsx   — Wire up CTA link
apps/web/src/components/admin/competition-card.tsx   — Show new fields
```

### shadcn/ui Installation Commands

```bash
cd apps/web
npx shadcn@latest add input label card textarea
```

Note: shadcn/ui in this project uses `@base-ui/react` primitives (visible in `button.tsx`). The CLI will handle installation correctly.

### Testing Standards

- Primary CI gate: `pnpm exec turbo run lint typecheck test build` (11+ tasks)
- No live DB in CI — do NOT run migrations in tests
- Smoke test the `tournament.create` procedure: verify it rejects when name is empty (Zod validation), verify it rejects when userId is null (protectedProcedure)
- Co-locate test files: `tournament.router.spec.ts` next to `tournament.router.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries — tournament module owns competitions]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #5 — Zod for all validation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Rules #8 — nanoid server-generated IDs]
- [Source: _bmad-output/planning-artifacts/architecture.md#tRPC Router Naming — verb-first camelCase]
- [Source: _bmad-output/planning-artifacts/prd.md#FR1 — Create competition with name, date, description]
- [Source: _bmad-output/planning-artifacts/prd.md#FR61 — Organizer data isolation]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR13 — Database-enforced row-level security]
- [Source: _bmad-output/implementation-artifacts/1-3-organizer-competition-dashboard-shell.md#Dev Notes — Previous story gotchas]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- `asChild` prop not supported on shadcn/ui Button (uses @base-ui/react, not Radix). Fixed by using `buttonVariants()` className on `<Link>` directly.
- `@competition-platform/shared` missing from `apps/api/package.json` dependencies. Added `workspace:*` reference.
- Added `zod` dependency to `packages/shared` for validation schemas.

### Completion Notes List

- Switched competition ID generation from `crypto.randomUUID()` to `nanoid(21)` per architecture enforcement rule #8
- Created Zod validation schema in shared package — reused by both tRPC server-side validation and client-side form validation
- `tournament.create` mutation follows exact same RLS transaction pattern as `tournament.list`
- Competition cards now link to `/competitions/[id]` config page (stub for Story 2.2+)
- Empty state CTA on dashboard now links to `/competitions/new`
- Competitions page has "New Competition" button in header

### Code Review Fixes (Adversarial Review)

- [H1] Fixed `[id]/page.tsx` async params — Next.js 16 requires `params: Promise<{ id: string }>` with `await`
- [M1] Created `tournament.router.spec.ts` — 4 smoke tests: empty name, whitespace-only name, >200 char name, null userId
- [M2] Added `.trim()` to Zod name schema — prevents whitespace-only names at API level
- [M3] Fixed date timezone footgun — `${date}T12:00:00.000Z` (noon UTC) instead of `new Date(date).toISOString()` (midnight UTC)
- [M4] Added `aria-describedby` linking error messages to form inputs for screen reader accessibility

### File List

New files:

- packages/db/migrations/0002_add_competition_description_date.sql
- packages/shared/validation/competition.schema.ts
- apps/web/src/app/(admin)/competitions/new/page.tsx
- apps/web/src/app/(admin)/competitions/[id]/page.tsx
- apps/web/src/components/admin/create-competition-form.tsx
- apps/web/src/components/ui/input.tsx (shadcn)
- apps/web/src/components/ui/label.tsx (shadcn)
- apps/web/src/components/ui/card.tsx (shadcn)
- apps/web/src/components/ui/textarea.tsx (shadcn)
- apps/api/src/trpc/routers/tournament.router.spec.ts — smoke tests for create mutation

Modified files:

- packages/db/schema/competitions.ts — nanoid + description/date columns
- packages/db/package.json — added nanoid dependency
- packages/shared/types/competition.types.ts — added description, date fields
- packages/shared/validation/competition.schema.ts — added .trim() to name field
- packages/shared/index.ts — export competition.schema
- packages/shared/package.json — added zod dependency
- apps/api/src/trpc/routers/tournament.router.ts — added create mutation, updated list select
- apps/api/package.json — added @competition-platform/shared dependency
- apps/web/src/app/(admin)/competitions/page.tsx — header with New Competition link, Suspense list
- apps/web/src/app/(admin)/competitions/[id]/page.tsx — async params for Next.js 16
- apps/web/src/components/admin/competition-list.tsx — CTA links to /competitions/new
- apps/web/src/components/admin/competition-card.tsx — shows date/description, wrapped in Link
- apps/web/src/components/admin/create-competition-form.tsx — noon UTC dates, aria-describedby
