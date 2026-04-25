#!/bin/bash
# Local burn-in loop — runs Playwright E2E N times, fails on first flake.
# Requires: postgres + redis running, API + Web started (see docs/ci.md).
# Usage: ./scripts/burn-in.sh [iterations]  (default 10)
set -euo pipefail

cd "$(dirname "$0")/.."

ITERATIONS="${1:-10}"
echo "🔥 Burn-in — $ITERATIONS iterations"

for i in $(seq 1 "$ITERATIONS"); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔥 Iteration $i/$ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  pnpm --filter @competition-platform/tests exec playwright test --project=chromium || {
    echo "❌ Flake detected at iteration $i"
    exit 1
  }
done

echo "✅ Burn-in clean — no flakes across $ITERATIONS iterations"
