# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

# Install all deps (including dev — needed for tsc and nest build)
RUN pnpm install --frozen-lockfile

COPY apps/api/ ./apps/api/

# Build packages topologically (^build), then the api.
RUN pnpm turbo run build --filter=@competition-platform/api

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@9

# Copy the entire pre-built workspace from the builder stage. We rely
# on pnpm install --prod to prune devDependencies in place. This is
# simpler than cherry-picking each dist/ and avoids workspace symlink
# resolution issues.
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/turbo.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Install prod deps. The workspace symlinks resolve to the pre-built
# packages (dist/ is included; src/ may or may not be — doesn't matter
# because main/exports point at dist/).
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
