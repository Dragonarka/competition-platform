# Stage 1: Build everything
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# Copy workspace manifests first (Docker layer cache friendly)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

# Install all deps including dev (needed for tsc/nest build)
RUN pnpm install --frozen-lockfile

# Copy api source
COPY apps/api/ ./apps/api/

# Build packages topologically (^build), then the api itself.
# turbo respects the dependsOn graph in turbo.json.
RUN pnpm turbo run build --filter=@competition-platform/api

# Stage 2: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/

# Copy each package's manifest + compiled dist (NOT raw source) so pnpm
# resolves workspace deps to the built artifacts.
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/dist ./packages/shared/
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder /app/packages/db/drizzle.config.ts ./packages/db/
COPY --from=builder /app/packages/format-sdk/package.json /app/packages/format-sdk/dist ./packages/format-sdk/
COPY --from=builder /app/packages/formats/cypher-battles/package.json ./packages/formats/cypher-battles/
COPY --from=builder /app/packages/formats/cypher-battles/dist ./packages/formats/cypher-battles/dist
COPY --from=builder /app/packages/config-eslint ./packages/config-eslint/
COPY --from=builder /app/packages/config-typescript ./packages/config-typescript/

# Install prod deps for everything in scope
RUN pnpm install --frozen-lockfile --prod

# Compiled api output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
