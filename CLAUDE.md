# Competition Platform — Working Rules

Real-time WebSocket competition platform with game theory fairness. This file is the single source of truth for **how to work in this repo** — for humans and AI agents alike.

📐 For architecture diagrams and graphical explanations, see [`docs/`](./docs) — Docsify site deployable to Vercel (`vercel.json` at repo root).
🌱 For original vision and decisions, see [`PROJECT-SEED.md`](./PROJECT-SEED.md).

---

## 1. Stack at a glance

| Layer       | Tech                                      | Notes                                                 |
| ----------- | ----------------------------------------- | ----------------------------------------------------- |
| Frontend    | Next.js 16 (Turbopack) + React 19 + TW 4  | App Router, `[locale]` segment, RSC + client islands  |
| Backend     | NestJS 11 + tRPC + Socket.IO              | Modular monolith, single deploy unit                  |
| Data        | PostgreSQL 16 + Drizzle ORM               | RLS enforced at every protected procedure             |
| Cache / pub | Redis 7                                   | Socket.IO adapter + ephemeral state                   |
| Auth        | Clerk                                     | Multi-step email/password; RLS keyed by `clerkUserId` |
| i18n        | next-intl                                 | `en` (default, no prefix) + `es` (`/es/` prefix)      |
| Build       | Turborepo + pnpm 9                        | Workspaces in `apps/*` and `packages/*`               |
| E2E         | Playwright 1.59                           | 5 projects, mobile-judge included                     |
| Unit        | Vitest                                    | Co-located with src; `*.test.ts`                      |
| Deploy      | Fly.io (API) · TBD (web) · Neon · Upstash | See [`docs/deploy.md`](./docs/deploy.md)              |

---

## 2. Repo layout — what lives where

```
apps/
  web/              Next.js — RSC + client islands. proxy.ts is the middleware (NOT middleware.ts).
  api/              NestJS — tRPC routers + Socket.IO gateways. Drizzle queries here.
packages/
  db/               Drizzle schema, migrations, db client. RLS-aware transaction helper.
  shared/           Types + Zod schemas shared web↔api. SUPPORTED_LOCALES lives here.
  format-sdk/       Plugin SDK contract (manifest, scoring, UI surface).
  formats/          First-party format impls (Cypher Battles, etc.) consuming the SDK.
  config-eslint     Shared ESLint preset.
  config-typescript Shared tsconfig.
tests/              Playwright E2E. Page-object pattern. global.setup.ts handles Clerk auth.
scripts/            setup.sh, doctor.sh, reset.sh, ci-local.sh, burn-in.sh.
docs/               GitHub Pages site (architecture, workflows, deploy).
_bmad/              BMAD-method workflow inputs (agents, tasks, skills).
_bmad-output/       BMAD planning artifacts — PRDs, epics, stories, retros, traceability.
```

---

## 3. Core architectural rules

### RLS is non-negotiable

Every protected tRPC procedure wraps its DB work in a transaction that sets `session.current_organizer_id` (Clerk user ID) via the helper in `packages/db`. Bypassing RLS for "just one query" is a security incident waiting to happen. Tests use the same helper — see `withOrganizer(clerkUserId, fn)`.

### Type safety end-to-end

- Web ↔ API talk over **tRPC** — no untyped fetch, no manual zod parsing at the boundary, ever.
- DB ↔ API uses **Drizzle inferred types**. No `as any`. If a type is wrong, fix the schema.
- Shared shapes live in `packages/shared` and are imported by both apps.

### Plugin architecture for formats

Competition formats are pluggable modules implementing the `format-sdk` contract. Day-1 architectural decision (see [`memory/project_format_plugin_architecture.md`](./.claude/projects/-Users-dragonarka-git-competition-platform/memory/project_format_plugin_architecture.md)). Adding a new format means a new package under `packages/formats/`, not edits to core API or web.

### Single deployment unit (modular monolith)

The API is one NestJS process. Modules (`AuthModule`, `WebsocketModule`, `TrpcModule`, …) are organised internally but ship together. Don't split into microservices without a PRD-level decision.

### Next.js 16 is not the Next.js you know

- Middleware file is **`proxy.ts`**, not `middleware.ts`.
- Use Turbopack for dev; webpack is gone.
- App Router only. Every route lives under `apps/web/src/app/[locale]/...`.
- Read `apps/web/AGENTS.md` and `node_modules/next/dist/docs/` before assuming an API exists.

---

## 4. Conventions

### Code style

- Prefer editing existing files; create new ones only when warranted.
- No comments unless the _why_ is non-obvious (constraint, workaround, invariant). Names should carry the _what_.
- No backwards-compatibility shims, no `// removed:` markers, no `_unused` renames. Delete it.
- No abstractions for hypothetical future cases. Three similar lines beats a premature helper.

### Commits

- One purpose per commit. Reference the story slug when applicable (e.g., `feat(i18n): Story 8.2 …`).
- Co-authored trailer required for AI-driven commits: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Never amend a published commit. Never `--no-verify`. Never force-push to main.

### Tests

- Unit (Vitest) lives next to source as `*.test.ts`.
- E2E (Playwright) goes in `tests/e2e/*.spec.ts` with one user-journey per file.
- Selectors: `getByRole` / `getByLabel` / `getByText` > `data-testid` > CSS. Never style-class selectors.
- Mobile-only specs match `/.*judge.*\.spec\.ts/`.
- `pnpm test` excludes the E2E workspace; `pnpm test:e2e` runs Playwright separately.

### i18n

- All UI strings go through `useTranslations`/`getTranslations` namespaces (see `apps/web/messages/{en,es}.json`).
- New strings: add the key to **both** locales — CI catches missing keys.
- `as-needed` locale strategy: English routes have no prefix, Spanish gets `/es/`.

### Environment

- `.nvmrc` pins Node 24. CI uses `node-version-file: '.nvmrc'`.
- Three env files: `.env.local` (shared), `apps/web/.env.local`, `apps/api/.env.local`. `pnpm setup` seeds them from `.env.example`.
- Never commit `.env*`, `tests/.auth/`, or `_bmad-output/private/*`.

---

## 5. Workflows — how we ship

This repo runs on the [BMAD-method](https://github.com/bmad-code-org/BMAD-METHOD). The full catalog is at `/bmad-help`. The flow:

```
brief → PRD → epic → story → dev → test → review → retro
```

Each phase has a skill. Outputs land in `_bmad-output/` and are committed.

Most-used skills:

- `/bmad-bmm-create-story` — generate a story file with AC and tech notes
- `/bmad-bmm-dev-story` — execute a story (read AC, code, test, commit)
- `/bmad-bmm-quick-dev` — small enhancements without a full story
- `/bmad-tea-testarch-framework` — scaffold/extend Playwright infra
- `/bmad-tea-testarch-ci` — generate/repair GitHub Actions
- `/bmad-tea-testarch-trace` — traceability matrix story→test
- `/bmad-checkpoint-preview` (post-upgrade) — guided pre-commit human review

### Format design (project-specific)

- `/desire-a-format` — critical, agent-led conversation to design a new competition format. Matches against the [predefined catalog](./formats/predefined/) or drafts a structured implementation request. Outputs `formats/desires/desire-*.md` (and `formats/requests/request-*.md` if a new format is needed). Workflow doc: [`formats/README.md`](./formats/README.md).

Diagram: [`docs/workflows.md`](./docs/workflows.md).

---

## 6. CI / CD

| Workflow     | Trigger              | Stages                               |
| ------------ | -------------------- | ------------------------------------ |
| `ci.yml`     | every push + PR      | lint, typecheck, unit, build         |
| `test.yml`   | main/develop, weekly | sharded Playwright + burn-in (gated) |
| `deploy.yml` | push main            | Fly.io API deploy (gated)            |

- Local mirror: `./scripts/ci-local.sh`.
- Burn-in: `./scripts/burn-in.sh` (10 iterations of E2E suite — any failure fails CI).
- Secrets/variables checklist: [`docs/ci-secrets-checklist.md`](./docs/ci-secrets-checklist.md).
- Never put `${{ inputs.* }}` or user-controlled GitHub context (`github.event.*`) directly in `run:` blocks — always pass through `env:`.

---

## 7. Tooling — Claude Code specifics

| Tool / pattern                       | When                                           |
| ------------------------------------ | ---------------------------------------------- |
| `/bmad-*` skills                     | Anything story-shaped — let the workflow drive |
| Custom hooks under `.claude/hooks/`  | Pre/post-commit gates                          |
| `claude-mem` plugin (memory:)        | Persistent context across sessions             |
| `ui-ux-pro-max` plugin               | UI/UX review and component design              |
| Playwright MCP                       | Direct browser control for E2E debugging       |
| `Agent` tool with `Explore` / `Plan` | Large refactors and architectural decisions    |
| Background `Bash`                    | Dev servers, long builds, watchers             |

If a plugin isn't available, launch Claude Code from `~/git/` (where plugins are installed) and `cd` into this directory.

---

## 8. Gotchas

| Gotcha                                              | Why & how to handle                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `/sign-in` 500 on first hit                         | Turbopack cold-compile race with next-intl SSR forwarding. Refresh once.       |
| `pnpm test` running Playwright                      | Old script — fixed via `turbo filter`. Run `git pull` if you still see it.     |
| Clerk middleware `Invalid path: /(en                | es)?…`                                                                         | path-to-regexp v6 doesn't allow `?` on unnamed groups. Use explicit per-locale paths. |
| `useTranslations context not found`                 | Same Turbopack issue as the /sign-in 500. Transient.                           |
| Migrations re-running locally                       | `pnpm reset` to nuke volumes and re-push schema.                               |
| RLS error `current_organizer_id not set`            | Procedure didn't wrap in the transaction helper. Always use the helper.        |
| `pnpm dev` crashes with `EADDRINUSE`                | An old node process is holding the port. `lsof -i :3000 -i :3001` and kill it. |
| `_bmad-output/spec-wip.md` not found (post-upgrade) | Renamed to `spec-{slug}.md` in BMAD 6.3+.                                      |

---

## 9. Where to look next

| You want to…                     | Go to                                                     |
| -------------------------------- | --------------------------------------------------------- |
| Understand the system end-to-end | [`docs/architecture.md`](./docs/architecture.md)          |
| Add a new competition format     | [`packages/format-sdk/README.md`](./packages/format-sdk/) |
| Write or run E2E tests           | [`tests/README.md`](./tests/README.md)                    |
| Wire CI for a new check          | [`docs/ci.md`](./docs/ci.md)                              |
| Deploy / configure prod          | [`docs/deploy.md`](./docs/deploy.md)                      |
| Debug a workflow run             | `./scripts/ci-local.sh` then GitHub Actions tab           |
| See current sprint state         | `_bmad-output/sprint-status.yaml`                         |
| Read the originating vision      | [`PROJECT-SEED.md`](./PROJECT-SEED.md)                    |
