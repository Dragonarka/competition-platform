---
project_name: competition-platform
user_name: Dragonarka
date: 2026-04-24
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: complete
rule_count: 52
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents MUST follow when implementing code in this project. Focus on unobvious details derived from adversarial code reviews, stack-specific breaking changes, and repeating production mistakes. Read this BEFORE writing any code._

---

## Technology Stack & Versions

**Monorepo:** pnpm `9.15.9` + Turborepo. Workspaces: `apps/*`, `packages/*`, `packages/formats/*`. Node `>=20`.

**Backend (`apps/api`):** NestJS `11` · tRPC `11` · Drizzle ORM `0.38` · `postgres` `3.4` (runtime) · Socket.IO `4.8` (via `@nestjs/platform-socket.io` + `@nestjs/websockets`) · `@clerk/backend` `1.x` · Zod `3` · reflect-metadata `0.2`.

**Frontend (`apps/web`):** Next.js `16.2.3` · React `19.2.4` · Tailwind `4` · `@base-ui/react` `1.3` (shadcn primitives — NOT Radix) · TanStack Query `5` · Zustand `5` · `@clerk/nextjs` `5.x` · `@trpc/client` + `@trpc/react-query` `11` · `socket.io-client` `4.8`.

**DB (`packages/db`):** Drizzle ORM `0.38` · Drizzle Kit `0.30` · nanoid `5.1.9` · `postgres` `3.4` (runtime) · `pg` `8` (devDependency only — Drizzle Kit).

**Testing:** Vitest `2` (all packages) · Playwright `1.49` (apps/web E2E only).

**Language:** TypeScript `5.7+` strict mode everywhere. ESLint `9` + `eslint-plugin-react-hooks@7` (has stricter rules than older versions) + `typescript-eslint` `8` + Prettier `3`.

**Infra:** Fly.io + GitHub Actions CI/CD + Neon Postgres (prod) + Upstash Redis (prod) + Docker Compose (local dev DB).

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **All input validation goes through Zod.** Never hand-rolled `if/else` validation. Schemas live in `packages/shared/validation/`. `AddParticipantInput = z.infer<typeof addParticipantSchema>` — export both schema and inferred type.
- **Shared types live only in `packages/shared/`.** Never define DTOs/interfaces/schemas in `apps/web` or `apps/api`. Both apps import from `@competition-platform/shared`.
- **tRPC appRouter type propagates automatically** via `apps/api/package.json` `exports["./trpc"]` → `apps/web` imports `@competition-platform/api/trpc`. Do not duplicate types on the client.
- **`import { z } from 'zod'` directly for inline schemas** in routers; import named/reused schemas from `@competition-platform/shared`.
- **IDs are server-generated with `nanoid(21)`** — never `crypto.randomUUID()`, never auto-increment integers, never client-generated. Use `.$defaultFn(() => nanoid(21))` on schema `id` columns, but also verify the default fires on INSERT.
- **Scores, min/max, and any decimal precision values are stored as strings with 2 decimal places** (e.g., `"0.00"`, `"10.00"`). Columns are `text`, NOT `numeric`/`decimal`/`float`. Convert numeric form inputs with `.toFixed(2)` before sending. Architecture enforcement rule #7.

### Framework-Specific Rules: Backend (NestJS + tRPC + Drizzle)

- **Factory router pattern, not NestJS DI in router files.** `createTournamentRouter(db: DatabaseService)` takes DB as parameter. Import `t` from `'../trpc.init'` — NOT from the router itself (`export { t }` in router is for external convenience only, never import from there inside another router).
- **`protectedProcedure` is imported from `'../trpc.procedures'`** — never redefine per router. Public procedures use `t.procedure` from `'../trpc.init'`.
- **Every DB-touching procedure uses the RLS transaction pattern:**
  ```typescript
  return db.db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`);
    // ... queries here
  });
  ```
  `SET LOCAL` scopes to the transaction only. No exceptions for `protectedProcedure`. Public procedures (judge-facing, unauthenticated) use direct `db.db.select(...)` without transaction — they have no organizer context.
- **Ownership verification pattern: two layers of defense.**
  1. RLS is on, filtering rows by `current_organizer_id`.
  2. On mutations, explicitly `SELECT id FROM competitions WHERE id = $competitionId` inside the same transaction; if zero rows, throw `TRPCError({ code: 'NOT_FOUND' })`. RLS silently filters; the explicit check gives a useful error.
- **Ownership-by-subquery DELETE pattern** for deleting child rows by id:
  ```sql
  DELETE FROM <child_table>
  WHERE id = ${input.childId}
    AND competition_id IN (
      SELECT id FROM competitions WHERE organizer_clerk_id = ${ctx.userId}
    )
  RETURNING id
  ```
  Use `RETURNING id` and throw NOT_FOUND if result is empty.
- **TOCTOU protection on unique constraints:** wrap the INSERT in `try/catch` and map postgres error code `23505` (unique violation) to `TRPCError({ code: 'CONFLICT', message: 'user-friendly message' })`. A pre-insert `SELECT … WHERE exists` then `INSERT` is a race condition under concurrency.
- **Always bump `updatedAt: new Date()` in `.set()` on every UPDATE mutation** that touches `competitions` (or any table with `updatedAt`). This is an easy miss that adversarial review repeatedly flags.
- **`postgres-js` is the runtime driver, not `pg`.** `pg` is a devDependency used only by Drizzle Kit. Don't import `pg` in app code.
- **pgEnum creates a Postgres TYPE.** Migration SQL must `CREATE TYPE <name> AS ENUM (...)` BEFORE `ALTER TABLE ... ADD COLUMN`. The string passed to `pgEnum('type_name', ...)` must exactly match the SQL TYPE name.
- **Unique constraints require both ends:** Drizzle `pgTable` third argument `(table) => [uniqueIndex('name').on(table.a, table.b)]` AND explicit `UNIQUE (a, b)` (or unique index) in migration SQL.
- **All new child tables need their own RLS policy.** RLS is not inherited from parent tables. Pattern: `USING (competition_id IN (SELECT id FROM competitions WHERE organizer_clerk_id = current_setting('session.current_organizer_id', true)))`.
- **No `competitions` tRPC namespace.** All competition-domain procedures go under `tournament.*` (the bounded context owns `competitions`, `evaluation_criteria`, `competitors`, `judge_sessions`, `phases`).
- **tRPC procedure naming: verb-first camelCase.** `tournament.create`, `tournament.listCriteria`, `tournament.setJudgeConfig`. No nouns-as-prefix.
- **`reflect-metadata` is auto-loaded** in `apps/api/vitest.config.ts` via `setupFiles: ['reflect-metadata']`. Never import it manually in `.spec.ts` files.

### Framework-Specific Rules: Frontend (Next.js 16 + React 19 + TanStack Query 5)

- **⚠️ Next.js 16 has breaking changes.** Before writing any Next.js code, read the relevant guide in `apps/web/node_modules/next/dist/docs/`. The warning is in `apps/web/AGENTS.md`. Do not rely on training-data knowledge for Next.js APIs.
- **Auth proxy is at `apps/web/src/proxy.ts` with exported `proxy` function. NEVER create `middleware.ts`.** This is the Next.js 16 convention and a confirmed project rule.
- **Dynamic route params are a Promise: `params: Promise<{ id: string }>`** in server components. `const { id } = await params;`. Client components use `useParams<{ id: string }>()` from `'next/navigation'` instead of a props-based param.
- **tRPC client sends Clerk JWT automatically** via `apps/web/src/lib/trpc.tsx` using `useAuth().getToken()` in `httpBatchLink.headers()`. Every `trpc.*` call from a client component is authenticated. NEVER re-implement auth on the client side.
- **shadcn/ui `<Button>` does NOT support `asChild`** (this project uses `@base-ui/react`, NOT Radix). For link-as-button: `<Link href="..." className={buttonVariants({ variant: 'default' })}>` — use the `buttonVariants()` helper on a `<Link>`.
- **Tabs are already installed** at `@/components/ui/tabs`. Don't re-run `pnpm dlx shadcn@latest add tabs`.
- **TanStack Query v5 removed `onSuccess`/`onError` from `useQuery`.** They still exist on `useMutation`. For query-data-driven side-effects: derive state directly (`const x = data ?? default`) or use `useEffect`. If you hit `react-hooks/set-state-in-effect` lint error, use the split-component pattern: outer loader fetches data + renders inner component with `key={data.id}` and passes data as props; inner component initializes `useState` from props (no effect needed).
- **Number inputs: `<input type="number">` returns strings from `e.target.value`.** Parse with `parseInt(v, 10)`; handle `NaN` by keeping previous value or empty string. Convert to `.toFixed(2)` string BEFORE sending to tRPC if the schema expects a decimal string.
- **Form mutation UX pattern:** `onSuccess` → `utils.<query>.invalidate(...)` + reset form state. `onError` → store error in local state and render inline (e.g., below the field that caused it). For optimistic updates, roll back local state in `onError`.
- **Client components must start with `'use client';`.** Server page components stay server; make one client-boundary component per feature (e.g., `CriteriaManager`, `ParticipantsManager`).
- **Date timezone footgun:** `new Date(date).toISOString()` gives midnight UTC which shifts by a day in negative timezones. Use noon UTC for date-only inputs: `${date}T12:00:00.000Z`. (Fixed in Story 2.1 [M3].)

### Testing Rules

- **CI gate:** `pnpm exec turbo run lint typecheck test build` — must be fully green before marking a story done. All 4 tasks × all packages.
- **No live DB in CI.** Tests do not run migrations, do not connect to real Postgres. Use mocked `DatabaseService` via the `mockDb` + `caller()` helpers in `tournament.router.spec.ts`.
- **Every new tRPC procedure gets two tests minimum:**
  1. Zod validation test (reject invalid input).
  2. Auth test: `caller(null).<procedure>(...)` → `rejects.toMatchObject({ code: 'UNAUTHORIZED' })` for `protectedProcedure`.
     This is a recurring adversarial-review finding — don't skip it.
- **Cross-field Zod refinements get their own test.** If `addCriterionSchema.refine((d) => parseFloat(d.minScore) < parseFloat(d.maxScore))`, write tests for `min === max` AND `min > max`.
- **Co-locate test files:** `foo.router.spec.ts` next to `foo.router.ts`. Vitest config includes `src/**/*.spec.ts`.
- **Playwright E2E in `apps/web`** (devDependency `@playwright/test@1.49`); set up happens in a separate TEA workflow. Don't add E2E tests to story scope unless the story asks for them.

### Code Quality & Style Rules

- **File naming:** kebab-case for files (`criteria-manager.tsx`, `tournament.router.ts`). PascalCase for React components (`CriteriaManager`). camelCase for functions/variables. snake_case for DB columns. Drizzle exports: camelCase (`evaluationCriteria`).
- **DB table names:** snake_case, plural (`competitions`, `evaluation_criteria`, `judge_sessions`, `competitors`).
- **Foreign key columns:** `{referenced_table_singular}_id` (`competition_id`, `judge_id`).
- **Error handling:** Use `TRPCError` with structured codes (`NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `BAD_REQUEST`). Never raw string messages. Error codes defined in `packages/shared/errors/error-codes.ts`. User-facing messages are eventually i18n keys (Epic 8).
- **Comments:** default to writing no comments. Write one only when the WHY is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug). Never docstring obvious functions.
- **Prettier handles formatting** via Husky pre-commit on `*.{ts,tsx,json,md,yaml,yml}`. Don't fight it.

### Development Workflow Rules

- **Pre-implementation checklist for every new tRPC procedure** (added to prevent recurring review findings):
  - [ ] Zod schema with `.trim()` on strings, explicit min/max
  - [ ] RLS transaction with `SET LOCAL session.current_organizer_id`
  - [ ] Explicit ownership SELECT before mutations, throw NOT_FOUND if empty
  - [ ] `updatedAt: new Date()` in any UPDATE `.set()`
  - [ ] Try/catch around INSERT if unique constraint exists; map postgres `23505` → CONFLICT
  - [ ] Ownership-by-subquery for DELETE by id with `RETURNING id`
  - [ ] Auth test (`caller(null)` → UNAUTHORIZED)
  - [ ] Zod validation test (reject invalid input)
- **No new dependencies without explicit user approval.** Epic 2 shipped 12 FRs + 5 stories with zero new runtime deps after Story 2.1. This is a deliberate rule: use Node built-ins (`node:crypto`) and existing workspace packages (nanoid, zod) before reaching for new libraries.
- **BMAD story cycle:** CS (`/bmad-bmm-create-story`) → VS (optional validation) → DS (`/bmad-bmm-dev-story`) → CR (`/bmad-bmm-code-review`) → loop or ER (epic retrospective). Run each in a **fresh context window**. For code review, prefer a **different LLM than the one that implemented the story**.
- **Adversarial review is a required gate** before marking a story done. Story 2.2 [H1], 2.3 [H1], 2.4 [M1] all caught bugs that would have shipped.
- **Commit messages / PRs:** Follow repo style from `git log`. Don't amend unless the user explicitly asks. Never `--no-verify`, never `push --force` to `main`.

### Critical Don't-Miss Rules (Anti-Patterns & Gotchas)

- **Never import from `packages/formats/cypher-battles` in `apps/api`.** Platform modules interact with formats only through `CompetitionFormat` interface in `packages/format-sdk`. Direct imports break the format abstraction.
- **Never overwrite `score-submitted` events.** Overrides produce compensating events (`score-overridden`), appended to the event store. Original events are immutable (NFR11).
- **Never store raw judge tokens in the database.** Store SHA-256 hashes in `token_hash` column (see Story 2.5). Raw tokens are returned ONCE at creation time, never retrievable again. Use `node:crypto` (`createHash('sha256').update(raw).digest('hex')`), no hashing library needed.
- **`randomBytes(32).toString('hex')`** for judge tokens (256-bit entropy). Not nanoid — nanoid is for internal DB row IDs only.
- **Never set Drizzle defaults AND rely solely on them.** If `id` has `.$defaultFn(() => nanoid(21))`, the default fires at INSERT — but if someone bulk-inserts and forgets, you get nulls. Keep an eye on it.
- **`updatedAt` drift:** every UPDATE mutation must set `updatedAt: new Date()`. Forgetting it leaves audit trails stale.
- **TOCTOU on "check then insert":** for unique-constraint-backed fields (e.g., `participant_id` within a competition), race conditions pass the pre-check and blow up on INSERT. Catch pg error `23505` in the INSERT's try/catch.
- **`proxy.ts` not `middleware.ts`.** Next.js 16 convention. Creating `middleware.ts` will confuse the auth flow.
- **`shadcn` Button + `asChild` silently fails.** Uses `@base-ui/react`, not Radix. `buttonVariants()` className on `<Link>` is the pattern.
- **`onSuccess` in `useQuery` silently does nothing** (removed in TanStack Query v5). Lint doesn't always catch it. Use `useEffect` or derive state.
- **`react-hooks/set-state-in-effect`** lint rule (plugin v7) will fire when initializing form state from async query data inside `useEffect`. Use split-component pattern with `key={data.id}`.
- **No rate limiting on unauthenticated endpoints yet** (Story 3.3 Round 2 review added in-memory rate limiting for some; expand to all public procedures before shipping).
- **Append-only events table is the source of truth.** Full tournament state must be reconstructable from events alone (NFR21). Don't UPDATE event rows. Don't DELETE them. Compensate with new events.
- **Client-side score calculation is forbidden.** All scoring, aggregation, and ranking happens on the server. Client submits raw inputs; server computes everything. (NFR10, architecture rule.)
- **Every score submission must include a client-generated idempotency key.** Server deduplicates on retry. Scoped per judge session (composite unique index `(judge_session_id, idempotency_key)`) — not globally — to prevent cross-judge collisions.
- **Venue Wi-Fi is unreliable by assumption.** Every client-server interaction must handle disconnection: localStorage queue for scores, Service Worker retry, connection-state indicator (green/yellow/red).

---

## Usage Guidelines

**For AI Agents:**

- Read this file in full before implementing any code in this project.
- Follow ALL rules exactly as documented — when in doubt, choose the more restrictive option.
- When a rule references a specific Story (e.g., "Story 2.3 [H1]"), the fix lives in the adversarial review section of that story's markdown in `_bmad-output/implementation-artifacts/`. Reference it for the full context.
- If a new rule emerges during implementation (e.g., a new framework breaking change, a new recurring review finding), propose adding it here.
- Do not duplicate these rules in individual story Dev Notes — reference this file instead.

**For Humans (Dragonarka):**

- This file replaces the cumulative "CRITICAL Gotchas" section that was being copy-pasted (and growing) in every story's Dev Notes from 2.1 onward.
- Review quarterly; remove rules that are no longer load-bearing (e.g., when Next.js 16 surprises become muscle memory).
- Add rules here immediately when an adversarial review finds a pattern that applies beyond the specific story.
- When technology stack changes (e.g., Next.js 17, TanStack Query 6), update this file BEFORE starting any story that would touch the changed surface.

Last Updated: 2026-04-24
