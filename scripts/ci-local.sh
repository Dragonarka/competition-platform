#!/bin/bash
# Mirror the CI test pipeline locally (lint + typecheck + unit + build).
# Usage: ./scripts/ci-local.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "▶ pnpm lint"
pnpm lint

echo "▶ pnpm typecheck"
pnpm typecheck

echo "▶ pnpm test (unit — excludes E2E workspace)"
pnpm turbo run test --filter='!@competition-platform/tests'

echo "▶ pnpm build"
pnpm build

echo "✅ Local CI pass"
