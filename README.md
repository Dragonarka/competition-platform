# Competition Platform

Real-time WebSocket competition platform with game theory fairness. Full-stack TypeScript monorepo.

📖 **Architecture & deep docs:** [GitHub Pages site](https://dragonarka.github.io/competition-platform/) (also under [`docs/`](./docs))

---

## Quickstart (≈3 minutes)

```sh
# 1. One-time setup — installs deps, brings up Postgres+Redis, runs migrations
pnpm setup

# 2. Add your Clerk keys to .env.local (and apps/web/.env.local, apps/api/.env.local)
#    Get them from https://dashboard.clerk.com → API Keys

# 3. Start everything
pnpm dev
```

Open <http://localhost:3000>. API health: <http://localhost:3001/health>.

> **First-render quirk:** Turbopack may serve a 500 on the very first cold compile of `/sign-in`. Refresh once — it goes away. See [troubleshooting](./docs/troubleshooting.md).

---

## What's in the box

| Layer       | Tech                                 | Port |
| ----------- | ------------------------------------ | ---- |
| Web         | Next.js 16 + React 19 + Tailwind 4   | 3000 |
| API         | NestJS 11 + tRPC + Socket.IO         | 3001 |
| DB          | PostgreSQL 16 + Drizzle ORM          | 5432 |
| Cache / pub | Redis 7                              | 6379 |
| Auth        | Clerk                                | —    |
| i18n        | next-intl (en + es, `as-needed`)     | —    |
| State       | Zustand + TanStack Query             | —    |
| Monorepo    | pnpm 9 + Turborepo                   | —    |
| E2E         | Playwright (5 projects incl. mobile) | —    |
| Unit        | Vitest                               | —    |

```
apps/
  web/                Next.js frontend
  api/                NestJS backend (tRPC + Socket.IO)
packages/
  db/                 Drizzle schema, migrations
  shared/             Cross-cutting types + Zod schemas
  format-sdk/         Plugin SDK for competition formats
  formats/            First-party format implementations
  config-eslint, config-typescript
tests/                Playwright E2E suite
docs/                 GitHub Pages site (architecture, workflows, deploy)
scripts/              setup / doctor / reset / CI helpers
_bmad/                BMAD-method workflow definitions
_bmad-output/         Planning artifacts (PRDs, stories, retros)
```

---

## Daily commands

| Run              | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `pnpm setup`     | First-time setup (idempotent — safe to re-run)       |
| `pnpm dev`       | Start web + api with hot reload                      |
| `pnpm doctor`    | Health check — env, services, ports                  |
| `pnpm reset`     | Nuke local state and rebuild (asks for confirmation) |
| `pnpm test`      | Unit tests (Vitest, all workspaces except E2E)       |
| `pnpm test:e2e`  | Playwright E2E suite                                 |
| `pnpm lint`      | ESLint across the monorepo                           |
| `pnpm typecheck` | TypeScript strict check                              |
| `pnpm build`     | Production build                                     |
| `pnpm format`    | Prettier write                                       |

---

## Testing on your phone

### Same WiFi (no auth)

```sh
ipconfig getifaddr en0          # get your Mac's LAN IP
# update apps/web/.env.local: NEXT_PUBLIC_API_URL=http://<LAN_IP>:3001
pnpm dev
# open http://<LAN_IP>:3000 on phone
```

### With Clerk auth — use a tunnel

```sh
brew install cloudflared
cloudflared tunnel --url http://localhost:3000   # public HTTPS URL
cloudflared tunnel --url http://localhost:3001   # second terminal
```

Then add both tunnel URLs to Clerk → **Paths** → Allowed origins.

---

## CI / CD

Three GitHub Actions workflows:

| Workflow     | When                  | What                                                 |
| ------------ | --------------------- | ---------------------------------------------------- |
| `ci.yml`     | every push + PR       | lint → typecheck → unit → build                      |
| `test.yml`   | main/develop + weekly | sharded Playwright + burn-in (gated by `ENABLE_E2E`) |
| `deploy.yml` | push to main          | Fly.io deploy of API (gated by `ENABLE_DEPLOY`)      |

Required secrets/variables: see [`docs/ci-secrets-checklist.md`](./docs/ci-secrets-checklist.md).

---

## Deployment

Currently:

- **API** → Fly.io Bogotá (`fly.toml`, scale-to-zero, 512MB shared VM). Triggered by `ENABLE_DEPLOY=true` + `FLY_API_TOKEN`.
- **Web** → not yet configured (decision pending: Vercel vs Fly with Dockerfile).
- **DB / Redis** → planned: Neon Serverless + Upstash. Currently local Docker only.

Full deploy guide: [`docs/deploy.md`](./docs/deploy.md).

---

## BMAD workflows

This repo uses [BMAD-method](https://github.com/bmad-code-org/BMAD-METHOD) for planning, story execution, and test architecture. Invoke via slash commands:

```
/bmad-help                          → catalog of all workflows
/bmad-bmm-create-story              → start a new story
/bmad-bmm-dev-story                 → execute a story
/bmad-tea-testarch-framework        → scaffold/extend test infra
/bmad-tea-testarch-ci               → wire/repair CI
```

Inputs live in [`_bmad/`](./_bmad), outputs in [`_bmad-output/`](./_bmad-output). See [`docs/workflows.md`](./docs/workflows.md).

---

## Troubleshooting

| Symptom                              | Fix                                                        |
| ------------------------------------ | ---------------------------------------------------------- |
| `pnpm setup` fails on docker         | Start Docker Desktop, retry                                |
| `/sign-in` returns 500 on cold start | Turbopack first-compile quirk — refresh once               |
| `useTranslations context not found`  | Same as above; transient                                   |
| Postgres connection refused          | `docker compose up -d` then `pnpm doctor`                  |
| Clerk redirect loop                  | Check `NEXT_PUBLIC_CLERK_*_URL` values in `.env.local`     |
| `pnpm test` runs Playwright          | Update to latest — script now filters out E2E workspace    |
| `Invalid path: /(en\|es)?...`        | Old Clerk middleware bug, fixed in `apps/web/src/proxy.ts` |

More: [`docs/troubleshooting.md`](./docs/troubleshooting.md).

---

## License

Proprietary. © Dragonarka.
