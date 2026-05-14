# Troubleshooting

Known quirks and their fixes. Run `pnpm doctor` first — it catches most environment issues.

## Local dev

### `useTranslations context not found` in any route

**Symptom:** Any locale-aware page (`/sign-in`, `/dashboard`, etc.) returns 500 with `Failed to call useTranslations because the context from NextIntlClientProvider was not found`.

**Cause:** A server-component layout renders a client component that calls `useTranslations` (e.g., `<LanguageSwitcher />`), but the layout didn't call `setRequestLocale(locale)` to seed next-intl's request-scoped context.

**Fix (applied):** Every nested route-group layout calls:

```tsx
import { setRequestLocale } from 'next-intl/server';

export default async function Layout({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // ...
}
```

This is the rule per next-intl docs. If you add a new layout, do the same.

---

### `Error: Invalid path: /(en|es)?/?dashboard(.*). Unexpected MODIFIER at 10`

**Symptom:** Dev server crashes on every request; middleware initialization fails.

**Cause:** Clerk's `createRouteMatcher` uses `path-to-regexp` v6, which does **not** support the `?` modifier on unnamed capture groups like `(en|es)?`.

**Fix (already applied):** `apps/web/src/proxy.ts` lists each locale variant explicitly:

```ts
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/es/dashboard(.*)',
  // …
]);
```

If you reintroduce `(en|es)?` patterns, this will crash again.

---

### `pnpm test` runs Playwright (and fails)

**Symptom:** `pnpm test` tries to run Playwright in the `@competition-platform/tests` workspace and errors on missing browsers.

**Cause:** The old script was `turbo run test` (no filter). Pulling `main` should bring the fixed script.

**Fix:** `package.json`'s `test` script now filters E2E:

```json
"test": "turbo run test --filter='!@competition-platform/tests'"
```

For E2E, use `pnpm test:e2e` explicitly.

---

### Postgres connection refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**

```sh
docker compose up -d
pnpm doctor
```

If Postgres still can't connect, the container may be unhealthy:

```sh
docker compose logs postgres | tail
```

---

### Clerk redirect loop on sign-in

**Cause:** `NEXT_PUBLIC_CLERK_*_URL` values in `.env.local` don't match the routes that actually exist (e.g., `/dashboard` vs `/admin/dashboard`).

**Fix:** Compare your env with `.env.example` and verify each path resolves in the running app.

---

### Migrations re-running or schema mismatch

If migrations get tangled in dev:

```sh
pnpm reset    # asks for confirmation; wipes Docker volumes and re-pushes schema
```

This is destructive — local data is lost. Don't run against any non-local DB.

---

### `EADDRINUSE: address already in use :::3000`

A previous dev process is still holding the port.

```sh
lsof -i :3000 -i :3001
kill <PID>
```

---

## Testing

### Playwright can't find browsers

```sh
pnpm test:e2e:install
```

### Test organizer can't sign in

If `tests/.auth/organizer.json` is stale or Clerk invalidated the session:

```sh
rm -rf tests/.auth
pnpm test:e2e   # global.setup.ts re-runs the Clerk flow
```

Make sure `TEST_ORGANIZER_EMAIL` / `TEST_ORGANIZER_PASSWORD` are in `tests/.env` (or `.env.local`).

### `test.skip(...)` everywhere

Most sample E2E specs ship skipped pending the corresponding story or env var. See `tests/README.md` → "When to Convert `test.skip` → `test`".

---

## CI

### `ENABLE_E2E` not set → E2E jobs skipped

Intentional. Set the repo variable in GitHub → Settings → Variables → Actions:

```
ENABLE_E2E = true
```

Also requires the 3 `TEST_ORGANIZER_*` secrets — see [CI secrets checklist](./ci-secrets-checklist.md).

### `pnpm test -- --filter=...` passes filter to workspace scripts

**Cause:** `--` in `pnpm run` forwards args to the underlying script (turbo, then to each workspace test command). Playwright sees `--filter=...` as its own flag.

**Fix:** Always use `pnpm turbo run test --filter='...'` directly when you want turbo-level filtering. Already applied across `ci.yml`, `test.yml`, and `scripts/ci-local.sh`.

---

## Production (Fly / Vercel / Neon / Upstash)

### Fly deploy: `husky: not found`

**Symptom:** `pnpm install --frozen-lockfile --prod` in the runner stage fails with `husky: not found` from the `prepare` script.

**Cause:** husky is in devDependencies. `--prod` skips it. But the `prepare` lifecycle script still tries to run `husky`.

**Fix (applied):** `prepare` in root package.json guards itself: `"prepare": "husky 2>/dev/null || true"`.

---

### Fly: `Region X is deprecated`

**Symptom:** `fly deploy` reports the configured region is deprecated and won't accept new resources.

**Cause:** Fly retires older edge regions periodically. The original `bog` (Bogotá) was deprecated in 2026.

**Fix:** Edit `fly.toml` → `primary_region = '<new-region>'` (`gru` for South America today). For South American workloads, `gru` (São Paulo) is the closest primary region.

---

### Fly app starts but `/health` times out

**Symptom:** Fly logs show Nest "application successfully started" but the proxy reports `waiting for machine to be reachable on 0.0.0.0:3001`.

**Cause:** NestJS bound to `127.0.0.1` by default before v11, or your `app.listen(port)` call defaulted to a specific interface.

**Fix (applied):** `app.listen(process.env.PORT ?? 3001, '0.0.0.0')` — explicit. Same for any new service.

---

### Fly: `Cannot find module '/app/apps/api/dist/main'`

**Symptom:** Container crash loop on startup.

**Cause:** NestJS SWC builder with `sourceRoot: 'src'` + `outDir: './dist'` emits to `dist/src/main.js`, not `dist/main.js`. Older Dockerfiles pointed at the wrong path.

**Fix (applied):** Dockerfile CMD is `node dist/src/main.js`.

---

### Workspace package: `ERR_UNSUPPORTED_DIR_IMPORT` or `Cannot find module @competition-platform/...`

**Symptom:** At runtime, the API can't resolve a workspace dependency.

**Cause:** Pre-fix, workspace packages exported `./index.ts` directly (raw TypeScript source). Node couldn't parse the `.ts` files at production runtime.

**Fix (applied):** Each `packages/*` package now ships compiled `dist/index.js` + `dist/index.d.ts`. `main`/`exports` point at `dist/`. Build runs via `pnpm turbo run build` which topo-orders the packages.

If you add a new package, mirror the pattern:

- `tsconfig.json`: `outDir: "./dist"`, `declaration: true`, `module: "commonjs"`
- `package.json`: `"build": "tsc"`, `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, full `exports` map, `"files": ["dist"]`.

---

### Vercel deploy: `No Next.js version detected`

**Symptom:** Web deploy fails immediately with "Make sure your package.json has 'next' in either dependencies or devDependencies. Also check your Root Directory setting matches the directory of your package.json file."

**Cause:** Vercel auto-detect found a `package.json` at the repo root that's NOT the Next.js app. The web project's Root Directory wasn't set to `apps/web`.

**Fix (applied):** Set `rootDirectory: "apps/web"` on the Vercel project (via dashboard or API: `PATCH /v9/projects/<id>`).

---

### Vercel deploy: `File size limit exceeded (100 MB)`

**Symptom:** Upload fails because the tarball is over 100 MB.

**Cause:** `.vercelignore` doesn't exclude `node_modules`, `.next`, `dist`, or similar artifacts.

**Fix (applied):** Root `.vercelignore` excludes all build artifacts. Vercel rebuilds them.

---

### Vercel /sign-in 500 in production

**Symptom:** `/sign-in` returns 500 in production while `/es/sign-in` works.

**Cause 1:** `setRequestLocale` not called in `(auth)/layout.tsx`. Fixed by the i18n fix above.

**Cause 2:** Clerk's `<SignIn>` can't initialize in static prerender. Pages should opt out:

```tsx
export const dynamic = 'force-dynamic';
```

Both fixes applied.

---

### Neon: `Directory import not supported`

**Symptom:** ESM error when importing from `packages/db/schema`.

**Cause:** ESM doesn't allow directory imports. `export * from './schema'` fails.

**Fix (applied):** Use explicit paths: `export * from './schema/index'` (or even `./schema/index.js` for strict ESM).

---

### Neon: slow first query of the session

**Symptom:** First DB query after idle takes 3-5 seconds.

**Cause:** Neon free tier auto-suspends after 5 min idle. First query wakes the compute.

**Fix:** Either upgrade to Neon Launch ($19/mo, no suspend) or pre-warm the DB before a competition:

```sh
curl https://competition-platform.fly.dev/health
# Trigger one tRPC call that hits the DB
```

---

### CORS error from web → API

**Symptom:** Browser console: `Access to fetch at 'https://competition-platform.fly.dev/trpc/...' from origin 'https://...vercel.app' has been blocked by CORS policy.`

**Cause:** `WEB_URL` secret on Fly doesn't match the Vercel production URL.

**Fix:**

```sh
fly secrets set WEB_URL="https://<your-vercel-url>" --app competition-platform
```

---

## BMAD

### `_bmad-output/spec-wip.md` not found

BMAD 6.3+ renamed singleton `spec-wip.md` → `spec-{slug}.md`. Look for the new file or run `/bmad-help` to see current state.

### Persona names `Barry` / `Quinn` / `Bob` in old docs

Merged into `Amelia` in BMAD 6.3+. Updates to docs are mechanical; replace as you go.

### Custom YAML overrides not applied

BMAD 6.4+ uses **TOML** only (`_bmad/custom/customize.toml`). Old `*.yaml` overrides are inert. Convert before upgrading.

---

## Still stuck?

1. `pnpm doctor` — prints exactly what's missing
2. Check `_bmad-output/sprint-status.yaml` for context
3. `git status` — am I on a clean branch?
4. `docker compose logs --tail 50` — what's the data plane saying?
5. Open an issue with the `pnpm doctor` output attached
