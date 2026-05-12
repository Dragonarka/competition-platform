#!/usr/bin/env bash
# Nuke local state and reset to a clean slate. Confirms before destroying data.
# Use when migrations get tangled or Docker volumes corrupt.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "This will:"
echo "  • Stop and remove Docker containers + volumes (LOCAL DB DATA WILL BE LOST)"
echo "  • Delete node_modules and build outputs"
echo "  • Keep .env.local files"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo ""
[[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Cancelled."; exit 0; }

echo "▶ Stopping containers and removing volumes"
docker compose down -v 2>/dev/null || true

echo "▶ Removing build artifacts"
rm -rf node_modules apps/*/node_modules apps/*/.next apps/*/dist packages/*/node_modules packages/*/dist

echo "▶ Reinstalling dependencies"
pnpm install --frozen-lockfile

echo "▶ Starting fresh services"
docker compose up -d
sleep 3

echo "▶ Applying schema"
pnpm --filter @competition-platform/db db:push

echo "✓ Reset complete. Run: pnpm dev"
