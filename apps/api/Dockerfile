# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/api/ ./apps/api/

# Type-check only — `nest build` validates the codebase but the runtime
# executes TS source via tsx because workspace packages
# (packages/db, packages/shared, etc.) expose ./index.ts directly with
# no build step. Until each package emits compiled JS, tsx is the
# pragmatic runtime.
RUN pnpm --filter @competition-platform/api typecheck

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile --prod

# Copy the TypeScript source — tsx runs it directly.
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

WORKDIR /app/apps/api
EXPOSE 3001
# TODO: switch to `node dist/src/main.js` once each workspace package
# has its own build step emitting JS.
CMD ["node_modules/.bin/tsx", "src/main.ts"]
