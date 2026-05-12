#!/usr/bin/env bash
# First-time setup helper. Idempotent — safe to re-run.
# Brings up Docker services, copies env templates, installs deps, runs migrations.
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$1"; }

step "Checking prerequisites"
command -v node >/dev/null || { echo "node not installed"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not installed — run: corepack enable && corepack prepare pnpm@9.15.9 --activate"; exit 1; }
command -v docker >/dev/null || { echo "docker not installed"; exit 1; }
ok "node $(node -v), pnpm $(pnpm -v), docker present"

step "Copying env templates (if missing)"
copy_env() {
  local src="$1" dst="$2"
  if [ -f "$dst" ]; then
    ok "$dst already exists — leaving in place"
  elif [ -f "$src" ]; then
    cp "$src" "$dst"
    ok "Created $dst from $src"
    warn "Edit $dst and fill in CLERK_* keys before running pnpm dev"
  else
    warn "No template at $src — skipping $dst"
  fi
}
copy_env .env.example .env.local
copy_env .env.example apps/web/.env.local
copy_env .env.example apps/api/.env.local

step "Starting Docker services (Postgres + Redis)"
docker compose up -d
ok "Docker services up"

step "Installing dependencies"
pnpm install --frozen-lockfile
ok "Dependencies installed"

step "Applying database schema"
pnpm --filter @competition-platform/db db:push
ok "Schema synced"

step "Verifying health"
sleep 2
docker compose ps

cat <<'EOF'

╔══════════════════════════════════════════════════════════════╗
║  Setup complete.                                             ║
║                                                              ║
║  Next steps:                                                 ║
║    1. Add your Clerk keys to .env.local (and apps/*/.env)    ║
║    2. Start dev servers:        pnpm dev                     ║
║    3. Open:                     http://localhost:3000        ║
║                                                              ║
║  Health check:                  pnpm doctor                  ║
║  Reset everything:              pnpm reset                   ║
╚══════════════════════════════════════════════════════════════╝
EOF
