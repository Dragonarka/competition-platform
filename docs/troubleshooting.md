---
title: Troubleshooting
nav_order: 6
---

# Troubleshooting

Known quirks and their fixes. Run `pnpm doctor` first — it catches most environment issues.

## Local dev

### `/sign-in` returns 500 on the first cold compile

**Symptom:** First request to `/sign-in` (or any locale-aware page) after `pnpm dev` returns 500 with `Failed to call useTranslations because the context from NextIntlClientProvider was not found`. Refresh succeeds.

**Cause:** Turbopack + next-intl SSR forwarding race during cold compile. The server-side render of `LanguageSwitcher` (client component using `useTranslations`) lands before `NextIntlClientProvider`'s message context is wired through. The recompile fixes it.

**Fix:** Refresh once. It does not affect production builds.

---

### `useTranslations context not found` in dev

Same root cause as above. Transient. If it persists across refreshes, restart `pnpm dev`.

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
