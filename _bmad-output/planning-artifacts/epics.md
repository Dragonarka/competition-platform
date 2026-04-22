---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# competition-platform - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for competition-platform, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Organizer can create a new competition with a name, date, and description
FR2: Organizer can define evaluation criteria for the Cypher phase (e.g., musicality, technique, creativity) with configurable number of items
FR3: Organizer can register participants manually by entering name and unique ID
FR4: Organizer can specify participant format (individual or pairs) for the Cypher phase
FR5: Organizer can configure the number of judges and how they are divided into groups for the Cypher phase
FR6: Organizer can assign subsets of participants to each judge group
FR7: Organizer can configure the advancement threshold (top N participants) that qualify from Cypher to Battles
FR8: Organizer can configure the number of judges for the Battles phase (independently from Cypher)
FR9: Organizer can configure tie-breaking rules for the Battles phase (re-vote or organizer decision)
FR10: Organizer can reuse evaluation criteria templates across competitions
FR11: System generates judge group assignments based on organizer configuration (participants distributed across judge groups)
FR12: Each judge receives only the participants assigned to their group for scoring
FR13: Judges score each assigned participant on every configured evaluation criterion using numeric values
FR14: System calculates per-participant-per-judge score as the sum of all criterion scores
FR15: System calculates final participant score as the aggregation of scores from all judges who evaluated that participant
FR16: System ranks all participants by final score
FR17: System identifies the top N participants who advance to the Battles phase based on the configured threshold
FR18: System supports partner rotation during the Cypher phase while maintaining individual evaluation
FR19: Organizer can review all Cypher scores and rankings before confirming advancement to Battles
FR20: System generates a tournament bracket from the participants who advanced from the Cypher phase
FR21: Each battle matchup is presented to judges with two competitors identified
FR22: Judges vote for one of three options per matchup: Player 1, Player 2, or Tie
FR23: System determines the winner of each matchup by majority vote
FR24: System handles tie votes according to the configured tie-breaking rules
FR25: System progresses the bracket automatically as matchup results are confirmed
FR26: System handles odd numbers in the bracket (byes) when the qualifier count isn't a power of two
FR27: System determines and displays the final competition winner
FR28: Judges can access the scoring interface via a shareable URL link (no account creation required)
FR29: Judge links are competition-specific and can be shared via messaging apps
FR30: In Cypher mode, judges see participant ID, name, and all evaluation criteria with score input fields
FR31: In Battles mode, judges see both competitors and three voting options (Player 1, Player 2, Tie)
FR32: Judges receive confirmation after each score/vote submission
FR33: System queues submissions when connection is lost and auto-submits when connection returns
FR34: Judge session persists through screen locks and brief disconnections
FR35: Judges see only their assigned participants/matchups — no access to competition management
FR36: Organizer can view a live dashboard showing current phase, incoming scores/votes, and standings
FR37: Organizer can monitor judge connection status (connected, disconnected, pending submissions)
FR38: Organizer can modify a submitted score with a mandatory reason that is recorded in a changelog
FR39: Organizer can rescue a competitor from elimination (override advancement decisions) with a mandatory reason logged
FR40: Organizer can mark a participant as withdrawn, triggering automatic bracket recalculation
FR41: Organizer can recalculate phase results after a withdrawal or override
FR42: Organizer can control phase transitions (review Cypher results → confirm advancement → start Battles)
FR43: Organizer can score directly from the admin panel (solo operation mode) without separate judge accounts
FR44: All admin overrides are recorded in an immutable audit trail (who, what, when, why)
FR45: Live standings/rankings are accessible via a public URL for projected screens at venues
FR46: Bracket view displays current Battles phase progress on the public URL
FR47: Standings and bracket update in real-time as scores and votes are submitted
FR48: Participants can see their ranking and upcoming matchup information on the projected display
FR49: Score breakdowns are visible on the public standings (transparent scoring)
FR50: Organizer can create a competition in simulation mode with mock or real participant data
FR51: Organizer can act as all roles (organizer + all judges) from the admin panel in simulation
FR52: Simulation runs the full competition flow: Cypher scoring → advancement → Battles bracket → winner
FR53: Organizer can restart or reset a simulation at any point
FR54: Simulation mode is visually distinguishable from live competitions
FR55: Simulation can be used for judge training (judges access via link and practice scoring)
FR56: Organizers can create an account using email or OAuth providers
FR57: Organizers can manage their competitions from a personal dashboard
FR58: Judge access links are generated per competition by the organizer
FR59: Judge links authenticate the judge for that specific competition without requiring account creation
FR60: System enforces role-based access: organizers see full admin, judges see only scoring interface
FR61: Organizer data is isolated — organizers cannot see other organizers' competitions
FR62: Users can switch the UI language between Spanish and English
FR63: Language preference persists across sessions
FR64: All user-facing text is translatable (no hardcoded strings)

### NonFunctional Requirements

NFR1: Judge score submission round-trip <500ms
NFR2: Vote submission round-trip (Battles) <300ms
NFR3: Leaderboard/bracket update after last submission <10 seconds
NFR4: Judge interface initial load on 4G mobile <1 second
NFR5: Organizer dashboard page load <2 seconds
NFR6: WebSocket reconnection with state recovery <5 seconds
NFR7: Score calculation (ranking update) <2 seconds for 200 participants
NFR8: All data in transit encrypted via TLS (100% — no plain HTTP)
NFR9: JWT tokens short-lived (15-minute expiry with refresh)
NFR10: Server-authoritative for all game state (no client-side score calculation)
NFR11: Scores immutable after submission (append-only event store)
NFR12: Admin overrides require mandatory reason (100% enforcement — no silent changes)
NFR13: Organizer data isolation (database-enforced via PostgreSQL RLS)
NFR14: Judge links are unguessable (cryptographically random tokens)
NFR15: Rate limiting on all submission endpoints
NFR16: Platform uptime during active competitions 99.9%
NFR17: Zero data loss for submitted scores/votes (100% durability)
NFR18: Submission retry queue with offline tolerance (auto-retry up to 5 minutes)
NFR19: Graceful degradation on connection loss (UI remains functional, queues submissions)
NFR20: Event completion rate 100% — zero abandoned events due to platform failure
NFR21: State recovery after server restart (full tournament state reconstructable from event store)
NFR22: Concurrent WebSocket connections per event 50+ (MVP), 500+ (post-MVP)
NFR23: Concurrent competitions per organizer 5+
NFR24: Participants per competition 200+
NFR25: Infrastructure cost when idle <$15/month (scale-to-zero)
NFR26: Infrastructure cost during active event <$50/month (MVP)
NFR27: Deployment to new regions via single command (`fly deploy --region`)

### Additional Requirements

**From Architecture:**

- Monorepo scaffold using Turborepo + pnpm (custom scaffold via official CLIs — no starter template); packages: `packages/db`, `packages/shared`, `packages/format-sdk`, `packages/formats/cypher-battles`
- Format SDK: Define `CompetitionFormat` interface (`packages/format-sdk`) as the mandatory abstraction; all platform modules interact with formats through this interface only
- Cypher Battles format (`packages/formats/cypher-battles`) implements CompetitionFormat SDK and must pass SDK validation test suite before use
- Drizzle ORM for schema and migrations; schema defined in `packages/db` shared across monorepo
- PostgreSQL (Neon serverless for production, Docker Compose for local dev) + Redis (Upstash serverless) for Socket.IO pub/sub and active competition state cache
- Append-only `events` table as event store (columns: id, type, aggregate_id, aggregate_type, payload JSONB, sequence, created_by, created_at); all score changes and admin overrides as compensating events, never overwrites
- NestJS modular monolith with 6 DDD bounded contexts: Auth, Tournament, Competition Engine (Format Runtime), Scoring, User, WebSocket Gateway
- Clerk auth for organizers (email + OAuth); judge invite tokens via nanoid (cryptographic, competition-scoped); public views unauthenticated
- tRPC for end-to-end type-safe HTTP API; Socket.IO for real-time (single namespace, role-based rooms: `competition:{id}:admin`, `competition:{id}:judge:{judgeId}`, `competition:{id}:public`)
- Next.js App Router with role-based route groups: `(admin)/`, `(judge)/`, `(presenter)/`, `(public)/`; PPR (Partial Prerendering) for dashboard, minimal JS for judge interface
- Offline scoring via localStorage + Service Worker retry queue (scores persisted on every keystroke; auto-retry on reconnection)
- XState for tournament state machine (Cypher → Battles phase transitions)
- TanStack Query + Zustand for frontend state (TanStack Query cache invalidated by WebSocket events)
- GitHub Actions CI/CD pipeline (~5 min: lint → typecheck → test → build → deploy to Fly.io)
- Monitoring: Grafana Cloud (free tier) + Prometheus metrics + OpenTelemetry tracing
- Testing: Vitest (unit + integration), Playwright (E2E), k6 (WebSocket load tests)
- Scores stored as strings with 2 decimal places (never floating point numbers)
- IDs generated server-side using nanoid/cuid2 (never client-generated, never auto-increment integers)
- Zod schemas in `packages/shared/types` for all input validation (shared between tRPC and frontend form validation)
- Structured error codes from `packages/shared/errors` (never raw string messages); all user-facing error messages are i18n keys
- Client-generated idempotency keys for all score submissions (server deduplicates on retry for offline queue replay)

**From UX Design Specification:**

- Judge interface must be mobile-first with touch targets 56px+ and WCAG AAA contrast (7:1 minimum)
- Sub-10-second full score-submit cycle: see competitors → input scores → submit → confirmation → next competitor; no navigation steps, no blocking confirmation dialogs
- Three-state connection indicator on all client views: sending → confirmed → queued (offline, will retry)
- Score data persisted to localStorage on every keystroke — no entered score ever lost on network failure, browser crash, or screen lock
- 5-second undo window after submission (instead of pre-submit confirmation dialog)
- Presenter/teleprompter view: dedicated large-text, glanceable mobile view for MC/announcer role (distinct from admin dashboard); real-time sync with admin
- Dual-device organizer workflow: laptop admin dashboard + mobile presenter view in real-time sync
- Simulation mode UX identical to live competition UX — no separate "training mode" interface; visually distinguished only by a clear "SIMULATION" badge/indicator
- Admin dashboard: desktop-first mission control with full situational awareness in under 3 seconds glance; Tremor components for charts, stat cards, KPI indicators
- Dark mode from day one; all colors meet WCAG AA minimum (4.5:1 contrast for text); status colors (green/yellow/red) reserved exclusively for system state — never for branding
- Responsive design: mobile-first for judge/presenter/competitor views; desktop-first for admin dashboard (two separate design tracks)
- Radix UI primitives (underlying shadcn/ui) for accessible headless components: keyboard navigation, screen reader support, focus trapping, ARIA attributes
- Large typography for mobile views; information-dense typography for admin dashboard
- Haptic feedback on score submission (in addition to visual confirmation)

### FR Coverage Map

FR1: Epic 2 — Competition creation: name, date, description
FR2: Epic 2 — Evaluation criteria definition for Cypher phase
FR3: Epic 2 — Manual participant registration (name + unique ID)
FR4: Epic 2 — Participant format configuration (individual or pairs)
FR5: Epic 2 — Judge count and group division configuration
FR6: Epic 2 — Participant-to-judge-group assignment
FR7: Epic 2 — Advancement threshold configuration (top N)
FR8: Epic 2 — Battles judge count configuration
FR9: Epic 2 — Tie-breaking rules configuration
FR10: Epic 2 — Evaluation criteria template reuse
FR11: Epic 3 — System-generated judge group assignments
FR12: Epic 3 — Judge sees only assigned participants
FR13: Epic 3 — Judges score participants on all criteria (numeric)
FR14: Epic 3 — Per-participant-per-judge score calculation (sum of criteria)
FR15: Epic 3 — Final participant score aggregation across judges
FR16: Epic 3 — Participant ranking by final score
FR17: Epic 3 — Top N identification for Battles advancement
FR18: Epic 3 — Partner rotation support (individual evaluation maintained)
FR19: Epic 3 — Organizer review of Cypher scores before advancement
FR20: Epic 5 — Tournament bracket generation from Cypher qualifiers
FR21: Epic 5 — Battle matchup presentation with two identified competitors
FR22: Epic 5 — Judge voting (Player 1 / Player 2 / Tie)
FR23: Epic 5 — Majority-vote winner determination
FR24: Epic 5 — Tie vote handling per configured rules
FR25: Epic 5 — Automatic bracket progression on confirmed results
FR26: Epic 5 — Odd-number bracket handling (byes)
FR27: Epic 5 — Final competition winner determination and display
FR28: Epic 3 — Judge access via shareable URL (no account required)
FR29: Epic 3 — Competition-specific judge links (WhatsApp-shareable)
FR30: Epic 3 — Cypher mode: participant + criteria score inputs
FR31: Epic 3 — Battles mode: two competitors + three voting options
FR32: Epic 3 — Submission confirmation feedback
FR33: Epic 3 — Offline queue + auto-submit on reconnect
FR34: Epic 3 — Session persistence through screen locks/disconnections
FR35: Epic 3 — Judges see only assigned participants/matchups
FR36: Epic 4 — Live organizer dashboard (phase, scores, standings)
FR37: Epic 4 — Judge connection status monitoring
FR38: Epic 4 — Score modification with mandatory reason + changelog
FR39: Epic 4 — Competitor rescue/override with mandatory reason
FR40: Epic 4 — Participant withdrawal + automatic bracket recalculation
FR41: Epic 4 — Phase result recalculation after withdrawal/override
FR42: Epic 4 — Phase transition control (Cypher review → confirm → start Battles)
FR43: Epic 4 — Solo scoring mode (organizer scores from admin panel)
FR44: Epic 4 — Immutable audit trail for all admin overrides
FR45: Epic 3 — Public URL for live standings (projected screens)
FR46: Epic 6 — Bracket view on public URL (Battles phase)
FR47: Epic 3 — Real-time standings/bracket updates via WebSocket
FR48: Epic 6 — Competitor-facing ranking and matchup info on projected display
FR49: Epic 6 — Score breakdowns visible on public standings
FR50: Epic 7 — Simulation mode: competition with mock/real participant data
FR51: Epic 7 — Organizer acts as all roles in simulation
FR52: Epic 7 — Full flow simulation: Cypher → advancement → Battles → winner
FR53: Epic 7 — Simulation restart/reset at any point
FR54: Epic 7 — Simulation visually distinguishable from live competition
FR55: Epic 7 — Simulation usable for judge training (judges access via link)
FR56: Epic 1 — Organizer account creation (email + OAuth)
FR57: Epic 1 — Organizer personal competition dashboard
FR58: Epic 2 — Judge invite link generation per competition
FR59: Epic 2 — Judge link authentication (competition-scoped, no signup)
FR60: Epic 2 — RBAC enforcement (organizer full admin, judge scoring only)
FR61: Epic 1 — Organizer data isolation (no cross-tenant visibility)
FR62: Epic 8 — UI language switching (Spanish / English)
FR63: Epic 8 — Language preference persistence across sessions
FR64: Epic 8 — All user-facing text translatable (no hardcoded strings)

## Epic List

### Epic 1: Platform Foundation & Organizer Onboarding

Organizers can create an account, log in, and access their personal competition dashboard. The platform exists as a working, deployable system.
**FRs covered:** FR56, FR57, FR61

### Epic 2: Competition Creation & Judge Access

Organizer can create and fully configure a Cypher → Battles competition — define evaluation criteria, register participants, configure judge groups and advancement rules — and generate judge invite links that judges use to access their scoring interface.
**FRs covered:** FR1–FR10, FR58, FR59, FR60

### Epic 3: Live Cypher Scoring

Judges access the scoring interface via WhatsApp link (no signup) and submit numeric scores in real-time. Organizer and public can see live standings on a projected screen as scores flow in. Offline queue handles venue Wi-Fi drops transparently.
**FRs covered:** FR11–FR19, FR28–FR35, FR45, FR47

### Epic 4: Organizer Mission Control & Admin Overrides

Organizer has full mission control: a live dashboard with judge connection monitoring, score overrides with mandatory reasons recorded in an immutable audit trail, competitor withdrawal with automatic bracket recalculation, competitor rescue, phase transition control, and solo scoring mode for small events.
**FRs covered:** FR36–FR44

### Epic 5: Battles Phase & Competition Completion

Competition advances from Cypher qualifiers into a single-elimination bracket. Judges vote Player 1 / Player 2 / Tie per matchup. Bracket progresses automatically — including bye handling and tie-breaking — to produce a final winner.
**FRs covered:** FR20–FR27

### Epic 6: Public Standings, Bracket View & Presenter Mode

Competitors and audience see real-time standings with score breakdowns and the full Battles bracket on projected screens. Organizer has a dedicated MC/presenter teleprompter view (large text, glanceable, mobile) for live announcing — distinct from the admin dashboard.
**FRs covered:** FR46, FR48, FR49

### Epic 7: Simulation Mode & Judge Training

Organizer can run a complete rehearsal of the full Cypher → Battles competition flow without real judges or participants. Supports judge training (judges access via link and practice scoring) and format validation before going live. Simulation mode is visually distinct but UX-identical to live mode.
**FRs covered:** FR50–FR55

### Epic 8: Internationalization

Platform supports Spanish and English with runtime language switching, persistent language preference across sessions, and zero hardcoded strings across all views and roles.
**FRs covered:** FR62–FR64

---

## Epic 1: Platform Foundation & Organizer Onboarding

Organizers can create an account, log in, and access their personal competition dashboard. The platform exists as a working, deployable system.

### Story 1.1: Monorepo Foundation & Local Development Environment

As a developer building the competition platform,
I want a fully scaffolded Turborepo monorepo with all packages configured and a working local development environment,
So that all subsequent development has a consistent, type-safe, deployable foundation.

**Acceptance Criteria:**

**Given** the repository is cloned and `pnpm install` is run
**When** the install completes
**Then** all packages resolve without errors and the workspace dependency graph is correct

**Given** the local environment
**When** `docker-compose up` is run
**Then** PostgreSQL starts on port 5432 and Redis starts on port 6379, both accessible from `apps/api`

**Given** TypeScript strict mode is configured in `packages/config-typescript`
**When** any package is compiled via `pnpm build`
**Then** zero TypeScript errors are reported across the entire monorepo

**Given** a code change is committed
**When** Husky pre-commit hook runs
**Then** ESLint and Prettier pass on all staged files before the commit is accepted

**Given** a push to the main branch
**When** GitHub Actions CI runs
**Then** lint → typecheck → test → build completes successfully and deploys to Fly.io in under 5 minutes

**And** the following packages exist with their defined roles:

- `apps/api` — NestJS modular monolith (empty module structure)
- `apps/web` — Next.js App Router with Tailwind + shadcn/ui initialized
- `packages/db` — Drizzle schema + migrations folder (empty schema, db client configured)
- `packages/shared` — TypeScript types, event contracts, error codes (folder structure only)
- `packages/format-sdk` — CompetitionFormat interface (empty shell, to be defined in Epic 3)
- `packages/config-eslint` — shared ESLint config
- `packages/config-typescript` — shared tsconfig

### Story 1.2: Organizer Account Creation & Authentication

As an organizer,
I want to create an account using my email or a Google/GitHub OAuth provider and securely log in,
So that I have authenticated access to my competition management dashboard.

**Acceptance Criteria:**

**Given** the sign-up page
**When** I enter a valid email and complete Clerk's registration flow
**Then** my organizer account is created and I am redirected to my dashboard

**Given** the sign-up page
**When** I click "Continue with Google" and authorize
**Then** my account is created via OAuth and I am redirected to my dashboard without creating a password

**Given** I am logged in with a valid session
**When** my 15-minute JWT expires
**Then** a refresh token automatically issues a new JWT with no interruption to my session

**Given** I am not logged in
**When** I navigate to any route under `(admin)/`
**Then** Next.js middleware redirects me to the sign-in page

**Given** I am logged in
**When** I click "Sign out"
**Then** my Clerk session is invalidated, all auth tokens are cleared, and I am redirected to the sign-in page

### Story 1.3: Organizer Competition Dashboard Shell

As an organizer,
I want to see my personal dashboard listing all my competitions with proper data isolation,
So that I can manage my events knowing my data is completely private from other organizers.

**Acceptance Criteria:**

**Given** I am logged in as an organizer with no competitions yet
**When** I visit my dashboard
**Then** I see an empty state with a "Create your first competition" prompt

**Given** I am logged in and have created competitions
**When** I visit my dashboard
**Then** I see only my own competitions listed — no other organizer's data is visible

**Given** another organizer's competitions exist in the database
**When** I make any database query
**Then** PostgreSQL RLS (using `current_setting('session.current_organization_id')`) silently filters their data — even a direct SQL query returns zero rows from their tenant

**Given** the dashboard page
**When** it loads
**Then** the static shell renders in under 2 seconds (PPR) with the layout visible before dynamic competition data streams in

**Given** the system dark mode preference is active
**When** the dashboard renders
**Then** all UI elements display with correct contrast meeting WCAG AA (4.5:1 minimum)

---

## Epic 2: Competition Creation & Judge Access

Organizer can create and fully configure a Cypher → Battles competition — define evaluation criteria, register participants, configure judge groups and advancement rules — and generate judge invite links that judges use to access their scoring interface.

### Story 2.1: Create a Competition

As an organizer,
I want to create a new competition with a name, date, and description,
So that I have a configured event container to build my competition around.

**Acceptance Criteria:**

**Given** I am on my dashboard
**When** I click "Create Competition" and fill in the name, date, and optional description
**Then** a new competition is created in draft state and I am taken to the competition configuration screen

**Given** I submit the form with a missing required name
**When** the form validates
**Then** a validation error is shown and the competition is not created

**Given** I create a competition
**When** it is saved
**Then** it belongs to my organization (RLS) and is invisible to other organizers

**And** the competition is stored with a server-generated nanoid (never auto-increment integer)

### Story 2.2: Define Cypher Evaluation Criteria

As an organizer,
I want to define the scoring criteria for the Cypher phase (e.g., Musicality, Technique, Creativity),
So that judges know exactly what to score and on what scale.

**Acceptance Criteria:**

**Given** I am on the competition configuration screen
**When** I add a criterion with a name, minimum (0.00), maximum (10.00), and 2-decimal precision
**Then** the criterion is saved and appears in my criteria list

**Given** I have at least one criterion defined
**When** I add another criterion
**Then** I can have multiple criteria with independent names and score ranges

**Given** I try to save a criterion with min ≥ max
**When** the form validates
**Then** a validation error is shown: "Minimum must be less than maximum"

**Given** I have configured criteria for a previous competition
**When** I create a new competition
**Then** I can select "Use existing template" to copy those criteria into the new competition (FR10)

### Story 2.3: Register Participants

As an organizer,
I want to manually register participants by name and unique ID,
So that the system knows who is competing and can track them through the competition.

**Acceptance Criteria:**

**Given** I am on the competition configuration screen
**When** I enter a participant name and unique ID and click "Add"
**Then** the participant appears in my participant list

**Given** I try to add a participant with a duplicate ID
**When** I submit
**Then** an error is shown: "A participant with this ID already exists in this competition"

**Given** I have registered participants
**When** I select "Individual" or "Pairs" as the participant format
**Then** this preference is saved and used by the Cypher scoring engine for partner rotation (FR4)

**Given** I want to remove a participant before the competition starts
**When** I click the remove button next to their name
**Then** they are removed from the participant list

### Story 2.4: Configure Judge Groups & Advancement Rules

As an organizer,
I want to configure how many judges will participate, how they are divided into groups, and how many participants advance to Battles,
So that the system can auto-assign participants and determine the Battles bracket size.

**Acceptance Criteria:**

**Given** I am on the competition configuration screen
**When** I set the number of judges and the number of judge groups
**Then** the system shows a preview of how participants will be distributed across groups (e.g., "3 groups of 3 judges — each judge evaluates ~8 participants")

**Given** I set an advancement threshold of top N
**When** the Cypher phase completes
**Then** exactly the top N ranked participants advance to Battles (FR7)

**Given** I configure the Battles phase judge count independently
**When** I set a different number from the Cypher judge count
**Then** both values are saved independently and used in their respective phases (FR8)

**Given** I configure tie-breaking as "re-vote"
**When** a Battles matchup ends in a tie
**Then** judges are prompted to vote again on that matchup (FR9)

**And** all numeric configuration values are validated with Zod schemas before saving

### Story 2.5: Generate & Share Judge Invite Links

As an organizer,
I want to generate cryptographically secure judge invite links for my competition,
So that judges can access the scoring interface instantly via WhatsApp without creating an account.

**Acceptance Criteria:**

**Given** I am on the competition configuration screen
**When** I click "Generate Judge Links"
**Then** one or more judge invite links are created with cryptographically random tokens (nanoid) scoped to this specific competition (FR58, FR59)

**Given** a judge invite link is generated
**When** I copy it and send it via WhatsApp
**Then** any device that opens the link is taken directly to the judge scoring interface for this competition without requiring sign-up

**Given** a judge token is validated on the server
**When** the token is not found or is for a different competition
**Then** the judge receives a "Link not valid" error and cannot access the scoring interface

**Given** a judge opens their invite link
**When** they land on the scoring interface
**Then** they see only the scoring interface — no competition management, no other judges' scores, no admin controls (FR60)

**And** judge tokens are stored with a cryptographic hash — the raw token is never stored in the database

---

## Epic 3: Live Cypher Scoring

Judges access the scoring interface via WhatsApp link (no signup) and submit numeric scores in real-time. Organizer and public can see live standings on a projected screen as scores flow in. Offline queue handles venue Wi-Fi drops transparently.

### Story 3.1: Format SDK & Cypher Battles Format Definition

As a competition platform,
I want a defined and validated `CompetitionFormat` interface with the Cypher Battles format implemented against it,
So that all scoring logic, phase rules, and UI components are encapsulated in the format — keeping the platform runtime format-agnostic.

**Acceptance Criteria:**

**Given** the `packages/format-sdk` package
**When** a format is implemented
**Then** it must satisfy the full `CompetitionFormat` interface (identity, scoringSchema, phases, stateMachine, validators, fairnessRules, ui)

**Given** the `packages/formats/cypher-battles` package
**When** the SDK validation suite runs (`npx @competition-platform/format-sdk validate`)
**Then** all 5 validation gates pass: interface compliance, schema consistency, state machine reachability, UI component rendering, fairness rules consistency

**Given** the Cypher Battles format's scoring schema
**When** a criterion value is defined
**Then** min < max is enforced, precision is 2 decimal places, and scores are represented as strings (never floating point)

**Given** the Cypher Battles state machine
**When** the XState config is parsed
**Then** all phases are reachable (cypher → battles), no dead-end states exist, and terminal states are properly defined

**And** platform modules in `apps/api` interact with the Cypher Battles format only through the `CompetitionFormat` interface — never by importing from `packages/formats/cypher-battles` directly

### Story 3.2: Cypher Phase Start & Judge Group Assignment

As an organizer,
I want to start the Cypher phase so that the system automatically assigns participants to judge groups,
So that each judge knows exactly which participants they are responsible for scoring.

**Acceptance Criteria:**

**Given** a competition is fully configured (criteria, participants, judge groups defined)
**When** I click "Start Cypher Phase"
**Then** the system uses round-robin assignment to distribute participants evenly across judge groups (FR11)

**Given** the Cypher phase has started
**When** a judge opens their invite link
**Then** they see only the participants assigned to their group — not other groups' participants (FR12)

**Given** the participant count does not divide evenly into judge groups
**When** assignment runs
**Then** participants are distributed as evenly as possible (off-by-one acceptable) with no participant left unassigned

**Given** the phase has started
**When** an assignment is generated
**Then** a `competition-started` domain event is emitted to the append-only event store with the full assignment payload

**And** the Socket.IO gateway opens the competition namespace with rooms: `competition:{id}:admin`, `competition:{id}:judge:{judgeId}`, `competition:{id}:public`

### Story 3.3: Judge Scoring Interface (Cypher Mode)

As a judge,
I want to open my invite link and score each assigned participant on all criteria from my phone,
So that I can submit scores quickly and accurately during a live competition with zero training needed.

**Acceptance Criteria:**

**Given** I open my judge invite link on a mobile phone
**When** the page loads
**Then** it loads in under 1 second on a 4G connection and I see the scoring interface immediately (NFR4)

**Given** I am on the scoring interface
**When** the current participant is displayed
**Then** I see the participant name, ID, and all configured criteria with numeric input fields (FR30)

**Given** I enter scores for all criteria
**When** I tap the "Submit" button (56px+ touch target)
**Then** a confirmation appears within 500ms and the next participant is shown (NFR1, FR32)

**Given** I lock my phone screen mid-scoring
**When** I unlock it
**Then** the scoring page is exactly where I left it with all entered values preserved (FR34)

**Given** I am on the scoring interface
**When** I am between participants or waiting for the next round
**Then** I see "Waiting for next round..." — no competition management controls or other judges' data are visible (FR35)

**And** touch targets for all interactive elements are 56px minimum height/width, contrast meets WCAG AAA (7:1), and the full score-submit cycle completes in under 10 seconds

### Story 3.4: Real-Time Score Aggregation & Live Standings

As an organizer (and competitor watching the projected screen),
I want submitted scores to aggregate in real-time and update the live standings,
So that the competition state is always visible and current for everyone in the venue.

**Acceptance Criteria:**

**Given** a judge submits a score
**When** the server receives it
**Then** the per-participant-per-judge score is calculated (sum of all criteria) and persisted to the append-only event store (FR13, FR14, NFR11)

**Given** scores have been submitted by multiple judges for a participant
**When** any new score is submitted
**Then** the final participant score (aggregated across all judges who scored them) is recalculated and the leaderboard is updated (FR15, FR16)

**Given** the live standings public URL (`/public/{competitionId}`)
**When** any score is submitted
**Then** the leaderboard on that URL updates within 10 seconds via WebSocket broadcast (FR45, FR47, NFR3)

**Given** I am the organizer watching my dashboard
**When** scores are flowing in
**Then** I see the current standings updating in real-time with no manual refresh needed

**And** every score submission is idempotency-keyed — if a judge's client retries a submission, the server deduplicates and returns the same confirmation without double-counting

### Story 3.5: Offline Score Queue & Connection Resilience

As a judge,
I want my scores to be saved locally and auto-submitted when my connection returns,
So that venue Wi-Fi drops never cause me to lose entered scores or miss a submission.

**Acceptance Criteria:**

**Given** I enter a score and tap Submit while offline
**When** the submission fails due to no connection
**Then** the UI shows "Queued — will submit when connection returns" (not an error screen) and the score is persisted to localStorage (FR33, NFR19)

**Given** I have queued scores in localStorage
**When** my connection returns
**Then** the Service Worker automatically retries all queued submissions in order within 5 seconds (NFR6, NFR18)

**Given** queued scores are submitted on reconnect
**When** the server receives them
**Then** each is processed with its idempotency key — no duplicates are created even if the same score was retried multiple times

**Given** I am offline for up to 5 minutes
**When** connectivity returns
**Then** all queued scores are submitted successfully and I see "Score submitted ✓" confirmations for each (NFR18)

**Given** I enter score values but have not yet tapped Submit
**When** my browser crashes or the page refreshes
**Then** my entered-but-not-submitted values are restored from localStorage on reload

**And** the connection status indicator is always visible: green dot (connected) → yellow pulse (reconnecting) → red dot (disconnected)

### Story 3.6: Cypher Phase Completion & Advancement Review

As an organizer,
I want to review the final Cypher standings and confirm which participants advance to Battles,
So that I have visibility and control before the competition moves to the elimination phase.

**Acceptance Criteria:**

**Given** all judges have submitted scores for all their assigned participants
**When** I view the Cypher results screen
**Then** I see all participants ranked by their final aggregated score with a clear top-N highlight showing who advances (FR16, FR17, FR19)

**Given** the participant format is "pairs" and partner rotation is configured
**When** scores are aggregated
**Then** each individual's score is calculated independently across all partners they were evaluated with (FR18)

**Given** I am reviewing Cypher results
**When** I am satisfied with the standings
**Then** I click "Confirm Advancement" and the top N participants are locked in for the Battles bracket

**Given** I confirm advancement
**When** the transition is triggered
**Then** a `phase-transitioned` domain event is emitted to the event store recording: from phase, to phase, advanced competitor IDs, trigger type ("admin_confirmed")

---

## Epic 4: Organizer Mission Control & Admin Overrides

Organizer has full mission control: a live dashboard with judge connection monitoring, score overrides with mandatory reasons recorded in an immutable audit trail, competitor withdrawal with automatic bracket recalculation, competitor rescue, phase transition control, and solo scoring mode for small events.

### Story 4.1: Live Organizer Dashboard & Judge Monitoring

As an organizer,
I want a live mission control dashboard showing the full competition state and every judge's submission status,
So that I can glance at the screen and know exactly what's happening — and spot problems — in under 3 seconds.

**Acceptance Criteria:**

**Given** a competition is in progress
**When** I view my organizer dashboard
**Then** I see the current phase, all incoming scores/votes in real-time, current standings, and the count of pending vs submitted scores per judge group (FR36)

**Given** I am watching the dashboard
**When** a judge's WebSocket connection drops
**Then** their status immediately changes to "Disconnected" with a yellow warning indicator — no page refresh needed (FR37)

**Given** a judge has a pending unsubmitted score
**When** I view the dashboard
**Then** I see a "1 pending score" badge on that judge's status card

**Given** a judge reconnects after a drop
**When** their queued scores auto-submit
**Then** their status returns to "Connected" and the pending badge clears automatically

**Given** the dashboard page
**When** it loads
**Then** the static shell appears in under 2 seconds (PPR) and live data streams in via WebSocket (NFR5)

**And** the dashboard uses Tremor stat cards and KPI indicators for score counts, judge status, and phase progression — status colors (green/yellow/red) are used only for system state, never for branding

### Story 4.2: Score Override & Immutable Audit Trail

As an organizer,
I want to modify a submitted score with a mandatory written reason,
So that exceptional situations can be handled transparently with a full record of every change made.

**Acceptance Criteria:**

**Given** a score has been submitted by a judge
**When** I navigate to that score in the admin panel and click "Override Score"
**Then** I am shown the current score and a mandatory reason field — the Save button is disabled until a reason is entered (FR38, NFR12)

**Given** I enter a new score value and a reason
**When** I click Save
**Then** a `score-overridden` compensating event is appended to the event store — the original `score-submitted` event is never modified or deleted (NFR11)

**Given** a score has been overridden
**When** I view the audit trail for that competition
**Then** I see: original score, new score, who changed it, when, and the written reason (FR44)

**Given** I try to save an override with an empty reason field
**When** the form submits
**Then** validation blocks the save and shows "A reason is required for all score modifications" — no silent changes are ever possible (NFR12)

**Given** multiple overrides exist for the same participant
**When** I view the score history
**Then** the full chain of original → override → override is visible in chronological order, fully reconstructable

### Story 4.3: Competitor Withdrawal & Rescue

As an organizer,
I want to mark a participant as withdrawn or rescue an eliminated competitor — with automatic recalculation — and a mandatory reason logged,
So that mid-event disruptions are handled fairly and every decision is fully auditable.

**Acceptance Criteria:**

**Given** a participant needs to withdraw during the competition
**When** I select them in the admin panel and click "Mark as Withdrawn"
**Then** they are removed from all future scoring rounds and the bracket recalculates automatically with byes or advancements adjusted (FR40, FR41)

**Given** I initiate a withdrawal
**When** the recalculation runs
**Then** updated standings/bracket are broadcast via WebSocket to all connected clients within 2 seconds (NFR7)

**Given** a competitor has been eliminated on points
**When** I click "Rescue Competitor" and enter a mandatory reason
**Then** they are reinstated into the next round and a `competitor-rescued` event is appended to the event store with: who rescued, when, which judges requested it, and the written reason (FR39)

**Given** I try to rescue or withdraw a participant without entering a reason
**When** I submit the form
**Then** validation blocks the action — no override is possible without a documented reason (NFR12)

**Given** any withdrawal or rescue has occurred
**When** I or anyone with audit access views the event log
**Then** every action is traceable: what changed, who authorized it, when, and why (FR44)

### Story 4.4: Solo Scoring Mode & Phase Transition Control

As an organizer,
I want to score participants directly from the admin panel and explicitly control phase transitions,
So that I can run small events single-handedly and maintain authoritative control over when the competition advances.

**Acceptance Criteria:**

**Given** I am in solo operation mode (no separate judge accounts)
**When** I open the admin scoring panel
**Then** I can score participants using the same criteria fields as judges — scores are submitted under my organizer identity (FR43)

**Given** I am scoring directly as the organizer
**When** I submit a score
**Then** it is treated identically to a judge submission: persisted to the event store, aggregated in real-time, and broadcast to all WebSocket clients

**Given** the Cypher phase is complete and I have reviewed the standings
**When** I click "Confirm Advancement to Battles"
**Then** the top N participants are locked in, the phase transitions to Battles, and a `phase-transitioned` event is recorded in the event store (FR42)

**Given** I have not yet confirmed advancement
**When** I am reviewing Cypher results
**Then** I can scroll through all scores and standings — the competition is paused at the review checkpoint until I explicitly confirm

**Given** unexpected circumstances require holding the competition at the current phase
**When** I choose not to click "Confirm Advancement"
**Then** the competition remains in Cypher review state indefinitely until I take explicit action — no automatic advancement occurs

---

## Epic 5: Battles Phase & Competition Completion

Competition advances from Cypher qualifiers into a single-elimination bracket. Judges vote Player 1 / Player 2 / Tie per matchup. Bracket progresses automatically — including bye handling and tie-breaking — to produce a final winner.

### Story 5.1: Battles Bracket Generation

As an organizer,
I want the system to automatically generate a tournament bracket from the Cypher qualifiers,
So that the Battles phase has a fair, properly seeded structure ready for judging the moment Cypher results are confirmed.

**Acceptance Criteria:**

**Given** the Cypher advancement has been confirmed with N qualifiers
**When** the Battles bracket is generated
**Then** participants are seeded by their Cypher final score (rank 1 vs rank N, rank 2 vs rank N-1, etc.) in a single-elimination bracket (FR20)

**Given** the number of qualifiers is not a power of two (e.g., 10 or 12)
**When** the bracket is generated
**Then** byes are assigned to the top-seeded participants in the first round so the bracket reduces to the nearest power of two (FR26)

**Given** the bracket is generated
**When** I view it on the organizer dashboard
**Then** I see all matchups, seeds, and bye slots clearly displayed with participant names

**Given** the bracket is generated
**When** it is broadcast via WebSocket
**Then** the public standings URL updates to show the Battles bracket view within 10 seconds (NFR3)

**And** bracket generation emits a `bracket-generated` domain event to the event store with the full seeding and matchup structure

### Story 5.2: Judge Voting Interface (Battles Mode)

As a judge,
I want to see each Battles matchup and cast my vote for Player 1, Player 2, or Tie,
So that I can judge elimination rounds as quickly as the Cypher scoring phase.

**Acceptance Criteria:**

**Given** a Battles matchup is active and I am an assigned judge
**When** the matchup is pushed to my device
**Then** I see both competitors' names clearly and three large voting buttons: "Player 1", "Player 2", "Tie" (FR31)

**Given** I tap one of the three voting options
**When** my vote submits
**Then** a confirmation appears within 300ms and I wait for the next matchup (NFR2, FR32)

**Given** my connection drops between matchups
**When** a vote is queued offline
**Then** it auto-submits on reconnect with idempotency protection — identical to the Cypher offline behavior (FR33)

**Given** I am a Battles judge
**When** I open my scoring interface
**Then** I see only the current matchup assigned to me — no bracket structure, no other matchups, no admin controls (FR35)

**And** voting touch targets are 56px+ minimum, each button is visually distinct (not just labelled), and contrast meets WCAG AAA (7:1)

### Story 5.3: Bracket Progression & Winner Determination

As an organizer,
I want the bracket to progress automatically as each matchup's votes come in, handling ties according to the configured rules,
So that the competition moves forward without manual intervention until we have a final winner.

**Acceptance Criteria:**

**Given** all assigned judges have voted on a matchup
**When** the votes are tallied
**Then** the participant with the majority of votes advances automatically to the next round (FR23, FR25)

**Given** a matchup ends in a tie (equal votes for Player 1 and Player 2)
**When** the tie-breaking rule is "re-vote"
**Then** judges are immediately prompted to vote again on the same matchup (FR24)

**Given** a matchup ends in a tie and the tie-breaking rule is "organizer decision"
**When** the tie is detected
**Then** the organizer is alerted and can manually select the winner with a mandatory reason logged to the audit trail

**Given** the final matchup of the bracket concludes
**When** the winner is determined
**Then** the competition status is set to "Complete", the winner is displayed prominently on the public URL, and a `competition-completed` event is emitted to the event store (FR27)

**Given** any bracket update occurs (advancement, bye resolution, winner)
**When** the state changes
**Then** all connected WebSocket clients (admin, public) receive the updated bracket state within 10 seconds (NFR3)

**And** every vote and bracket progression event is appended to the event store — the full competition is reconstructable from events alone (NFR21)

---

## Epic 6: Public Standings, Bracket View & Presenter Mode

Competitors and audience see real-time standings with score breakdowns and the full Battles bracket on projected screens. Organizer has a dedicated MC/presenter teleprompter view (large text, glanceable, mobile) for live announcing — distinct from the admin dashboard.

### Story 6.1: Public Standings with Score Breakdowns

As a competitor watching the projected screen,
I want to see my ranking, score breakdown, and upcoming matchup information on the public display,
So that I understand exactly where I stand and what happens next — with full transparency into how scores were calculated.

**Acceptance Criteria:**

**Given** the public standings URL (`/public/{competitionId}`) is open on a projected screen
**When** participants view it
**Then** each participant's rank, final score, and per-criterion score breakdown are visible — not just a total (FR49)

**Given** I am a competitor watching the display
**When** I find my name in the standings
**Then** I can see my individual scores from each judge group (aggregated, not per-judge) to understand how my ranking was calculated

**Given** the Battles bracket is active
**When** I view the public display
**Then** I can see the full bracket with my name, my current position, and my next matchup opponent (FR48)

**Given** a score or bracket update occurs
**When** it propagates via WebSocket
**Then** the public display updates within 10 seconds — no page refresh needed (NFR3)

**Given** the public URL is accessed by an unauthenticated device (projected screen, competitor's phone)
**When** the page loads
**Then** it is fully accessible with no login required — read-only, no admin controls visible

**And** the public standings page is server-rendered for fast initial load, with WebSocket overlay for live updates

### Story 6.2: Full Battles Bracket View on Public URL

As a competitor and audience member,
I want to see the full elimination bracket on the projected screen as it progresses in real-time,
So that everyone in the venue can follow the competition trajectory and anticipate upcoming matchups.

**Acceptance Criteria:**

**Given** the Battles phase is active
**When** the public URL is viewed on a projected screen or large monitor
**Then** the complete bracket is displayed: all matchups, round structure, winners advancing, and the final champion once determined (FR46)

**Given** a matchup result is confirmed
**When** the winner advances in the bracket
**Then** the bracket view updates automatically on the public display within 10 seconds showing the progression (NFR3)

**Given** a bye exists in the bracket
**When** the bracket is displayed
**Then** the bye slot is visually distinct (e.g., "BYE — advances automatically") so the bracket structure is clear

**Given** the competition is complete
**When** the final winner is determined
**Then** the bracket view highlights the champion prominently — their name, seed, and path through the bracket are all visible

**And** the bracket layout scales correctly for large projected screens (1920×1080 minimum) and also remains readable on a mobile phone

### Story 6.3: Presenter / MC Teleprompter View

As an organizer running MC duties on a second device,
I want a dedicated presenter view showing exactly what I need to announce right now and what's coming next,
So that I can MC the competition confidently from my phone without switching between the admin dashboard and a notes app.

**Acceptance Criteria:**

**Given** I am logged in as an organizer and open the presenter view on my phone
**When** the presenter view loads
**Then** I see large-text, glanceable information: current competition name, current phase, current round, competitors currently performing, and what's next (not the full admin dashboard)

**Given** the competition advances to the next round or phase
**When** the admin dashboard confirms the transition
**Then** the presenter view updates in real-time via WebSocket — my phone shows the new state within 3 seconds without any manual action

**Given** I need to announce a matchup
**When** I look at my presenter view
**Then** competitor names are displayed in the largest possible text (designed for glancing, not reading), formatted for verbal announcement (e.g., "Up next: Maria vs. Carlos")

**Given** the presenter view is open on my phone
**When** I also have the admin dashboard open on my laptop
**Then** both views stay in real-time sync — the presenter view reflects exactly the current competition state that the admin sees

**And** the presenter view uses the `(presenter)/` route group, requires organizer authentication, has no admin controls, and is mobile-first with generous touch targets (56px+) and maximum text contrast

---

## Epic 7: Simulation Mode & Judge Training

Organizer can run a complete rehearsal of the full Cypher → Battles competition flow without real judges or participants. Supports judge training (judges access via link and practice scoring) and format validation before going live. Simulation mode is visually distinct but UX-identical to live mode.

### Story 7.1: Create a Simulation Competition

As an organizer,
I want to create a competition in simulation mode with auto-generated mock participants,
So that I can rehearse the full competition flow without needing real competitors or a live event.

**Acceptance Criteria:**

**Given** I am on my dashboard
**When** I click "Create Simulation" and configure it (or clone an existing competition's config)
**Then** a competition is created in simulation mode with all the same configuration fields as a live competition (FR50)

**Given** I choose to auto-generate mock participants
**When** I specify a count (e.g., 24)
**Then** the system generates that many mock participants with placeholder names (e.g., "Competitor 01") ready for scoring

**Given** a simulation competition is created
**When** it appears on my dashboard
**Then** it is clearly marked with a "SIMULATION" badge — visually distinct from live competitions but using the identical UI layout (FR54)

**Given** I create a simulation
**When** it is saved to the database
**Then** it is flagged with `simulation: true` — simulation data is never mixed into live competition results or standings

### Story 7.2: Organizer Runs Full Simulation as All Roles

As an organizer,
I want to act as all roles — organizer, all judges — from the admin panel during a simulation,
So that I can walk through the complete Cypher → Battles flow and validate every step before going live.

**Acceptance Criteria:**

**Given** a simulation competition is in Cypher phase
**When** I open the admin scoring panel
**Then** I can submit scores for any participant as any judge group — without needing separate judge sessions open (FR51)

**Given** I have scored all participants across all judge groups
**When** I confirm advancement
**Then** the top N participants are identified and the Battles bracket generates — identical to live competition behavior (FR52)

**Given** the Battles phase is active in simulation
**When** I open the admin voting panel
**Then** I can cast votes for any matchup as any judge — progressing the bracket until a winner is determined (FR52)

**Given** I am running the simulation
**When** I use the admin scoring/voting panel
**Then** all real-time WebSocket events fire normally — standings update, bracket progresses, public URL reflects changes — exactly as in a live competition

**And** simulation uses the identical code paths as live competitions — no special simulation-only logic branches

### Story 7.3: Simulation Reset & Judge Training Access

As an organizer,
I want to restart or reset a simulation at any point and let real judges practice scoring via their invite links,
So that I can iterate on format configuration and train judges before the actual event.

**Acceptance Criteria:**

**Given** I am mid-simulation and want to change a configuration parameter
**When** I click "Reset Simulation"
**Then** all scores, votes, and bracket data are cleared and the simulation returns to its initial configured state — ready to run again (FR53)

**Given** I reset a simulation
**When** the reset completes
**Then** a confirmation is shown and I can immediately restart from the Cypher phase with the same (or updated) configuration

**Given** I want to train judges before an event
**When** I generate judge invite links for a simulation competition
**Then** real judges can open those links, see the scoring interface, and submit practice scores — identical to a live judge experience (FR55)

**Given** a judge submits a score in simulation mode
**When** the score is processed
**Then** it is clearly stored as simulation data — it does not appear in any live competition leaderboards or analytics

**Given** I have run multiple simulation resets
**When** I view the simulation's event log
**Then** each reset is recorded as a `simulation-reset` event with timestamp — the full simulation history is auditable

---

## Epic 8: Internationalization

Platform supports Spanish and English with runtime language switching, persistent language preference across sessions, and zero hardcoded strings across all views and roles.

### Story 8.1: i18next Configuration & Translation Infrastructure

As a developer,
I want a fully configured i18next setup with all existing UI strings externalized into translation files,
So that the platform has a single, maintainable source of truth for all user-facing text in both Spanish and English.

**Acceptance Criteria:**

**Given** any user-facing string in the platform (button labels, error messages, status indicators, page titles)
**When** it is rendered
**Then** it is served from an i18n translation key — no hardcoded strings exist anywhere in `apps/web` (FR64)

**Given** the `en.json` and `es.json` translation files
**When** a new key is added to one
**Then** the same key must exist in the other — a missing-key linting rule or CI check enforces this

**Given** an i18n key exists in code but has no translation entry
**When** the app renders that key
**Then** the key name itself is displayed (safe fallback) rather than crashing — and a console warning identifies the missing translation

**Given** all structured error codes from `packages/shared/errors`
**When** they surface to users
**Then** they resolve through i18n keys — never raw error code strings visible to users

**And** the i18next configuration supports runtime language switching without a page reload

### Story 8.2: Language Switcher & Persistent Preference

As a user (organizer, judge, or competitor),
I want to switch the platform language between Spanish and English and have my preference remembered,
So that I always experience the platform in the language I'm most comfortable with.

**Acceptance Criteria:**

**Given** I am on any page of the platform
**When** I use the language switcher (available in all views: admin, judge, presenter, public)
**Then** the entire UI switches to the selected language immediately — no page reload required (FR62)

**Given** I select Spanish as my language
**When** I close the browser and return to the platform
**Then** the platform remembers my preference and loads in Spanish (FR63)

**Given** I am a judge accessing via invite link
**When** I switch the language on the scoring interface
**Then** all criteria labels, button text, status messages, and error messages switch to my selected language

**Given** I am an organizer on the admin dashboard
**When** I switch to Spanish
**Then** all dashboard labels, Tremor chart legends, status indicators, and navigation items display in Spanish

**Given** the public standings URL is open on a projected screen
**When** the organizer or screen operator switches the language
**Then** the standings, bracket labels, and all UI text update to the selected language

**And** the language preference is stored in localStorage (for judges without accounts) and in the user profile (for authenticated organizers)
