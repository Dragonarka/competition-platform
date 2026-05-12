---
project_name: competition-platform
user_name: Dragonarka
date: 2026-05-11
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
  - recurring_patterns
status: complete
rule_count: 60
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
- **No hardcoded user-facing strings in `apps/web/src/`.** Route every label, placeholder, `aria-label`, `alt`, tooltip, and error message through `next-intl`. Server components → `getTranslations('Namespace')`; client components → `useTranslations('Namespace')`. Error codes from `packages/shared/errors/error-codes.ts` resolve through `getTrpcErrorI18nKey()` → `Errors.<CODE>` keys. Routing: import `Link`/`useRouter`/`usePathname` from `@/i18n/navigation` (NOT `next/link` / `next/navigation`) so locale prefixes propagate. CI parity + coverage scripts gate the lint task. See `apps/web/src/i18n/README.md`. (Story 8.1.)
- **Language switching uses the shared `<LanguageSwitcher>` from `@/components/i18n/language-switcher`.** Don't roll your own — the component handles cookie + localStorage + server-side persistence (`user.setPreference`) in one place. It mounts in every surface layout (admin / judge / public / presenter / auth). For organizers, `<OrganizerLocaleReconciler />` in the admin layout syncs the URL locale to the stored preference on every page render — cross-device propagation is next-page-load semantics, not real-time. (Story 8.2.)

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
- **When adding a new locale, update FOUR places.** (1) `apps/web/src/i18n/routing.ts` `locales` array, (2) `apps/web/messages/<code>.json` with full parity, (3) Zod enum in `packages/shared/validation/user.schema.ts` (`SUPPORTED_LOCALES`), (4) DB `CHECK (preferred_locale IN (...))` constraint on `users`. CI parity check catches the JSON; nothing catches Zod/CHECK drift automatically. (Story 8.2.)

---

## Recurring Patterns (Lifted from Epic 5/6/7 Retros)

These are patterns proven across multiple stories. When implementing a new procedure that touches the same surface, reach for these first.

### Four-Layer Idempotency Stack (Mutations)

Every event-producing mutation must defend against duplicate submission at four layers. Missing any layer creates a class of bugs that's hard to reproduce.

1. **Client-supplied idempotency key.** Scoped by the natural ownership boundary (per judge session, per organizer). Composite UNIQUE index in Drizzle: `uniqueIndex('uq_x_y').on(table.scopeId, table.idempotencyKey)`.
2. **Pre-insert SELECT on the idempotency key inside the same transaction.** Short-circuit with `{ success: true, idempotent: true }` if a row exists. Avoids unnecessary INSERT pressure on the index.
3. **TRY/CATCH on the INSERT with `23505` → `TRPCError('CONFLICT')`.** Maps PostgreSQL unique-violation to a usable client error. Catches the race where two concurrent submits both pass step 2.
4. **Sequence-collision retry for the event-store INSERT.** `events.sequence` is `(aggregate_id, aggregate_type)`-unique. On `23505`, re-read `max(sequence)` and retry (one shot is usually enough). See `submitScore`/`submitOrganizerScore` for the precedent. If you find yourself hand-rolling this for the third time, extract `insertEventOrRetry()`.

### Socket-Event Checklist (Adding a New WS Event)

When a new domain event needs broadcasting, ALL of these must change in lockstep:

1. **Payload interface** in `packages/shared/events/<domain>-events.ts`.
2. **Re-export** from `packages/shared/index.ts`.
3. **`ServerToClientEvents`** in `packages/shared/events/socket-event-map.ts` — add the event key and payload type.
4. **`ICompetitionGateway`** interface in `apps/api/src/modules/websocket/competition-gateway.interface.ts` — add the `broadcast<Event>` method signature.
5. **`CompetitionGateway`** implementation — implement `broadcast<Event>`, choose room fanout (admin / public / per-judge — match the precedent of the closest existing broadcast).
6. **`mockGateway` AND `makeFullGateway`** stubs in `tournament.router.spec.ts` — `vi.fn()` for the new method. Both must be updated, or typecheck fails.
7. **Procedure call site** — collect the payload in a `let broadcastPayload` outside the transaction, broadcast AFTER `db.db.transaction(...)` resolves. Never broadcast inside the tx.
8. **Per-hook listener** in `use-admin-socket.ts`, `use-judge-socket.ts`, `use-public-socket.ts` (as appropriate for the audience) — add `on<Event>?` option, register `socket.on(...)` inside the effect, forward to `optsRef.current.on<Event>?.(p)`.
9. **Consumer invalidation** in each subscriber view — `void utils.tournament.<query>.invalidate(...)` for every query whose result depends on this event.

If you're adding step 7 (procedure call site) without doing steps 1-6 first, you'll see a type error. That's intentional — the type system enforces the checklist.

### SSR + Client-Island Pattern (Public Pages)

Established in Story 6-1 and reused by 6-2/6-3. Use this for any public-facing page that needs:

- Server-rendered initial HTML (SEO, first-paint speed).
- Client-side reactivity (WebSocket updates, optimistic UI).

Recipe:

1. **Server component** (`page.tsx`) — calls `createServerTrpcClient()` (lives in `apps/web/src/lib/trpc-server.ts`), fetches initial data via the HTTP fallback path, passes it to the client island as a prop.
2. **Client island** (`<XClientIsland initialData={data} />`) — `'use client'`, uses `useQuery({ initialData })` to hydrate the same tRPC procedure. TanStack Query treats `initialData` as cache-warm.
3. **Socket subscription** — `usePublicSocket({ competitionId, onStandingsUpdated: (s) => utils.<query>.setData(...) })` for live updates.

**Don't use `appRouter.createCaller()`** for SSR — it pulls the entire NestJS DI graph into the Next.js runtime and breaks bootstrap. HTTP fallback keeps the API runtime sealed inside `apps/api`.

### Split-Component Pattern for Query-Data-Driven `useState`

TanStack Query v5 removed `onSuccess`/`onError` from `useQuery`. When you need to initialize `useState` from query data, do NOT call `setState` in the render body — `react-hooks/set-state-in-effect` will lint-error, and even when it doesn't, React 19 will re-render unpredictably.

The pattern:

```tsx
// OUTER: loader. Renders nothing useful until data arrives.
export function MyComponent({ id }: { id: string }) {
  const { data } = trpc.foo.useQuery({ id });
  if (!data) return <Skeleton />;
  // The `key` prop forces a fresh mount when `data.id` changes, so the inner
  // component's `useState` re-initializes from props correctly.
  return <MyComponentInner key={data.id} initialFoo={data.foo} />;
}

// INNER: pure render-from-props. `useState` initialized synchronously from
// props — no effect, no setState-in-render.
function MyComponentInner({ initialFoo }: { initialFoo: Foo }) {
  const [foo, setFoo] = useState(initialFoo);
  // ... rest of the component ...
}
```

Story 7-1 H1 fix is the canonical example. Story 7-2's `SimulationClient` redirect-on-non-simulation uses the simpler variant: `useEffect(() => { if (shouldRedirect) router.replace(...) })` — never call `router.replace()` directly in render.

### Helper-with-Mode Discriminator (Multi-Audience Procedures)

Established in Story 7-2 with `resolveOrganizerJudgeSession({ mode: 'solo' | 'simulation-cypher' | 'simulation-battles', ... })`. Use when:

- A single piece of logic must serve N modes that differ only in identity / lookup / labelling.
- You want downstream code to be MODE-BLIND (the "no special branches" architectural rule from Epic 7).

The helper takes a `mode` discriminator, derives the mode-specific parameters (labels, lock keys, lookup criteria) internally, and returns a uniform result. Call sites pass `mode` and get back a single shape. The procedure's tx flow past the helper call is identical across modes.

**This is preferable to** boolean flags (`isSimulation?: boolean`) which proliferate at the call site and don't compose. The discriminated union is also self-documenting in IDE tooltips.

### "Extract on Third Consumer" Discipline

Don't extract a helper on the second use. Three consumers is the right trigger. Two cases:

- Two uses might still diverge — extracting prematurely couples them.
- One use is a one-off; two is a pattern; three is a rule.

Precedents: `roundLabel` (Epic 6, extracted in 6-3 when presenter became the 3rd consumer), `resolveOrganizerJudgeSession` (Epic 7, extracted in 7-2 when simulation-cypher / simulation-battles / legacy-solo all needed find-or-create). Both extractions held without modification through their next story.

### Inline Two-Step Confirm for Destructive Actions

No modals during admin work — they block the flow (UX spec, Story 4-2 precedent). Pattern:

```tsx
const [confirming, setConfirming] = useState(false);
// ... when not confirming: <Button onClick={() => setConfirming(true)}>Reset</Button>
// ... when confirming: render a warning + <Button variant="destructive" onClick={mutate}>Confirm</Button>
//                      + <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
```

Examples: `score-override-form.tsx` (Story 4-2), `simulation-reset-panel.tsx` (Story 7-3).

### `broadcastEnrichedStandings` Pattern (Post-Commit Side Effects)

When a mutation must trigger a "recompute and broadcast derived state" after commit, use a dedicated helper (`broadcastEnrichedStandings`, etc.) rather than inlining the recompute at every call site. Story 6-1 H1 fix is the precedent — 5 broadcast sites were silently missing enrichment because the recompute was inlined and one call path forgot. The helper signature is:

```typescript
async function broadcastEnrichedStandings(
  db: DatabaseService,
  gateway: ICompetitionGateway,
  competitionId: string,
  triggeredBy: string, // for logging only
): Promise<void>;
```

The "trigger source" parameter is for the gateway log line — useful in production debugging.

### Real-DB Integration Test Triggers

A test belongs in `apps/api/src/trpc/routers/__integration__/*.int.spec.ts` (not the regular `*.spec.ts`) when:

- The procedure relies on RLS policy behaviour (`session.current_organizer_id`).
- The procedure has TOCTOU guards (`23505` unique-violation retries, advisory locks).
- A bug surfaced in production that the unit test missed — reproduce it as an integration test before fixing.
- Cross-procedure state mutation is under test (e.g., `startCypherPhase` → `submitScore` → `completeCypherPhase`).

Run with: `pnpm --filter @competition-platform/api test:integration`. See `apps/api/src/trpc/routers/__integration__/README.md`.

### Reset / Destructive-Operation Semantics

When a procedure destroys state, write the survival table BEFORE implementation:

| Table | Action                          | Why |
| ----- | ------------------------------- | --- |
| ...   | KEEP / UPDATE / DELETE / APPEND | ... |

This forces explicit decisions about edge cases (does this delete the audit trail? do real-user tokens survive?) before they bite. Story 7-3's spec is the canonical example.

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

Last Updated: 2026-05-12 (Story 8.2 — language switcher rule + adding-a-locale rule. Previous: Epic 7 retro pattern lift on 2026-05-11.)
