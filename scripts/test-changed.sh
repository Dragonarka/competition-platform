#!/bin/bash
# Run tests only for workspaces with changes since a base ref.
# Usage: ./scripts/test-changed.sh [base-ref]  (default origin/main)
set -euo pipefail

cd "$(dirname "$0")/.."

BASE_REF="${1:-origin/main}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "⚠ base ref '$BASE_REF' not found — running full test suite"
  pnpm test
  exit $?
fi

echo "▶ Running tests for workspaces changed since $BASE_REF"
pnpm --filter='...[HEAD]' --filter="...[$BASE_REF]" test
