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

# Build
RUN pnpm --filter @competition-platform/api build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3001
# tsx as runtime loader handles TypeScript files from workspace packages
# (packages/db, packages/shared, etc. expose ./index.ts directly).
# TODO: replace with `node apps/api/dist/src/main.js` once each workspace
# package has its own build step emitting JS.
CMD ["node", "--import", "tsx/esm", "apps/api/dist/src/main.js"]
