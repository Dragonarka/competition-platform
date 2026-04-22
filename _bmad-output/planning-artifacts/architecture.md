---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-04-05'
lastStep: 8
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/product-brief-competition-platform-2026-03-24.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/planning-artifacts/research/technical-competition-platform-tech-stack-research-2026-03-24.md'
workflowType: 'architecture'
project_name: 'competition-platform'
user_name: 'Dragonarka'
date: '2026-04-04'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
64 FRs spanning 9 domains. The architectural core is the competition lifecycle: configure competition → assign judges → run Cypher scoring phase → calculate rankings → advance top N → generate Battles bracket → collect votes → progress bracket → determine winner. Every step requires real-time state broadcast and immutable audit logging.

Key FR clusters with architectural impact:

- **FR1-FR10** (Configuration): Template-based setup with reusable evaluation criteria — requires flexible schema design
- **FR11-FR19** (Cypher): Judge group assignment, parallel scoring, score aggregation — requires concurrent write handling and real-time aggregation pipeline
- **FR20-FR27** (Battles): Bracket generation, voting, tie-breaking, odd-number handling — requires formal state machine for bracket progression
- **FR28-FR35** (Judge Interface): Zero-signup access, offline scoring, retry queues, session persistence — requires Service Worker architecture and local-first data strategy
- **FR36-FR44** (Admin): Live dashboard, override with audit, phase transition control — requires admin WebSocket namespace with full state visibility
- **FR45-FR49** (Public State): Projected screen displays, real-time updates — requires unauthenticated read-only WebSocket subscriptions
- **FR50-FR55** (Simulation): Full competition flow with organizer as all roles — simulation and live share identical code paths, differentiated only by data source

**Non-Functional Requirements:**
27 NFRs across 4 categories. Architecture-shaping NFRs:

- **Performance**: <500ms score round-trip (NFR1), <10s leaderboard update (NFR3), <1s judge interface load (NFR4), <5s WebSocket reconnection (NFR6)
- **Security**: TLS everywhere (NFR8), 15-min JWT expiry (NFR9), server-authoritative state (NFR10), append-only event store (NFR11), mandatory override reasons (NFR12), RLS data isolation (NFR13)
- **Reliability**: 99.9% uptime during events (NFR16), zero data loss (NFR17), 5-min offline retry queue (NFR18), full state recovery from event store (NFR21)
- **Scalability**: 50+ concurrent WebSocket connections MVP (NFR22), 200+ participants per competition (NFR24), <$15/mo idle cost (NFR25)

**Scale & Complexity:**

- Primary domain: Real-time competition management (full-stack)
- Complexity level: Medium-High
- Estimated architectural components: 6 bounded contexts (Auth, Tournament, Competition Engine, Scoring, User, WebSocket Gateway) + 2 infrastructure layers (Event Store, Real-Time Pub/Sub)

### Technical Constraints & Dependencies

- **Solo developer** — architecture must minimize operational overhead (managed services over self-hosted)
- **30-day MVP timeline** — modular monolith, not microservices; single deployment unit
- **Fly.io deployment** — Docker-based, region-selectable, scale-to-zero capable
- **Clerk for auth** — managed, SOC 2 compliant, zero-ops, JWT-based
- **PostgreSQL + Redis** — persistent event store + real-time pub/sub backplane
- **Venue Wi-Fi is unreliable** — every client-server interaction must handle disconnection gracefully
- **Money is involved in competitions** — scoring integrity is a legal/trust requirement, not just a nice-to-have

### Cross-Cutting Concerns Identified

1. **Event Sourcing** — spans Scoring, Tournament, Competition Engine. All state-changing operations must emit immutable events to the append-only store
2. **Real-Time Sync** — spans all modules. WebSocket gateway must multiplex events from multiple bounded contexts to role-appropriate client views
3. **Connection Resilience** — spans Judge Interface, Admin Dashboard, Public View. Every client needs local queue + reconnection + state recovery
4. **Authentication & Authorization** — spans all endpoints. Clerk JWT for organizers, unguessable tokens for judges, unauthenticated for public views
5. **Audit Trail** — spans Scoring and Admin operations. Every override, score modification, and phase transition must be traceable
6. **Multi-Tenancy** — spans all data access. PostgreSQL RLS must be enforced consistently across all queries
7. **Internationalization** — spans all UI layers. Spanish/English with runtime switching, no hardcoded strings
8. **Format Abstraction** — spans Scoring, Competition, Tournament, and all frontend views. All format-specific logic (scoring rules, phase structure, UI, validation) must flow through the `CompetitionFormat` interface. Platform code must never reference Cypher Battles directly — always go through the Format Runtime

## Starter Template Evaluation

### Primary Technology Domain

Full-stack real-time web application based on project requirements analysis. Monorepo architecture (solo developer preference) with NestJS backend + Next.js frontend.

### Technical Preferences Established

- **Monorepo**: Single repo (solo developer)
- **ORM**: Drizzle (user preference — lighter, closer to SQL, better edge compatibility than Prisma)
- All other stack decisions confirmed from research: TypeScript, NestJS, Next.js 16, Tailwind + shadcn/ui, Socket.IO, Clerk, XState, Fly.io, pnpm, Turborepo

### Starter Options Considered

|                       | oNo500/nestjs-boilerplate | barisgit/expo-template | vndevteam/nestjs-turbo |
| --------------------- | ------------------------- | ---------------------- | ---------------------- |
| **Stars**             | 48                        | 27                     | 60                     |
| **Turborepo + pnpm**  | Yes                       | Yes                    | Yes                    |
| **Drizzle**           | Yes                       | No (TypeORM)           | No (TypeORM)           |
| **Socket.IO**         | No                        | Yes                    | No                     |
| **Tailwind + shadcn** | Yes                       | Yes                    | No                     |
| **DDD Architecture**  | Yes                       | No                     | No                     |

No existing starter matches all requirements. The closest (oNo500/nestjs-boilerplate) has Drizzle + shadcn + Tailwind + DDD but lacks Socket.IO. Low star counts across all options indicate niche community.

### Selected Starter: Custom Scaffold Using Official CLIs

**Rationale for Selection:**
The project's specific architecture (event sourcing, XState state machine, DDD bounded contexts, Socket.IO, Drizzle, role-based views) means any template would require gutting and rewriting. Official CLIs guarantee latest versions (NestJS 11, Next.js 16, Drizzle latest) with zero dead code. Use oNo500/nestjs-boilerplate as architecture reference for DDD + Drizzle + Turborepo patterns.

**Initialization Command:**

```bash
# 1. Create Turborepo monorepo
pnpm dlx create-turbo@latest competition-platform --package-manager pnpm

# 2. Inside the monorepo, scaffold:
#    apps/api     → NestJS backend (nest new)
#    apps/web     → Next.js frontend (create-next-app with Tailwind + shadcn)
#    packages/db  → Drizzle schema + migrations (shared)
#    packages/shared → TypeScript types, DTOs, event contracts
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript strict mode across all packages. Shared tsconfig in `packages/config-typescript`.

**Styling Solution:**
Tailwind CSS + shadcn/ui (copy-paste components) + Tremor (dashboard) + Framer Motion (animations). Dark mode from day one.

**Build Tooling:**
Turborepo for parallel builds and caching. SWC for fast compilation. Docker multi-stage builds for production.

**Testing Framework:**
Vitest (unit + integration) + Playwright (E2E) + k6 (WebSocket load testing).

**Code Organization:**

```
competition-platform/
├── apps/
│   ├── api/          → NestJS modular monolith (DDD bounded contexts)
│   └── web/          → Next.js (admin, judge, presenter, public views)
├── packages/
│   ├── db/           → Drizzle schema, migrations, seed
│   ├── shared/       → TypeScript types, DTOs, event contracts, constants
│   ├── config-eslint/
│   └── config-typescript/
├── docker-compose.yml  → PostgreSQL + Redis for local dev
├── turbo.json
└── package.json
```

**Development Experience:**
pnpm workspaces + Turborepo caching. Docker Compose for local PostgreSQL + Redis. ESLint + Prettier with shared configs. Husky + lint-staged for pre-commit hooks. GitHub Actions CI/CD → Fly.io.

**Note:** Project initialization using this scaffold should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- tRPC for end-to-end type-safe API communication
- Single append-only event store table for scoring integrity
- Judge invite tokens (cryptographic, competition-scoped, no account required)
- WebSocket single namespace with role-based rooms
- TanStack Query + Zustand for frontend state management

**Important Decisions (Shape Architecture):**

- Redis scoped to real-time state + pub/sub + session cache only
- Structured error codes across REST and WebSocket
- localStorage + Service Worker for offline score queuing
- Neon serverless connection pooler for production
- Zod-validated environment configuration

**Deferred Decisions (Post-MVP):**

- API versioning (not needed until external consumers exist)
- CDN caching strategy (Cloudflare free tier handles static assets)
- Multi-region database replication topology
- Rate limiting thresholds (tune based on real event data)
- Open-source format registry/marketplace (formats distributed via npm initially)
- Format hot-loading without platform redeployment

### Data Architecture

| Decision         | Choice                            | Rationale                                                                                                                                                                                                                              |
| ---------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP API**     | tRPC                              | End-to-end type safety, zero API boilerplate, ideal for solo dev with shared monorepo. Auto-complete from backend to frontend eliminates DTO drift                                                                                     |
| **ORM**          | Drizzle                           | Lighter than Prisma, closer to SQL, better edge compatibility. Schema defined in `packages/db` shared across monorepo                                                                                                                  |
| **Database**     | PostgreSQL (Neon Serverless)      | Scale-to-zero between events, ~$7.66/mo active. Built-in connection pooler via `@neondatabase/serverless`                                                                                                                              |
| **Cache**        | Redis (Upstash serverless)        | Scoped to: (a) Socket.IO pub/sub backplane, (b) active competition state (current round, connected judges, live scores), (c) judge session tokens. Pay-per-request, no idle cost                                                       |
| **Event Store**  | Single append-only `events` table | Columns: `id`, `type`, `aggregate_id`, `aggregate_type`, `payload` (JSONB), `sequence`, `created_by`, `created_at`. Simple, proven pattern. All scoring decisions, phase transitions, and admin overrides recorded as immutable events |
| **Migrations**   | Drizzle Kit                       | Schema-driven migrations generated from Drizzle schema definitions. Stored in `packages/db/migrations`                                                                                                                                 |
| **Local Dev DB** | Docker Compose PostgreSQL + Redis | Standard `pg` driver for local development. Matches production schema via shared Drizzle config                                                                                                                                        |

### Authentication & Security

| Decision            | Choice                      | Rationale                                                                                                                                                                                                       |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organizer Auth**  | Clerk (JWT)                 | SOC 2 compliant, zero-ops. Email + OAuth. Short-lived JWT (15-min) with refresh tokens                                                                                                                          |
| **Judge Auth**      | Cryptographic invite tokens | Organizer generates competition-scoped link with nanoid/UUID v4 token. Judge clicks link → enters display name → receives session. No account creation. Shareable via WhatsApp. Token scoped to one competition |
| **Public Views**    | Unauthenticated             | Projected screens and competitor standings accessible via public URL. Read-only WebSocket subscription, no auth required                                                                                        |
| **WebSocket Auth**  | Role-based guards           | Organizers: Clerk JWT sent during WS handshake. Judges: invite token validated on connection. Public: unauthenticated, read-only events only. NestJS WebSocket guards enforce per-connection                    |
| **Data Isolation**  | PostgreSQL RLS              | `current_setting('session.current_organization_id')` set per request. Database-enforced — even buggy queries can't leak cross-tenant data                                                                       |
| **Score Integrity** | Server-authoritative        | All score validation, aggregation, and ranking on server. Client submits raw input, server computes everything. No client-side game state computation                                                           |

### API & Communication Patterns

| Decision            | Choice                            | Rationale                                                                                                                                                                               |
| ------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP API**        | tRPC                              | Shared router definitions in monorepo. Next.js client consumes with full type inference. No Swagger/OpenAPI for MVP (tRPC explorer for dev tooling)                                     |
| **Real-time**       | Socket.IO (single namespace)      | One namespace per competition. Role-based rooms: `competition:{id}:admin`, `competition:{id}:judge:{judgeId}`, `competition:{id}:public`. Guards enforce room membership based on auth  |
| **Event contracts** | Shared TypeScript types           | WebSocket event types defined in `packages/shared/events`. Both server and client import same types. Type-safe emit/listen                                                              |
| **Error handling**  | Structured error codes            | Format: `{ code: "SCORE_OUTSIDE_RANGE", message: "...", details: {...} }`. Consistent across tRPC errors and WebSocket error events. Error codes enumerated in `packages/shared/errors` |
| **Idempotency**     | Client-generated idempotency keys | Every score submission includes a unique key. Server deduplicates on retry. Critical for offline queue replay                                                                           |

### Frontend Architecture

| Decision                  | Choice                                  | Rationale                                                                                                                                                 |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server state**          | TanStack Query                          | Data fetching, caching, mutations for tRPC calls. Cache invalidation triggered by WebSocket events                                                        |
| **Client state**          | Zustand                                 | UI state, local form data, scoring in-progress state. Lightweight, no boilerplate                                                                         |
| **Real-time integration** | Socket.IO client → TanStack Query cache | WebSocket events invalidate or directly update TanStack Query cache. Zustand stores for ephemeral UI state (connection status, typing indicators)         |
| **Offline scoring**       | localStorage + Service Worker           | Scores persist to localStorage on every keystroke. Service Worker queues failed submissions and retries on reconnection. Sufficient for MVP score queuing |
| **Routing**               | Next.js App Router                      | Role-based route groups: `(admin)/`, `(judge)/`, `(presenter)/`, `(public)/`. Middleware enforces auth per group                                          |
| **Rendering**             | PPR (Partial Prerendering)              | Admin dashboard: static shell + streaming dynamic content. Judge interface: minimal client-side JS for fast mobile load. Public views: server-rendered    |

### Infrastructure & Deployment

| Decision               | Choice                                            | Rationale                                                                                                                         |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting**            | Fly.io                                            | Docker-based, 30+ regions, scale-to-zero. Deploy near physical event location with `fly deploy --region`                          |
| **CI/CD**              | GitHub Actions → Fly.io                           | Lint → type check → test → build → deploy. ~5 min pipeline                                                                        |
| **Environment config** | `.env` + Fly.io secrets + Zod validation          | `.env.local` for dev, Fly.io secrets for production. Zod schema validates all env vars at startup — fail fast on misconfiguration |
| **DB connection**      | Neon serverless pooler (prod) / pg driver (local) | `@neondatabase/serverless` for production with built-in pooling. Standard `pg` via Docker Compose for local dev                   |
| **Monitoring**         | Grafana Cloud (free tier)                         | Prometheus metrics for WebSocket connections, message throughput, latency. Structured JSON logs. OpenTelemetry tracing            |
| **CDN**                | Cloudflare (free tier)                            | Static Next.js assets, DDoS protection. No configuration needed for MVP                                                           |

### Format Plugin Architecture

**Vision:** Competition formats are pluggable, domain-agnostic modules. The platform is a generic competition runtime; all format-specific logic (scoring rules, phase structure, UI components, validation, aggregation) lives inside format plugins. The format SDK is open-source — anyone can create and publish formats. The platform itself is proprietary.

**Format SDK Contract (`packages/format-sdk`):**

```typescript
interface CompetitionFormat {
  // Identity
  id: string; // unique format identifier (e.g., 'cypher-battles')
  name: string; // display name
  version: string; // semver
  description: string;
  author: string;
  domain: string; // 'dance' | 'cooking' | 'debate' | 'custom'

  // Scoring Configuration
  scoringSchema: {
    criteria: CriterionDefinition[]; // { id, name, type: 'numeric'|'vote'|'ranking', min, max, precision, weight }
    aggregation: AggregationRule; // 'weighted-average' | 'sum' | 'median' | 'custom'
    customAggregator?: (scores: Score[]) => AggregatedResult;
  };

  // Phase Structure
  phases: PhaseDefinition[]; // ordered list of phases this format uses
  // Each phase: { id, name, type: 'scoring'|'voting'|'bracket'|'custom', rules, advancementCriteria }

  // State Machine Definition
  stateMachine: FormatStateMachineConfig; // XState-compatible config for phase transitions
  // The platform wraps this in the tournament lifecycle FSM

  // Validation Rules
  validators: {
    scoreValidator: (score: ScorePayload, context: FormatContext) => ValidationResult;
    phaseTransitionValidator: (from: Phase, to: Phase, state: CompetitionState) => ValidationResult;
  };

  // Anti-Bias & Fairness Rules
  fairnessRules: {
    judgeScoreVisibility: 'hidden' | 'after-submission' | 'after-phase';
    judgeGroupAssignment: 'random' | 'manual' | 'round-robin';
    tieBreaking: TieBreakRule[];
  };

  // UI Component Manifest
  ui: {
    judgeInput: ComponentManifest; // what the judge sees when scoring
    publicDisplay: ComponentManifest; // standings, brackets, results
    adminConfig: ComponentManifest; // format-specific settings in competition wizard
    presenterView?: ComponentManifest; // optional teleprompter customization
  };
}
```

**Format UI Components:**

Formats provide React components for each view. For MVP, format components are bundled at build time (Cypher Battles ships with the platform). Post-MVP, components can be loaded from npm packages.

```typescript
// Each ComponentManifest points to a React component
interface ComponentManifest {
  component: string; // component identifier within the format package
  defaultProps?: Record<string, unknown>;
  requiredPlatformHooks: string[]; // platform hooks the component needs (e.g., 'useSocket', 'useOfflineQueue')
}
```

The platform provides a `FormatRenderer` wrapper that:

- Injects platform hooks (WebSocket, offline queue, auth context) into format components
- Sandboxes format components (formats cannot access platform internals directly)
- Provides a standard component library (buttons, inputs, layout primitives) formats can use

**Format Runtime (competition module):**

The `competition` module becomes the **Format Runtime**:

- Loads the active format for each competition
- Delegates scoring validation to `format.validators.scoreValidator()`
- Delegates phase transitions to `format.stateMachine`
- Delegates aggregation to `format.scoringSchema.aggregation`
- Renders format UI components via `FormatRenderer`

The scoring module, tournament module, and websocket module remain format-agnostic — they work with generic types and delegate format-specific logic to the runtime.

**Open-Source Strategy:**

| Component                              | License     | Location                                                  |
| -------------------------------------- | ----------- | --------------------------------------------------------- |
| **Format SDK** (`packages/format-sdk`) | MIT         | Public npm: `@competition-platform/format-sdk`            |
| **Cypher Battles format**              | MIT         | Public npm: `@competition-platform/format-cypher-battles` |
| **Format test suite**                  | MIT         | Part of SDK: `@competition-platform/format-sdk/testing`   |
| **Platform runtime**                   | Proprietary | Private repo                                              |

**Format Validation Gate:**

Formats must pass the SDK test suite before deployment:

1. **Interface compliance** — implements all required `CompetitionFormat` fields
2. **Schema validation** — scoring schema is internally consistent (min < max, weights sum correctly)
3. **State machine validation** — all phases reachable, no dead-end states, proper terminal states
4. **UI component rendering** — components render without errors with mock data
5. **Fairness rules consistency** — anti-bias rules don't contradict scoring schema

```bash
# Format authors run this to validate
npx @competition-platform/format-sdk validate ./my-format
```

**MVP Scope:**

- Define and implement `CompetitionFormat` interface in `packages/format-sdk`
- Cypher Battles implements the interface as `packages/formats/cypher-battles/`
- Platform loads Cypher Battles format at build time (no dynamic loading yet)
- Format test suite validates Cypher Battles implementation
- All platform modules interact with formats through the SDK interface only

**Post-MVP:**

- Format registry (npm-based initially, custom registry later)
- Dynamic format loading (lazy imports from npm packages)
- Format marketplace UI on the platform
- Community contribution workflow (PR → automated validation → publish)
- Format versioning and migration support

### Decision Impact Analysis

**Implementation Sequence:**

1. Monorepo scaffold (Turborepo + pnpm) with `packages/db`, `packages/shared`, `packages/format-sdk`
2. Format SDK — define `CompetitionFormat` interface and validation test suite
3. Drizzle schema + PostgreSQL + Docker Compose local dev (includes `format_id` on competitions)
4. NestJS modular monolith with DDD bounded contexts + Format Runtime in competition module
5. Clerk auth integration + judge invite token system
6. tRPC routers (shared between apps/api and apps/web)
7. Socket.IO gateway with rooms + WebSocket guards
8. Cypher Battles format implementation (`packages/formats/cypher-battles/`) passing SDK validation
9. Event store (append-only table + event publishing)
10. Next.js frontend views with FormatRenderer (admin, judge, presenter, public)
11. Offline scoring (localStorage + Service Worker)
12. Fly.io deployment + GitHub Actions CI/CD

**Cross-Component Dependencies:**

- tRPC router definitions depend on Drizzle schema types → both in shared packages
- WebSocket events share types with frontend via `packages/shared/events`
- Event store events drive both audit trail queries AND real-time WebSocket broadcasts
- TanStack Query cache invalidation depends on Socket.IO event contracts
- RLS policies depend on Clerk JWT claims (organizer) and judge token context

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 25+ areas where AI agents could make different choices, organized into 5 categories: naming, structure, format, communication, and process patterns.

### Naming Patterns

**Database Naming Conventions (Drizzle Schema):**

| Element      | Convention                       | Example                                            |
| ------------ | -------------------------------- | -------------------------------------------------- |
| Tables       | snake_case, plural               | `competitions`, `judge_sessions`, `scoring_events` |
| Columns      | snake_case                       | `created_at`, `judge_id`, `aggregate_type`         |
| Foreign keys | `{referenced_table_singular}_id` | `competition_id`, `judge_id`                       |
| Indexes      | `idx_{table}_{columns}`          | `idx_scoring_events_aggregate_id`                  |
| Enums        | snake_case                       | `competition_status`, `phase_type`                 |

**Code Naming Conventions:**

| Element                  | Convention                         | Example                                                    |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------- |
| Files (general)          | kebab-case                         | `judge-session.service.ts`, `score-submitted.event.ts`     |
| Files (React components) | kebab-case                         | `score-input.tsx`, `competition-dashboard.tsx`             |
| React components         | PascalCase                         | `ScoreInput`, `CompetitionDashboard`                       |
| Functions/variables      | camelCase                          | `submitScore`, `judgeSessionId`                            |
| Classes/interfaces/types | PascalCase                         | `CompetitionService`, `ScorePayload`                       |
| Constants                | UPPER_SNAKE_CASE                   | `MAX_JUDGES_PER_GROUP`, `DEFAULT_SCORE_PRECISION`          |
| Drizzle schema exports   | camelCase export, snake_case table | `export const competitions = pgTable('competitions', ...)` |

**tRPC Router Naming:**

| Element      | Convention               | Example                                                           |
| ------------ | ------------------------ | ----------------------------------------------------------------- |
| Router names | camelCase, domain-scoped | `competition`, `scoring`, `tournament`                            |
| Procedures   | camelCase, verb-first    | `competition.create`, `scoring.submit`, `tournament.getStandings` |

**WebSocket Event Naming:**
Dot notation: `score.submitted`, `phase.transitioned`, `judge.connected`, `bracket.updated`. Matches domain event naming and is readable in logs.

### Structure Patterns

**Test File Location:**
Co-located — `competition.service.ts` + `competition.service.test.ts` in the same folder. E2E tests live separately in `apps/web/e2e/`. Load tests in `apps/api/load-tests/`.

**NestJS Backend Organization (apps/api):**

```
apps/api/src/
├── modules/
│   ├── auth/                    # Authentication bounded context
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/      # Clerk integration, JWT, judge tokens
│   │   └── auth.module.ts
│   ├── tournament/              # Tournament management bounded context
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── value-objects/
│   │   │   └── events/
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   ├── queries/
│   │   │   └── sagas/
│   │   ├── infrastructure/
│   │   │   ├── persistence/
│   │   │   └── state-machine/   # XState tournament FSM
│   │   └── tournament.module.ts
│   ├── scoring/                 # Scoring & audit bounded context
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   │   └── event-store/
│   │   └── scoring.module.ts
│   ├── competition/             # Real-time competition engine
│   │   └── competition.module.ts
│   ├── user/                    # User profiles & competitor management
│   │   └── user.module.ts
│   └── websocket/               # WebSocket gateway (cross-cutting)
│       ├── gateways/
│       ├── guards/
│       ├── interceptors/
│       └── websocket.module.ts
├── shared/
│   ├── event-bus/
│   ├── guards/
│   └── types/
├── trpc/                        # tRPC router definitions
│   ├── routers/
│   └── trpc.module.ts
└── main.ts
```

**Next.js Frontend Organization (apps/web):**

```
apps/web/src/
├── app/
│   ├── (admin)/                 # Organizer dashboard routes
│   │   ├── dashboard/
│   │   ├── competitions/
│   │   └── layout.tsx
│   ├── (judge)/                 # Judge scoring routes
│   │   ├── [token]/
│   │   └── layout.tsx
│   ├── (presenter)/             # Presenter teleprompter routes
│   │   └── layout.tsx
│   └── (public)/                # Public standings/bracket routes
│       ├── [competitionId]/
│       └── layout.tsx
├── components/
│   ├── ui/                      # shadcn/ui primitives (auto-generated)
│   ├── admin/                   # Admin-specific composite components
│   ├── judge/                   # Judge-specific composite components
│   ├── presenter/               # Presenter-specific components
│   └── shared/                  # Cross-role (connection-status, etc.)
├── hooks/                       # Custom React hooks
├── lib/                         # Utilities (trpc client, socket client, i18n)
└── stores/                      # Zustand stores
```

**Shared Packages:**

```
packages/
├── db/                          # Drizzle schema, migrations, seed
│   ├── schema/                  # One file per domain (competitions.ts, scoring.ts)
│   ├── migrations/
│   ├── seed/
│   └── index.ts                 # Re-exports all schema + db client
├── shared/                      # Cross-app TypeScript types
│   ├── events/                  # Domain event types + Socket.IO event map
│   ├── errors/                  # Error code enums + error types
│   ├── types/                   # DTOs, value objects, constants
│   └── index.ts
├── format-sdk/                  # Open-source format interface (MIT)
│   ├── src/
│   │   ├── types/               # CompetitionFormat interface + all sub-types
│   │   │   ├── format.types.ts
│   │   │   ├── scoring.types.ts
│   │   │   ├── phase.types.ts
│   │   │   └── ui.types.ts
│   │   ├── testing/             # Format validation test suite
│   │   │   ├── validate-format.ts
│   │   │   ├── schema-validator.ts
│   │   │   ├── state-machine-validator.ts
│   │   │   └── ui-component-validator.ts
│   │   ├── helpers/             # Utilities for format authors
│   │   │   ├── create-format.ts
│   │   │   └── score-utils.ts   # String-based score math utilities
│   │   └── index.ts
│   └── package.json
├── formats/                     # Format implementations
│   └── cypher-battles/          # First-party format (MIT, open-source reference)
│       ├── src/
│       │   ├── cypher-battles.format.ts    # CompetitionFormat implementation
│       │   ├── scoring/
│       │   │   ├── cypher-scoring.schema.ts
│       │   │   ├── battles-voting.schema.ts
│       │   │   └── aggregation.ts
│       │   ├── phases/
│       │   │   ├── cypher-phase.ts
│       │   │   ├── battles-phase.ts
│       │   │   └── state-machine.ts         # XState config for Cypher→Battles flow
│       │   ├── validators/
│       │   │   ├── score-validator.ts
│       │   │   └── transition-validator.ts
│       │   ├── fairness/
│       │   │   └── cypher-fairness-rules.ts
│       │   ├── ui/
│       │   │   ├── judge-score-input.tsx     # Number pad scoring component
│       │   │   ├── judge-vote-input.tsx      # Battles voting component
│       │   │   ├── public-standings.tsx      # Leaderboard display
│       │   │   ├── public-bracket.tsx        # Bracket view
│       │   │   └── admin-config.tsx          # Cypher-specific settings
│       │   └── index.ts
│       ├── cypher-battles.format.test.ts    # SDK validation suite
│       └── package.json
├── config-eslint/
└── config-typescript/
```

### Format Patterns

**API & Data Exchange Formats:**

| Element       | Convention                   | Example                                      |
| ------------- | ---------------------------- | -------------------------------------------- |
| JSON fields   | camelCase                    | `{ competitionId, createdAt, judgeGroupId }` |
| Dates in JSON | ISO 8601 strings             | `"2026-04-05T14:30:00.000Z"`                 |
| IDs           | nanoid (21 chars) or cuid2   | URL-safe, sortable. Generated server-side    |
| Nulls         | Explicit `null`              | Never `undefined` in API responses           |
| Booleans      | `true`/`false`               | Never `1`/`0`                                |
| Scores        | String with 2 decimal places | `"8.75"` — avoids floating point errors      |
| Empty arrays  | `[]`                         | Never `null` for collections                 |

**tRPC Response Format:**
tRPC handles response wrapping automatically. Procedures return data directly. Errors use `TRPCError` with structured cause.

### Communication Patterns

**Domain Event Envelope:**
All domain events follow a standard envelope structure:

```typescript
interface DomainEvent<T = unknown> {
  type: string; // dot.notation: 'score.submitted'
  aggregateId: string; // competition ID
  aggregateType: string; // 'competition' | 'tournament' | 'scoring'
  payload: T; // typed per event
  createdBy: string; // user/judge/system ID
  createdAt: string; // ISO 8601
  sequence: number; // monotonic per aggregate
}
```

**Event Examples:**

```typescript
// Scoring domain
type ScoreSubmitted = DomainEvent<{
  judgeId: string;
  competitorId: string;
  roundId: string;
  scores: { criterionId: string; value: string }[];
  idempotencyKey: string;
}>;

// Tournament domain
type PhaseTransitioned = DomainEvent<{
  fromPhase: string;
  toPhase: string;
  advancedCompetitorIds: string[];
  trigger: 'automatic' | 'admin_confirmed';
}>;

// Admin domain
type ScoreOverridden = DomainEvent<{
  originalEventSequence: number;
  newScore: string;
  reason: string; // mandatory
}>;
```

**Socket.IO Event Map (type-safe):**
Defined in `packages/shared/events` and imported by both server and client:

```typescript
interface ServerToClientEvents {
  'score.submitted': (data: ScoreSubmitted) => void;
  'phase.transitioned': (data: PhaseTransitioned) => void;
  'judge.connected': (data: { judgeId: string }) => void;
  'judge.disconnected': (data: { judgeId: string }) => void;
  'bracket.updated': (data: BracketState) => void;
  'round.started': (data: RoundState) => void;
  error: (data: SocketError) => void;
}

interface ClientToServerEvents {
  'score.submit': (data: ScoreSubmitPayload, ack: (res: AckResponse) => void) => void;
  'vote.submit': (data: VoteSubmitPayload, ack: (res: AckResponse) => void) => void;
}
```

**State Management Patterns:**

- Zustand stores use immutable updates (spread operator, never direct mutation)
- Store naming: `use{Domain}Store` — `useConnectionStore`, `useScoringStore`
- Selectors for derived state: `useConnectionStore(state => state.isConnected)`
- TanStack Query keys follow convention: `[domain, action, ...params]` — `['competition', 'get', competitionId]`

### Process Patterns

**Error Handling:**

```typescript
// tRPC errors — structured cause with error code
throw new TRPCError({
  code: 'BAD_REQUEST',
  message: 'Score value must be between 0.00 and 10.00',
  cause: { errorCode: 'SCORE_OUTSIDE_RANGE', field: 'score', value: 11.5 },
});

// WebSocket errors — emitted to sender only
socket.emit('error', {
  code: 'SCORE_OUTSIDE_RANGE',
  message: 'Score value must be between 0.00 and 10.00',
  details: { field: 'score', value: 11.5 },
});
```

Error codes enumerated in `packages/shared/errors/error-codes.ts`. All user-facing error messages are i18n keys, not hardcoded strings.

**Loading & Connection State Conventions:**

| State                  | Zustand store key                  | UI indicator       |
| ---------------------- | ---------------------------------- | ------------------ |
| WebSocket connected    | `connectionStatus: 'connected'`    | Green dot          |
| WebSocket reconnecting | `connectionStatus: 'reconnecting'` | Yellow pulse       |
| WebSocket disconnected | `connectionStatus: 'disconnected'` | Red dot            |
| Score submitting       | `submissionStatus: 'sending'`      | Blue pulse         |
| Score confirmed        | `submissionStatus: 'confirmed'`    | Green checkmark ✓✓ |
| Score queued offline   | `submissionStatus: 'queued'`       | Yellow checkmark ✓ |

**Validation Pattern:**

- Input validation: Zod schemas in `packages/shared/types` — shared between tRPC input validation and frontend form validation
- Server-side: tRPC `.input(zodSchema)` validates automatically
- Client-side: Same Zod schema used with React Hook Form resolver
- Database-level: Drizzle constraints + PostgreSQL CHECK constraints as last line of defense

### Enforcement Guidelines

**All AI Agents MUST:**

1. Follow naming conventions exactly — no variations (e.g., never `user_cards` for components, never `camelCase` for DB columns)
2. Place files in the correct location per the structure patterns — co-located tests, domain-scoped modules, role-based route groups
3. Use the domain event envelope for ALL state-changing operations — no ad-hoc event shapes
4. Import shared types from `packages/shared` — never redefine types locally
5. Use Zod schemas for all input validation — never manual if/else validation
6. Handle errors using structured error codes from `packages/shared/errors` — never raw string messages
7. Store scores as strings with 2 decimal places — never floating point numbers
8. Generate IDs server-side using nanoid/cuid2 — never client-generated, never auto-increment integers
9. All format-specific logic MUST live inside `packages/formats/{format-name}/` — never in platform modules
10. Platform modules interact with formats ONLY through the `CompetitionFormat` interface from `packages/format-sdk`

**Anti-Patterns to Avoid:**

- `userId` as a database column name (should be `user_id`)
- `UserCard.tsx` as a filename (should be `user-card.tsx`)
- `score: 8.75` as a number in JSON (should be `score: "8.75"` string)
- `undefined` in API responses (should be `null`)
- Defining types in `apps/web` that should be in `packages/shared`
- Importing from `apps/api` directly in `apps/web` (use `packages/shared` or tRPC)
- Using `any` type (use `unknown` + type guards instead)
- Hardcoded error messages (use i18n keys + error codes)
- Importing from `packages/formats/cypher-battles` in `apps/api` or `apps/web` directly (use Format Runtime)
- Hardcoding Cypher Battles scoring rules in platform modules (use `CompetitionFormat` interface)
- Format components importing platform internals (use platform hooks via `FormatRenderer`)

## Project Structure & Boundaries

### Complete Project Directory Structure

```
competition-platform/
├── .github/
│   └── workflows/
│       ├── ci.yml                          # Lint → typecheck → test → build
│       └── deploy.yml                      # Build → deploy to Fly.io
├── .husky/
│   └── pre-commit                          # lint-staged
├── apps/
│   ├── api/                                # NestJS modular monolith
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   └── judge-token.value-object.ts
│   │   │   │   │   ├── application/
│   │   │   │   │   │   ├── commands/
│   │   │   │   │   │   │   ├── generate-judge-link.command.ts
│   │   │   │   │   │   │   └── validate-judge-token.command.ts
│   │   │   │   │   │   └── queries/
│   │   │   │   │   │       └── get-current-user.query.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── clerk.provider.ts
│   │   │   │   │   │   ├── judge-token.repository.ts
│   │   │   │   │   │   └── guards/
│   │   │   │   │   │       ├── clerk-auth.guard.ts
│   │   │   │   │   │       └── judge-token.guard.ts
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   └── auth.module.test.ts
│   │   │   │   │
│   │   │   │   ├── tournament/              # FR1-FR10: Competition config
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── entities/
│   │   │   │   │   │   │   ├── competition.entity.ts
│   │   │   │   │   │   │   ├── phase.entity.ts
│   │   │   │   │   │   │   ├── competitor.entity.ts
│   │   │   │   │   │   │   └── evaluation-template.entity.ts
│   │   │   │   │   │   ├── value-objects/
│   │   │   │   │   │   │   ├── competition-status.vo.ts
│   │   │   │   │   │   │   └── phase-type.vo.ts
│   │   │   │   │   │   └── events/
│   │   │   │   │   │       ├── competition-created.event.ts
│   │   │   │   │   │       ├── phase-transitioned.event.ts
│   │   │   │   │   │       └── competitor-withdrawn.event.ts
│   │   │   │   │   ├── application/
│   │   │   │   │   │   ├── commands/
│   │   │   │   │   │   │   ├── create-competition.command.ts
│   │   │   │   │   │   │   ├── start-phase.command.ts
│   │   │   │   │   │   │   ├── advance-competitors.command.ts
│   │   │   │   │   │   │   └── withdraw-competitor.command.ts
│   │   │   │   │   │   ├── queries/
│   │   │   │   │   │   │   ├── get-competition.query.ts
│   │   │   │   │   │   │   ├── get-standings.query.ts
│   │   │   │   │   │   │   └── get-bracket.query.ts
│   │   │   │   │   │   └── sagas/
│   │   │   │   │   │       └── competition-lifecycle.saga.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── persistence/
│   │   │   │   │   │   │   └── competition.repository.ts
│   │   │   │   │   │   └── state-machine/
│   │   │   │   │   │       ├── competition.machine.ts    # XState FSM
│   │   │   │   │   │       └── competition.machine.test.ts
│   │   │   │   │   └── tournament.module.ts
│   │   │   │   │
│   │   │   │   ├── scoring/                 # FR11-FR19, FR20-FR27
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── entities/
│   │   │   │   │   │   │   ├── score.entity.ts
│   │   │   │   │   │   │   └── vote.entity.ts
│   │   │   │   │   │   └── events/
│   │   │   │   │   │       ├── score-submitted.event.ts
│   │   │   │   │   │       ├── score-overridden.event.ts
│   │   │   │   │   │       └── vote-submitted.event.ts
│   │   │   │   │   ├── application/
│   │   │   │   │   │   ├── commands/
│   │   │   │   │   │   │   ├── submit-score.command.ts
│   │   │   │   │   │   │   ├── submit-vote.command.ts
│   │   │   │   │   │   │   └── override-score.command.ts
│   │   │   │   │   │   └── queries/
│   │   │   │   │   │       ├── get-leaderboard.query.ts
│   │   │   │   │   │       └── get-score-history.query.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── event-store/
│   │   │   │   │   │   │   ├── event-store.service.ts
│   │   │   │   │   │   │   └── event-store.service.test.ts
│   │   │   │   │   │   └── scoring.repository.ts
│   │   │   │   │   └── scoring.module.ts
│   │   │   │   │
│   │   │   │   ├── competition/             # Format Runtime — loads and executes format plugins
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── format-runtime/
│   │   │   │   │   │   │   ├── format-loader.service.ts       # Loads format by ID, resolves CompetitionFormat
│   │   │   │   │   │   │   ├── format-registry.service.ts     # Registry of available formats (build-time for MVP)
│   │   │   │   │   │   │   └── format-renderer.service.ts     # Resolves UI component manifests
│   │   │   │   │   │   ├── services/
│   │   │   │   │   │   │   ├── score-delegator.service.ts     # Delegates to format.validators.scoreValidator()
│   │   │   │   │   │   │   ├── aggregation-delegator.service.ts  # Delegates to format.scoringSchema.aggregation
│   │   │   │   │   │   │   ├── bracket-generator.service.ts   # Generic bracket logic, format-configured
│   │   │   │   │   │   │   └── group-assigner.service.ts      # Generic group assignment, format-configured
│   │   │   │   │   │   └── state-machine/
│   │   │   │   │   │       └── format-state-machine.adapter.ts  # Wraps format.stateMachine in tournament lifecycle FSM
│   │   │   │   │   ├── application/
│   │   │   │   │   │   └── commands/
│   │   │   │   │   │       ├── generate-bracket.command.ts
│   │   │   │   │   │       ├── assign-judge-groups.command.ts
│   │   │   │   │   │       └── load-format.command.ts
│   │   │   │   │   └── competition.module.ts
│   │   │   │   │
│   │   │   │   ├── user/
│   │   │   │   │   ├── domain/
│   │   │   │   │   ├── application/
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   └── user.module.ts
│   │   │   │   │
│   │   │   │   └── websocket/               # FR45-FR49: Real-time gateway
│   │   │   │       ├── gateways/
│   │   │   │       │   └── competition.gateway.ts
│   │   │   │       ├── guards/
│   │   │   │       │   └── ws-auth.guard.ts
│   │   │   │       ├── interceptors/
│   │   │   │       │   └── ws-logging.interceptor.ts
│   │   │   │       └── websocket.module.ts
│   │   │   │
│   │   │   ├── shared/
│   │   │   │   ├── event-bus/
│   │   │   │   │   └── event-bus.service.ts
│   │   │   │   ├── guards/
│   │   │   │   │   └── rls-context.guard.ts
│   │   │   │   └── filters/
│   │   │   │       └── global-exception.filter.ts
│   │   │   │
│   │   │   ├── trpc/
│   │   │   │   ├── routers/
│   │   │   │   │   ├── competition.router.ts
│   │   │   │   │   ├── scoring.router.ts
│   │   │   │   │   ├── tournament.router.ts
│   │   │   │   │   └── auth.router.ts
│   │   │   │   ├── trpc.context.ts
│   │   │   │   ├── trpc.router.ts
│   │   │   │   └── trpc.module.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   └── env.config.ts
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   │
│   │   ├── Dockerfile
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   └── web/                                 # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── (admin)/                 # FR36-FR44: Organizer dashboard
│       │   │   │   ├── dashboard/
│       │   │   │   │   └── page.tsx
│       │   │   │   ├── competitions/
│       │   │   │   │   ├── page.tsx
│       │   │   │   │   ├── new/
│       │   │   │   │   │   └── page.tsx
│       │   │   │   │   └── [id]/
│       │   │   │   │       ├── page.tsx
│       │   │   │   │       ├── settings/
│       │   │   │   │       │   └── page.tsx
│       │   │   │   │       └── simulation/
│       │   │   │   │           └── page.tsx
│       │   │   │   └── layout.tsx
│       │   │   ├── (judge)/                 # FR28-FR35: Judge interface
│       │   │   │   ├── [token]/
│       │   │   │   │   ├── page.tsx
│       │   │   │   │   ├── scoring/
│       │   │   │   │   │   └── page.tsx
│       │   │   │   │   └── voting/
│       │   │   │   │       └── page.tsx
│       │   │   │   └── layout.tsx
│       │   │   ├── (presenter)/
│       │   │   │   ├── [competitionId]/
│       │   │   │   │   └── page.tsx
│       │   │   │   └── layout.tsx
│       │   │   ├── (public)/                # FR45-FR49: Public views
│       │   │   │   ├── [competitionId]/
│       │   │   │   │   ├── standings/
│       │   │   │   │   │   └── page.tsx
│       │   │   │   │   └── bracket/
│       │   │   │   │       └── page.tsx
│       │   │   │   └── layout.tsx
│       │   │   ├── layout.tsx
│       │   │   ├── globals.css
│       │   │   └── not-found.tsx
│       │   │
│       │   ├── components/
│       │   │   ├── ui/                      # shadcn/ui primitives
│       │   │   ├── format/                  # Format rendering system
│       │   │   │   ├── format-renderer.tsx   # Loads format UI components, injects platform hooks
│       │   │   │   ├── format-context.tsx    # React context providing format config to components
│       │   │   │   └── platform-hooks.ts    # Standard hooks exposed to format components
│       │   │   ├── admin/
│       │   │   │   ├── competition-wizard.tsx
│       │   │   │   ├── live-dashboard.tsx
│       │   │   │   ├── judge-monitor.tsx
│       │   │   │   └── admin-scoring-panel.tsx
│       │   │   ├── judge/
│       │   │   │   └── submission-status.tsx  # Platform-level (format provides the actual input UI)
│       │   │   ├── presenter/
│       │   │   │   └── teleprompter.tsx
│       │   │   └── shared/
│       │   │       ├── connection-status.tsx
│       │   │       ├── standings-table.tsx
│       │   │       └── bracket-view.tsx
│       │   │
│       │   ├── hooks/
│       │   │   ├── use-socket.ts
│       │   │   ├── use-offline-queue.ts
│       │   │   └── use-submission-status.ts
│       │   │
│       │   ├── lib/
│       │   │   ├── trpc.ts
│       │   │   ├── socket.ts
│       │   │   ├── i18n.ts
│       │   │   └── utils.ts
│       │   │
│       │   ├── stores/
│       │   │   ├── use-connection-store.ts
│       │   │   ├── use-scoring-store.ts
│       │   │   └── use-competition-store.ts
│       │   │
│       │   └── middleware.ts
│       │
│       ├── public/
│       │   └── locales/
│       │       ├── en/
│       │       │   └── common.json
│       │       └── es/
│       │           └── common.json
│       ├── e2e/
│       │   ├── competition-flow.spec.ts
│       │   ├── judge-scoring.spec.ts
│       │   └── fixtures/
│       ├── next.config.js
│       ├── tailwind.config.ts
│       ├── components.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── package.json
│
├── packages/
│   ├── db/
│   │   ├── schema/
│   │   │   ├── competitions.ts
│   │   │   ├── scoring.ts
│   │   │   ├── events.ts
│   │   │   ├── formats.ts              # format_id on competitions, installed_formats table
│   │   │   ├── users.ts
│   │   │   └── judge-sessions.ts
│   │   ├── migrations/
│   │   ├── seed/
│   │   │   └── dev-seed.ts
│   │   ├── drizzle.config.ts
│   │   ├── index.ts
│   │   └── package.json
│   │
│   ├── format-sdk/                     # MIT open-source — the interface formats implement
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── format.types.ts
│   │   │   │   ├── scoring.types.ts
│   │   │   │   ├── phase.types.ts
│   │   │   │   └── ui.types.ts
│   │   │   ├── testing/
│   │   │   │   ├── validate-format.ts
│   │   │   │   ├── schema-validator.ts
│   │   │   │   ├── state-machine-validator.ts
│   │   │   │   └── ui-component-validator.ts
│   │   │   ├── helpers/
│   │   │   │   ├── create-format.ts
│   │   │   │   └── score-utils.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── formats/
│   │   └── cypher-battles/             # MIT open-source — reference format implementation
│   │       ├── src/
│   │       │   ├── cypher-battles.format.ts
│   │       │   ├── scoring/
│   │       │   │   ├── cypher-scoring.schema.ts
│   │       │   │   ├── battles-voting.schema.ts
│   │       │   │   └── aggregation.ts
│   │       │   ├── phases/
│   │       │   │   ├── cypher-phase.ts
│   │       │   │   ├── battles-phase.ts
│   │       │   │   └── state-machine.ts
│   │       │   ├── validators/
│   │       │   │   ├── score-validator.ts
│   │       │   │   └── transition-validator.ts
│   │       │   ├── fairness/
│   │       │   │   └── cypher-fairness-rules.ts
│   │       │   ├── ui/
│   │       │   │   ├── judge-score-input.tsx
│   │       │   │   ├── judge-vote-input.tsx
│   │       │   │   ├── public-standings.tsx
│   │       │   │   ├── public-bracket.tsx
│   │       │   │   └── admin-config.tsx
│   │       │   └── index.ts
│   │       ├── cypher-battles.format.test.ts
│   │       └── package.json
│   │
│   ├── shared/
│   │   ├── events/
│   │   │   ├── domain-event.ts
│   │   │   ├── scoring-events.ts
│   │   │   ├── tournament-events.ts
│   │   │   └── socket-event-map.ts
│   │   ├── errors/
│   │   │   ├── error-codes.ts
│   │   │   └── error-types.ts
│   │   ├── types/
│   │   │   ├── competition.types.ts
│   │   │   ├── scoring.types.ts
│   │   │   └── auth.types.ts
│   │   ├── validation/
│   │   │   ├── score.schema.ts
│   │   │   └── competition.schema.ts
│   │   ├── constants/
│   │   │   └── index.ts
│   │   ├── index.ts
│   │   └── package.json
│   │
│   ├── config-eslint/
│   │   ├── base.js
│   │   ├── next.js
│   │   ├── nest.js
│   │   └── package.json
│   │
│   └── config-typescript/
│       ├── base.json
│       ├── next.json
│       ├── nest.json
│       └── package.json
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Architectural Boundaries

**Module Communication Rules:**

- Modules communicate ONLY through their public service interfaces (exported from `*.module.ts`)
- NO direct database access across modules — each module owns its tables
- Cross-module events go through the shared event bus (`shared/event-bus/`)
- The WebSocket gateway delegates to domain modules — it is a thin transport layer only

**Data Boundaries:**

| Module          | Owns Tables                                                     | Reads From                                                  |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| **auth**        | `judge_sessions`                                                | Clerk API (external)                                        |
| **tournament**  | `competitions`, `phases`, `competitors`, `evaluation_templates` | —                                                           |
| **scoring**     | `scores`, `votes`, `events` (event store)                       | `competitions` (via tournament service)                     |
| **competition** | `installed_formats`                                             | `competitions`, `scores` (via services), `format-sdk` types |
| **user**        | `users`, `organizations`                                        | Clerk API                                                   |

**Frontend Route Boundaries:**

| Route Group     | Auth Required         | Layout                        | Primary Device |
| --------------- | --------------------- | ----------------------------- | -------------- |
| `(admin)/*`     | Clerk JWT (organizer) | Full dashboard with sidebar   | Desktop        |
| `(judge)/*`     | Invite token          | Minimal, single-purpose       | Mobile         |
| `(presenter)/*` | Clerk JWT (organizer) | Teleprompter (no chrome)      | Mobile         |
| `(public)/*`    | None                  | Read-only, projector-friendly | Any            |

### Requirements to Structure Mapping

| FR Category                | Backend Module                                                         | Frontend Route Group               | Shared Package                                      |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| **FR1-FR10** (Config)      | `tournament/`                                                          | `(admin)/competitions/`            | `shared/types/competition.types.ts`                 |
| **FR11-FR19** (Cypher)     | `scoring/` + `competition/format-runtime/` + `formats/cypher-battles/` | `(judge)/scoring/` via format UI   | `format-sdk/`, `shared/events/scoring-events.ts`    |
| **FR20-FR27** (Battles)    | `scoring/` + `competition/format-runtime/` + `formats/cypher-battles/` | `(judge)/voting/` via format UI    | `format-sdk/`, `shared/events/tournament-events.ts` |
| **FR28-FR35** (Judge UI)   | `websocket/` + `auth/`                                                 | `(judge)/*`                        | `shared/events/socket-event-map.ts`                 |
| **FR36-FR44** (Admin)      | `tournament/` + `scoring/`                                             | `(admin)/*`                        | `shared/validation/*.schema.ts`                     |
| **FR45-FR49** (Public)     | `websocket/`                                                           | `(public)/*` + `(presenter)/*`     | —                                                   |
| **FR50-FR55** (Simulation) | `tournament/` + `scoring/`                                             | `(admin)/[id]/simulation/`         | —                                                   |
| **FR56-FR61** (Auth)       | `auth/`                                                                | `middleware.ts`                    | `shared/types/auth.types.ts`                        |
| **FR62-FR64** (i18n)       | —                                                                      | `public/locales/*` + `lib/i18n.ts` | —                                                   |

### Data Flow

```
Judge submits score (mobile)
  → localStorage persists immediately (sacred data)
  → Socket.IO emit 'score.submit' with idempotency key
  → WS Guard validates judge token
  → scoring module: validate + append to event store
  → event bus publishes 'score.submitted'
  → tournament module: recalculate rankings
  → websocket gateway: broadcast to rooms
    → admin room: dashboard update
    → public room: standings update
    → judge room: ack + next competitor
  → Redis: update cached leaderboard
```

### External Integration Points

| Service             | Integration Point                                     | Module             |
| ------------------- | ----------------------------------------------------- | ------------------ |
| **Clerk**           | `auth/infrastructure/clerk.provider.ts`               | auth               |
| **Neon PostgreSQL** | `packages/db/index.ts` (Drizzle client)               | shared             |
| **Upstash Redis**   | `websocket/` + `scoring/` (Socket.IO adapter + cache) | websocket, scoring |
| **Fly.io**          | `apps/api/Dockerfile` + `fly.toml`                    | deployment         |
| **GitHub Actions**  | `.github/workflows/*.yml`                             | CI/CD              |

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All 15 technology choices verified for compatibility. tRPC + NestJS works via community adapter or Express middleware mount. Drizzle + Neon Serverless has native support (`drizzle-orm/neon-serverless`). Socket.IO + NestJS uses built-in `@nestjs/platform-socket.io`. XState integrates as injectable NestJS service. Clerk JWT validates in tRPC context. Tailwind + shadcn/ui + Tremor are all Tailwind-native. TanStack Query + tRPC has native integration via `@trpc/react-query`.

**Pattern Consistency:**
Naming conventions flow consistently: snake_case (DB) → camelCase (JSON/code) → PascalCase (types/components). Event naming (dot.notation) consistent across domain events and Socket.IO. File naming (kebab-case) consistent across backend and frontend.

**Structure Alignment:**
Project structure maps 1:1 to bounded contexts. Each NestJS module owns its domain/application/infrastructure layers. Shared packages prevent cross-app type duplication. Route groups map to user roles.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

| FR Range               | Covered By                                                     | Status |
| ---------------------- | -------------------------------------------------------------- | ------ |
| FR1-FR10 (Config)      | `tournament/` module + `(admin)/competitions/`                 | ✅     |
| FR11-FR19 (Cypher)     | `scoring/` + `competition/engines/cypher` + `(judge)/scoring/` | ✅     |
| FR20-FR27 (Battles)    | `scoring/` + `competition/engines/battles` + `(judge)/voting/` | ✅     |
| FR28-FR35 (Judge UI)   | `websocket/` + `auth/` + `(judge)/*` + offline hooks           | ✅     |
| FR36-FR44 (Admin)      | `tournament/` + `scoring/` + `(admin)/*`                       | ✅     |
| FR45-FR49 (Public)     | `websocket/` + `(public)/*` + `(presenter)/*`                  | ✅     |
| FR50-FR55 (Simulation) | Same modules, `(admin)/[id]/simulation/`                       | ✅     |
| FR56-FR61 (Auth)       | `auth/` module + `middleware.ts`                               | ✅     |
| FR62-FR64 (i18n)       | `public/locales/*` + `lib/i18n.ts`                             | ✅     |

**Non-Functional Requirements Coverage:**

| NFR Category              | Architectural Support                                                  | Status |
| ------------------------- | ---------------------------------------------------------------------- | ------ |
| NFR1-NFR7 (Performance)   | Socket.IO direct emit, Redis cache, PPR, minimal JS judge bundle       | ✅     |
| NFR8-NFR15 (Security)     | Clerk JWT, RLS guard, event store, server-authoritative, nanoid tokens | ✅     |
| NFR16-NFR21 (Reliability) | Event sourcing replay, offline queue, idempotency keys, retry logic    | ✅     |
| NFR22-NFR27 (Scalability) | Fly.io scale-to-zero, Redis adapter, Neon serverless                   | ✅     |

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions documented with technology choices and rationale. 15 technologies specified. Implementation sequence defined (11 steps). Cross-component dependencies mapped.

**Structure Completeness:**
~120 files mapped across monorepo. 6 bounded contexts defined. 5 external integration points specified. All FR categories mapped to specific directories.

**Pattern Completeness:**
Naming conventions cover DB, code, API, and events. Event envelope standardized. Error handling pattern defined for both tRPC and WebSocket. Loading/connection state conventions specified. Validation strategy (Zod schemas shared) documented.

### Gap Analysis Results

**No Critical Gaps.**

**Important Gaps (addressable during implementation stories):**

1. **Service Worker registration strategy** — Architecture specifies localStorage + Service Worker for offline scoring but doesn't detail SW lifecycle. Resolve during judge interface implementation using Workbox or manual SW.
2. **RLS policy activation in Drizzle** — `rls-context.guard.ts` must run `SET LOCAL session.current_organization_id` before each request. Standard PostgreSQL pattern, implement in shared guard.
3. **tRPC + NestJS adapter** — No official adapter. Use `trpc-nestjs-adapter` community package or mount as Express middleware. Both proven patterns.

**Deferred to Post-MVP:**

- Multi-region Fly.io deployment topology
- Rate limiting threshold configuration
- Grafana dashboard definitions
- Stripe payment integration architecture
- Open-source format registry/marketplace (npm-based distribution → custom registry)

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed (64 FRs, 27 NFRs)
- [x] Scale and complexity assessed (Medium-High)
- [x] Technical constraints identified (solo dev, 30 days, venue Wi-Fi)
- [x] Cross-cutting concerns mapped (7 concerns)

**✅ Architectural Decisions**

- [x] Critical decisions documented with rationale
- [x] Technology stack fully specified (15 technologies)
- [x] Integration patterns defined (tRPC + Socket.IO hybrid)
- [x] Performance considerations addressed (all 7 performance NFRs)

**✅ Implementation Patterns**

- [x] Naming conventions established (DB, code, API, events)
- [x] Structure patterns defined (co-located tests, role-based routes, DDD modules)
- [x] Communication patterns specified (event envelope, Socket.IO event map)
- [x] Process patterns documented (error handling, loading states, validation)

**✅ Project Structure**

- [x] Complete directory structure defined (~120 files)
- [x] Component boundaries established (6 bounded contexts)
- [x] Integration points mapped (5 external services)
- [x] Requirements to structure mapping complete (all 9 FR categories)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**

- Event sourcing provides immutable audit trail — critical for money-involved competitions
- Modular monolith balances architectural rigor with solo-dev operational simplicity
- tRPC eliminates entire class of API contract bugs in a monorepo
- Shared `packages/` prevent type drift between frontend and backend
- Offline-first judge scoring addresses the #1 UX risk (venue Wi-Fi)
- DDD bounded contexts enable future extraction to microservices without rewrite
- Format plugin architecture makes the platform domain-agnostic from day 1 — dance, cooking, debate, anything
- Open-source format SDK creates ecosystem and community moat while platform remains proprietary

**Areas for Future Enhancement:**

- Cloudflare Durable Objects evaluation for WebSocket layer at scale
- NATS replacement for Redis pub/sub when memory costs grow
- WebTransport evaluation when browser support matures
- Format hot-loading without platform redeployment (dynamic npm import)
- Community format marketplace UI and contribution workflow

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries — modules communicate only through service interfaces
- Refer to this document for all architectural questions
- Import shared types from `packages/shared` — never redefine locally
- **All format-specific logic MUST go through the `CompetitionFormat` interface** — never hardcode Cypher Battles logic in platform modules
- Platform modules (scoring, tournament, websocket) must remain format-agnostic — they delegate to the Format Runtime
- Format UI components receive platform hooks via `FormatRenderer` — they never import platform internals directly

**First Implementation Priority:**

```bash
pnpm dlx create-turbo@latest competition-platform --package-manager pnpm
```

Then scaffold NestJS (`apps/api`), Next.js (`apps/web`), and shared packages (`packages/db`, `packages/shared`, `packages/format-sdk`, `packages/formats/cypher-battles`) following the directory structure defined in this document.
