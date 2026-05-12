#!/usr/bin/env bash
# Health check: verifies local dev environment is wired up correctly.
# Run anytime something feels off.
set -uo pipefail

cd "$(dirname "$0")/.."

pass() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$1"; FAILED=1; }
info() { printf "\033[1;36m·\033[0m %s\n" "$1"; }

FAILED=0
echo "── Tooling ──"
node -v 2>/dev/null | grep -q "v2[0-9]\|v[3-9][0-9]" && pass "Node $(node -v)" || fail "Node 20+ required"
pnpm -v 2>/dev/null | grep -qE "^9\." && pass "pnpm $(pnpm -v)" || fail "pnpm 9+ required"
docker info >/dev/null 2>&1 && pass "Docker daemon running" || fail "Docker not running"

echo ""
echo "── Services ──"
docker compose ps postgres 2>/dev/null | grep -q "Up\|running" && pass "Postgres container up" || fail "Postgres down (docker compose up -d)"
docker compose ps redis 2>/dev/null | grep -q "Up\|running" && pass "Redis container up" || fail "Redis down (docker compose up -d)"
nc -z localhost 5432 2>/dev/null && pass "Postgres :5432 reachable" || fail "Postgres :5432 not reachable"
nc -z localhost 6379 2>/dev/null && pass "Redis :6379 reachable" || fail "Redis :6379 not reachable"

echo ""
echo "── Env files ──"
for f in .env.local apps/web/.env.local apps/api/.env.local; do
  if [ -f "$f" ]; then
    pass "$f present"
    grep -q "^CLERK_SECRET_KEY=sk_" "$f" 2>/dev/null && info "  CLERK_SECRET_KEY looks set" || info "  CLERK_SECRET_KEY missing/blank in $f"
  else
    fail "$f missing (run pnpm setup)"
  fi
done

echo ""
echo "── Dev servers ──"
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q 200 && pass "API /health 200" || info "API not running (pnpm dev)"
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -qE "200|307" && pass "Web reachable" || info "Web not running (pnpm dev)"

echo ""
echo "── Build artifacts ──"
[ -d node_modules ] && pass "node_modules present" || fail "Run pnpm install"
[ -d apps/web/.next ] && info "apps/web/.next present (built)" || info "apps/web not yet built"

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "\033[1;32mAll checks passed.\033[0m"
  exit 0
else
  echo -e "\033[1;31mSome checks failed — fix the ✗ items above.\033[0m"
  exit 1
fi
