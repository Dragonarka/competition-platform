# Production Deploy — May 13–14, 2026

Snapshot of the first end-to-end deployment.

## What went live

| Component                       | Where                                      | Status                                                                                            |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| API (NestJS + tRPC + Socket.IO) | Fly.io · `gru` (São Paulo) · scale-to-zero | 🟢 [competition-platform.fly.dev](https://competition-platform.fly.dev)                           |
| Web (Next.js 16 + Clerk)        | Vercel · iad1 build                        | 🟢 [competition-platform-web-green.vercel.app](https://competition-platform-web-green.vercel.app) |
| Docs (Docsify)                  | Vercel · static                            | 🟢 [competition-platform-docs.vercel.app](https://competition-platform-docs.vercel.app)           |
| Postgres                        | Neon · `us-east-1` · pooled · free tier    | 🟢 (migration to `sa-east-1` pending)                                                             |
| Redis                           | Upstash via Fly · `gru` · pay-as-you-go    | 🟢                                                                                                |
| Auth                            | Clerk · `pk_test_*` instance               | 🟢                                                                                                |

## Cost model

Designed to idle at **$0/mo** between competitions:

- API: Fly scale-to-zero — 0 machine-seconds when idle.
- Redis: Upstash pay-as-you-go — $0.20 per 100K commands. Idle = $0.
- Postgres: Neon free tier — suspends after 5 min idle, instant resume.
- Web/Docs: Vercel free tier — bandwidth covered.

Total expected during a live competition: pennies per hour.

## The journey — every fix that hit production

### Repo setup

| Commit    | What                                                      |
| --------- | --------------------------------------------------------- |
| `dc02b0c` | Playwright + global setup + CI fixes                      |
| `8b00286` | Documentation pass: README, CLAUDE.md, docs site scaffold |
| `851ea3b` | Escape `\|` in README troubleshooting table               |
| `12d26b2` | Switch docs site from Jekyll/Pages to Docsify on Vercel   |
| `e22f027` | `.vercelignore` for docs deploy                           |

### Fly.io deployment surgery

| Commit    | Bug found by deploy                                                            |
| --------- | ------------------------------------------------------------------------------ |
| `04ec27a` | `prepare` script crashed `pnpm install --prod` because `husky` was a devDep    |
| `2c348b0` | Fly deprecated the `bog` region — switched to `gru`                            |
| `3175e48` | `nest build` outputs `dist/src/main.js`, not `dist/main.js`; bind to `0.0.0.0` |
| `37a8a80` | Workspace packages ship TS source — added `tsx` as runtime loader              |
| `0ea4dd5` | pnpm hoists per-workspace — set `WORKDIR=apps/api` so Node finds `tsx`         |
| `706dd48` | ESM doesn't allow directory imports — explicit `./schema/index`                |
| `80dc3bb` | Stop trying to compile; run `src/main.ts` via tsx (workaround)                 |

### The proper fix: build the monorepo

| Commit    | What                                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d3307fa` | Added `build` scripts to all 4 workspace packages; CJS output with .d.ts; `main`/`exports` point at `dist/`. API runs on plain `node` again. Cold start dropped from ~5s to ~3.5s. |
| `2f7618c` | Dockerfile: copy entire pre-built workspace from builder → run `pnpm install --prod` to prune. Fixes pnpm workspace symlink resolution at runtime.                                 |

### Web deployment

| Commit                | What                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8c7a2ab`             | `apps/web/vercel.json` with monorepo build commands (`cd ../.. && turbo run build`).                                                                                                                                                                                      |
| `2cbf08d` + `0efccd8` | `setRequestLocale` in every nested route-group layout. Production SSR was 500ing on English (unprefixed) routes because nested layouts weren't seeding next-intl's request-scoped locale. (Previously dismissed as a "Turbopack quirk" — actually a real next-intl rule.) |
| `7c51734`             | `force-dynamic` on sign-in/sign-up pages. Clerk's `<SignIn>` can't initialize at static-prerender time.                                                                                                                                                                   |

## Architectural debt cleared

Three categories of issues that had been quietly waiting:

1. **Workspace packages had no build step.** `packages/db`, `packages/shared`, `packages/format-sdk`, `packages/formats/cypher-battles` all exposed `./index.ts` directly. Local dev worked because everything ran through `tsx watch`. Production runtime had no equivalent. Now each package ships compiled CJS + `.d.ts` to `dist/`, and the API runs as plain `node`.

2. **i18n locale was not propagated through nested layouts.** `setRequestLocale` was only called in `[locale]/layout.tsx`. Nested route-group layouts (`(auth)`, `(public)`, `(presenter)`, `(admin)`) all rendered locale-aware client components without seeding the request-scoped locale. Local dev was forgiving; Vercel SSR was not.

3. **Fly app config drift.** `fly.toml` pinned a deprecated region (`bog`) and the Dockerfile CMD pointed at a non-existent build path. Both bugs would have surfaced on the first real deploy regardless of when it happened.

## What's still pending

- Migrate Neon to `sa-east-1` (currently `us-east-1` — ~120ms round-trip to Fly `gru`).
- Regenerate the credentials that passed through chat (Clerk, Neon, Upstash).
- Connect Vercel projects to GitHub for auto-deploy on push (currently manual `vercel --prod`).
- Decide on a production Clerk instance (currently `pk_test_*`) and verified domain.
- Build out the actual user flow (sign-in → dashboard → competition CRUD) was scoped out of this deploy.

## Reproducing this from scratch

If you needed to rebuild the production stack from a clean repo state:

```sh
# 1. Repo + data plane
git clone <repo>
neon project create --name competition-platform-sa --region sa-east-1
fly redis create --name competition-platform-redis --region gru --plan "Pay-as-you-go" --enable-prodpack=false

# 2. Run migrations against Neon
DATABASE_URL=<neon-direct-url> pnpm --filter @competition-platform/db db:push

# 3. API to Fly
fly apps create competition-platform
fly secrets set DATABASE_URL="<neon-pooled>" REDIS_URL="<upstash>" CLERK_SECRET_KEY="<sk>" --app competition-platform
fly deploy --remote-only

# 4. Web to Vercel (with GitHub integration enabled)
git push origin main   # Vercel auto-deploys via webhook
```

End-to-end repeat time after the bugs are pre-fixed: ~10 minutes.
