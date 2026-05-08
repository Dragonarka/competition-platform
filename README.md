# Competition Platform

Real-time WebSocket competition platform with game theory fairness. Full-stack TypeScript monorepo using Next.js, NestJS, Socket.IO, and Drizzle ORM.

## Tech Stack

| Layer     | Technology                         |
| --------- | ---------------------------------- |
| Frontend  | Next.js 16 + React 19 + Tailwind 4 |
| Backend   | NestJS 11 + Socket.IO              |
| API Layer | tRPC (type-safe end-to-end)        |
| Database  | PostgreSQL 16 + Drizzle ORM        |
| Cache     | Redis 7                            |
| Auth      | Clerk                              |
| State     | Zustand                            |
| Monorepo  | pnpm workspaces + Turborepo        |

## Project Structure

```
apps/
  web/          → Next.js frontend (port 3000)
  api/          → NestJS backend  (port 3001)
packages/
  db/           → Drizzle schema, migrations, database client
  shared/       → Shared types and Zod schemas
  format-sdk/   → Competition format SDK
  formats/      → Competition format definitions
  config-eslint/
  config-typescript/
tests/          → Playwright E2E tests
```

## Prerequisites

- **Node.js** >= 20 (see `.nvmrc` for exact version)
- **pnpm** >= 9
- **Docker** (for PostgreSQL + Redis)

```sh
# If using nvm
nvm use

# Install pnpm if needed
corepack enable && corepack prepare pnpm@9.15.9 --activate
```

## Local Setup

### 1. Install dependencies

```sh
pnpm install
```

### 2. Start databases

```sh
docker compose up -d
```

This starts:

- **PostgreSQL** on `localhost:5432` (user: `postgres`, password: `postgres`, db: `competition_platform`)
- **Redis** on `localhost:6379`

### 3. Configure environment

```sh
cp .env.example .env.local
```

Edit `.env.local` and add your **Clerk** keys from [clerk.com/dashboard](https://dashboard.clerk.com):

```
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

The database and Redis URLs are pre-configured for local Docker.

### 4. Run database migrations

```sh
pnpm --filter @competition-platform/db db:push
```

### 5. Start development

```sh
pnpm dev
```

This runs both apps in parallel via Turborepo:

- **Web**: http://localhost:3000
- **API**: http://localhost:3001

## Testing on Your Phone (Local Network)

### Option A: Same WiFi (simplest)

If your Mac and phone are on the same WiFi network:

1. Find your Mac's local IP:

```sh
ipconfig getifaddr en0
```

2. The API needs to accept connections from your phone. Create/update `.env.local`:

```
NEXT_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3001
```

3. Restart `pnpm dev` and open `http://<YOUR_LOCAL_IP>:3000` on your phone's browser.

> **Note:** Clerk auth callbacks may not work with raw IPs. For full auth testing, use a tunnel (Option B or C).

### Option B: Cloudflare Tunnel (recommended, free)

[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) gives you a public HTTPS URL for free, no account required for quick tunnels.

```sh
# Install
brew install cloudflared

# Tunnel the frontend
cloudflared tunnel --url http://localhost:3000
```

This prints a public URL like `https://random-words.trycloudflare.com`. Open it on your phone.

For the API too (in a second terminal):

```sh
cloudflared tunnel --url http://localhost:3001
```

Then update `.env.local` so the frontend points to the API tunnel:

```
NEXT_PUBLIC_API_URL=https://<api-tunnel-url>
```

### Option C: ngrok

```sh
# Install
brew install ngrok

# You need a free account — sign up at ngrok.com and add your authtoken
ngrok config add-authtoken <YOUR_TOKEN>

# Tunnel the frontend
ngrok http 3000
```

Same idea — you get a public URL. For the API, run a second tunnel on port 3001.

### Clerk Setup for Tunnels

When using tunnels, add your tunnel URL to Clerk's allowed redirect URLs:

1. Go to [Clerk Dashboard](https://dashboard.clerk.com) > Your app > **Paths**
2. Add your tunnel URL to the allowed origins

## Available Scripts

| Command                 | Description                      |
| ----------------------- | -------------------------------- |
| `pnpm dev`              | Start all apps in dev mode       |
| `pnpm build`            | Build all packages and apps      |
| `pnpm lint`             | Lint all packages                |
| `pnpm typecheck`        | Type-check all packages          |
| `pnpm test`             | Run unit tests (Vitest)          |
| `pnpm test:e2e`         | Run Playwright E2E tests         |
| `pnpm test:e2e:ui`      | Run E2E tests with Playwright UI |
| `pnpm test:e2e:install` | Install Playwright browsers      |
| `pnpm format`           | Format code with Prettier        |

## Deployment

The API is configured for [Fly.io](https://fly.io) deployment (see `fly.toml`):

```sh
fly deploy
```

Deploys the NestJS API to the BOG (Bogota) region.
