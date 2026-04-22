---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Competition Platform Tech Stack — Cost-Efficient, Globally Deployable, Auto-Scaling'
research_goals: 'Define and validate the optimal tech stack for a real-time WebSocket competition platform prioritizing cost efficiency, auto-scaling, worldwide edge deployment, reliability for money-involved competitions, and edge case control'
user_name: 'Dragonarka'
date: '2026-03-24'
web_research_enabled: true
source_verification: true
---

# Building a Trustworthy Real-Time Competition Platform: Comprehensive Technical Stack Research

**Date:** 2026-03-24
**Author:** Dragonarka
**Research Type:** Technical Architecture & Stack Selection

---

## Executive Summary

This research evaluates and recommends the optimal technology stack for a real-time WebSocket competition platform — a system where money is on the line, reliability is non-negotiable, and global deployment close to physical events is a core requirement. The proposed stack (NestJS + Next.js + PostgreSQL + Redis + Kubernetes) was benchmarked against modern alternatives across six dimensions: cost efficiency, global edge deployment, auto-scaling, reliability, security, and developer experience.

The research reveals that while the original stack choices for language (TypeScript), backend (NestJS), frontend (Next.js), and database (PostgreSQL) remain strong, **significant cost and operational improvements are achievable** by replacing Kubernetes with Fly.io (75–85% cost reduction for MVP), adopting Neon Serverless PostgreSQL (scale-to-zero between events), using Upstash Redis (pay-per-request), and switching from Keycloak to Clerk (SOC 2 compliance with zero-ops). The total MVP cost drops from $200–500/mo (K8s) to **$35–70/mo** (Fly.io), with idle periods costing as little as $5–15/mo.

The platform architecture centers on a **modular monolith** (aligned with the 2025–2026 industry trend away from premature microservices), **event sourcing for scoring integrity** (immutable audit trail critical for money-involved competitions), and a **formal tournament state machine** (XState) ensuring no invalid state transitions are possible. The competition industry is projected to reach $4.5B in 2026, growing at 21% CAGR — the technology choices made now must support scaling from MVP to global platform.

**Key Technical Findings:**

- **Fly.io replaces Kubernetes** — 30+ global regions, deploy-per-event with one command, scale-to-zero, 75–85% cost savings
- **Event Sourcing + CQRS** is non-negotiable for scoring — immutable audit trail, time-travel for dispute resolution, replay capability
- **Modular Monolith > Microservices** for teams <10 developers — 42% of microservices adopters are consolidating back (CNCF 2025)
- **PostgreSQL RLS** for multi-tenant data isolation — 1–5% overhead, database-enforced security
- **Clerk over Keycloak** for MVP — SOC 2 compliance, MFA, breach detection, zero-ops

**Top 5 Recommendations:**

1. Deploy on **Fly.io** with per-event regional scaling (not Kubernetes)
2. Use **event sourcing** for all scoring decisions (PostgreSQL append-only store)
3. Structure as **NestJS modular monolith** with DDD bounded contexts
4. Adopt **Clerk** for authentication (SOC 2, multi-tenancy, MFA)
5. Implement **XState** for tournament lifecycle state machine

## Table of Contents

1. [Technical Research Scope Confirmation](#technical-research-scope-confirmation)
2. [Technology Stack Analysis](#technology-stack-analysis)
   - Programming Languages
   - Backend Frameworks (NestJS vs Hono vs Encore.ts)
   - Frontend Frameworks (Next.js vs SvelteKit vs Remix)
   - Databases (PostgreSQL, Neon, Supabase, CockroachDB)
   - In-Memory State (Redis vs Cloudflare Durable Objects)
   - Authentication (Keycloak vs Clerk vs Auth.js)
   - Cloud Infrastructure (Kubernetes vs Fly.io vs Railway vs Cloudflare)
3. [Integration Patterns Analysis](#integration-patterns-analysis)
   - Communication Protocols (WebSocket vs WebTransport vs SSE)
   - Message Broker / Pub-Sub (Redis Adapter vs NATS vs Kafka)
   - API Design Patterns (REST + WebSocket Hybrid)
   - Event-Driven Architecture & Audit Trail (Event Sourcing + CQRS)
   - WebSocket Reconnection & Offline Tolerance
   - Integration Security (JWT over WebSocket)
4. [Architectural Patterns and Design](#architectural-patterns-and-design)
   - System Architecture (Modular Monolith → Microservices)
   - Tournament State Machine (XState FSM)
   - Multi-Tenancy & Data Isolation (PostgreSQL RLS)
   - Horizontal WebSocket Scaling
   - Security Architecture (Server Authority, Anti-Cheat)
   - Data Compliance (GDPR, Data Residency)
   - Deployment Topology
5. [Implementation Approaches](#implementation-approaches-and-technology-adoption)
   - Project Structure & Module Organization
   - CI/CD Pipeline (GitHub Actions → Fly.io)
   - Testing Pyramid (Vitest + Playwright + k6)
   - Monitoring & Observability
   - Cost Optimization (MVP vs Event vs Idle estimates)
   - Risk Assessment & Mitigation
6. [Technical Research Recommendations](#technical-research-recommendations)
   - Recommended Tech Stack (Final Table)
   - Implementation Roadmap (12 Weeks)
   - Skill Development Requirements
   - Success Metrics & KPIs
7. [Research Synthesis & Future Outlook](#research-synthesis-and-future-outlook)
8. [Source Documentation](#source-documentation)

---

## Research Overview

This research was conducted over a comprehensive analysis spanning six structured phases: scope confirmation, technology stack evaluation, integration patterns analysis, architectural patterns design, implementation research, and final synthesis. Over 30 web searches were performed against current (2025–2026) sources to verify every claim against live data. The research benchmarked the proposed stack against modern alternatives, discovering that the deployment layer (Fly.io vs K8s) and authentication layer (Clerk vs Keycloak) offer the most significant improvements. The full executive summary and recommendations are provided above; detailed analysis follows in each section.

---

## Technical Research Scope Confirmation

**Research Topic:** Competition Platform Tech Stack — Cost-Efficient, Globally Deployable, Auto-Scaling
**Research Goals:** Define and validate the optimal tech stack for a real-time WebSocket competition platform prioritizing cost efficiency, auto-scaling, worldwide edge deployment, reliability for money-involved competitions, and edge case control

**Technical Research Scope:**

- Architecture Analysis - design patterns, frameworks, system architecture
- Implementation Approaches - development methodologies, coding patterns
- Technology Stack - languages, frameworks, tools, platforms
- Integration Patterns - APIs, protocols, interoperability
- Performance Considerations - scalability, optimization, patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-03-24

---

## Technology Stack Analysis

### Programming Languages

**TypeScript (Full-Stack) — Recommended. Confidence: HIGH**

TypeScript remains the dominant choice for full-stack real-time applications in 2026. Shared types between client and server are critical for a competition platform where game state, scoring models, and tournament structures must stay perfectly synchronized.

_Key Advantages for This Project:_

- Shared type definitions for tournament state machines, scoring payloads, and WebSocket message contracts
- Compile-time safety for game theory calculations (prevents runtime scoring bugs — critical when money is involved)
- Universal runtime support: runs on Node.js, Deno, Bun, Cloudflare Workers, and all edge runtimes
- Largest ecosystem of real-time libraries (Socket.IO, ws, Hono, NestJS all TypeScript-first)

_No serious alternative warranted_ — Go or Rust would add complexity without proportional benefit for this use case. TypeScript's ecosystem advantage for WebSocket + frontend is decisive.

_Source: [Best TypeScript Backend Frameworks 2026](https://encore.dev/articles/best-typescript-backend-frameworks)_

### Development Frameworks and Libraries

#### Backend Framework: NestJS vs Hono vs Encore.ts

| Criteria              | NestJS                                      | Hono                                        | Encore.ts                    |
| --------------------- | ------------------------------------------- | ------------------------------------------- | ---------------------------- |
| **Runtime**           | Node.js only                                | 9 runtimes (Workers, Deno, Bun, Node, etc.) | Node.js, cloud-native        |
| **Cold Start**        | 500–2000ms                                  | Sub-5ms on edge                             | Low (cloud-optimized)        |
| **Bundle Size**       | Heavy (~50MB+)                              | 14kB                                        | Medium                       |
| **WebSocket Support** | Built-in gateway, rooms, namespaces         | Manual (via platform APIs)                  | Pub/Sub native               |
| **Architecture**      | Opinionated (decorators, DI, modules)       | Minimal, flexible                           | Opinionated, cloud-first     |
| **Edge Deployable**   | No (long-lived process)                     | Yes (any runtime)                           | Partial                      |
| **Dev Speed**         | 30% faster than Express (built-in features) | Ultra-fast for small APIs                   | Fast for distributed systems |
| **Maturity**          | High (enterprise adoption)                  | Growing rapidly (2024–2026 breakout)        | Newer                        |

**Analysis:**

- **NestJS** is the proposed choice and remains strong for this project. Its built-in WebSocket gateway with rooms (one per competition) and namespaces (per phase) maps directly to competition requirements. Dependency injection, guards (role-based: admin/player/judge), and modular architecture reduce boilerplate by ~50%. The trade-off is it's Node-only and heavy for edge deployment.
- **Hono** processes 402,820 ops/sec and maintains sub-5ms response times at 10,000 concurrent requests. It runs on Cloudflare Workers natively. However, it lacks built-in WebSocket abstractions, DI, and guards — you'd build these yourself.
- **Encore.ts** offers native Pub/Sub for event-driven architecture and automated infrastructure provisioning, making it compelling for distributed systems.

**Verdict:** NestJS for the core competition server (where its WebSocket gateway, guards, and DI shine). Consider Hono for lightweight edge API endpoints (auth validation, CDN logic, health checks) if you adopt a Cloudflare Workers edge layer.

_Sources: [NestJS vs SonicJS vs Hono](https://sonicjs.com/blog/nestjs-vs-sonicjs-vs-hono), [Hono Benchmarks](https://hono.dev/docs/concepts/benchmarks), [Encore vs NestJS](https://dev.to/encore/nestjs-vs-encorets-choosing-the-right-framework-for-your-typescript-microservices-1g61)_

#### Frontend Framework: Next.js vs SvelteKit vs Remix

| Criteria         | Next.js 16                   | SvelteKit (Svelte 5)          | Remix (React Router v7)  |
| ---------------- | ---------------------------- | ----------------------------- | ------------------------ |
| **Ecosystem**    | Largest (React)              | Growing fast                  | Large (React)            |
| **Bundle Size**  | Heavier                      | Smallest (no virtual DOM)     | Medium                   |
| **SSR/SSG**      | PPR (Partial Prerendering)   | Excellent                     | Excellent                |
| **Real-time**    | Good (with libraries)        | Excellent (native reactivity) | Good                     |
| **Hiring Pool**  | Largest                      | Smaller                       | Large (React devs)       |
| **Dashboard UX** | Strong (shadcn/ui ecosystem) | Very smooth                   | Best for form-heavy apps |

**Analysis:**

- **Next.js 16** (Oct 2025) introduced Partial Prerendering — serves a static shell instantly, then streams dynamic content. This is ideal for admin/judge dashboards that mix static layout with live competition data. The React + shadcn/ui + Tailwind ecosystem gives you the richest component library for building complex tournament management UIs.
- **SvelteKit** with Svelte 5's runes system delivers the smallest bundles and smoothest reactivity — excellent for the player-facing real-time competition view where every millisecond matters. It started winning enterprise contracts in 2025–2026.
- **Remix** (now unified with React Router v7) excels at form-heavy CRUD apps like admin panels and dashboards.

**Verdict:** Next.js remains the recommended choice. Largest ecosystem, best hiring pool, PPR for mixed static/dynamic dashboards, and deep integration with Vercel's edge network if needed. The React ecosystem (shadcn/ui, Radix, Framer Motion) is unmatched for building complex competition management UIs.

_Sources: [Next.js vs Remix vs SvelteKit 2026](https://www.nxcode.io/resources/news/nextjs-vs-remix-vs-sveltekit-2025-comparison), [Definitive Framework Decision Guide 2026](https://dev.to/pockit_tools/nextjs-vs-remix-vs-astro-vs-sveltekit-in-2026-the-definitive-framework-decision-guide-lp5)_

### Database and Storage Technologies

#### Primary Database: PostgreSQL + Alternatives

| Criteria          | PostgreSQL (Self-managed) | Neon (Serverless PG)           | Supabase (PG Platform)   | CockroachDB                  |
| ----------------- | ------------------------- | ------------------------------ | ------------------------ | ---------------------------- |
| **Scaling Model** | Vertical + read replicas  | Auto-scale, scale-to-zero      | Dedicated compute        | Horizontal, multi-region     |
| **Multi-Region**  | Manual (replication)      | Branching, not multi-write     | Single region primary    | Native multi-region          |
| **Cost (small)**  | ~$15–50/mo (managed)      | $7.66/mo (active-only billing) | $25/mo (Pro)             | $0 free tier, then expensive |
| **Cost (scale)**  | Predictable               | Usage-based (can spike)        | Predictable tiers        | High at scale                |
| **Serverless**    | No                        | Yes (scale-to-zero)            | Partial                  | Yes (serverless tier)        |
| **Real-time**     | Triggers + LISTEN/NOTIFY  | Via app layer                  | Built-in Realtime engine | Via app layer                |
| **Audit Trail**   | Manual                    | Manual                         | Manual                   | Built-in change data capture |

**Analysis for Competition Platform:**

- **PostgreSQL is non-negotiable** for the persistent layer — tournament structures, user profiles, scoring history, audit trails. It's battle-tested for financial/money-involved systems.
- **Neon** (acquired by Databricks May 2025) offers serverless PostgreSQL that scales to zero when idle and auto-scales during events. Costs dropped significantly: storage now $0.35/GB-month (down from $1.75), compute 15–25% cheaper. At $7.66/mo for moderate usage, it's less than half of Aurora Serverless and 30% of Supabase.
- **Supabase** bundles PostgreSQL + Auth + Realtime + Storage + Edge Functions. If you want an all-in-one BaaS, it reduces integration work but gives you less control.
- **CockroachDB** is the only option with native multi-region writes — data placement control per geographic region. Overkill for MVP, but worth considering if you need tournaments running simultaneously across continents with local write latency.

**Verdict:** PostgreSQL is the core. For MVP, **Neon Serverless** gives the best cost efficiency (pay only during events, scale-to-zero between). For production at scale, managed PostgreSQL on your deployment platform (Fly.io Postgres, Railway Postgres, or RDS) with read replicas per region.

_Sources: [Neon vs Supabase Comparison](https://designrevision.com/blog/supabase-vs-neon), [Neon Price Reduction](https://neon.com/blog/major-compute-price-reduction-on-neon), [CockroachDB Multi-Region](https://oneuptime.com/blog/post/2026-02-02-cockroachdb-multi-region/view)_

#### In-Memory / Real-Time State: Redis vs Cloudflare Durable Objects

| Criteria                | Redis (Upstash/ElastiCache)              | Cloudflare Durable Objects              |
| ----------------------- | ---------------------------------------- | --------------------------------------- |
| **Latency**             | 1–5ms (same region)                      | Sub-5ms (edge, co-located)              |
| **WebSocket Support**   | Pub/Sub adapter for Socket.IO            | Native WebSocket with hibernation       |
| **State Model**         | Key-value, pub/sub, streams              | Single-threaded actor + built-in SQLite |
| **Scaling**             | Cluster mode, manual                     | Automatic, per-object                   |
| **Cost (moderate use)** | $10–50/mo (Upstash) / $50+ (ElastiCache) | ~$5/mo (with hibernation)               |
| **Multi-Region**        | Global replication (expensive)           | Automatic edge distribution             |
| **Persistence**         | Optional (RDB/AOF)                       | Built-in SQLite per object              |

**Analysis:**

- **Redis** is the proven choice for real-time scoring pub/sub, session caching, and Socket.IO multi-node coordination. Upstash offers serverless Redis with per-request pricing.
- **Cloudflare Durable Objects** are a paradigm shift: each competition room becomes a Durable Object with its own WebSocket connections and built-in SQLite. One developer reported **70% cost reduction** vs Redis while cutting latency from 150ms to 5ms. The WebSocket Hibernation API dramatically reduces costs for idle connections.

**Verdict:** For MVP with NestJS, **Redis (Upstash serverless)** is the pragmatic choice — it integrates directly with Socket.IO's Redis adapter for multi-node scaling. However, Durable Objects represent the most cost-efficient path at scale if you're willing to adopt the Cloudflare ecosystem. A hybrid approach (NestJS + Redis for core, Durable Objects for specific stateful competition rooms) is possible.

_Sources: [Why I Ditched Redis for Durable Objects](https://dzone.com/articles/why-ditch-redis-for-cloudflare-durable-objects), [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)_

### Development Tools and Platforms

#### Authentication: Keycloak vs Clerk vs Auth.js vs Supabase Auth

| Criteria             | Keycloak                  | Clerk                          | Auth.js                   | Supabase Auth               |
| -------------------- | ------------------------- | ------------------------------ | ------------------------- | --------------------------- |
| **Hosting**          | Self-hosted (open source) | Managed SaaS                   | Self-hosted (open source) | Managed (bundled)           |
| **Cost**             | Free (infra costs only)   | Free tier + usage-based        | Free                      | Included in Supabase plan   |
| **OAuth Providers**  | Extensive (SAML, OIDC)    | 20+ SSO providers              | 80+ preconfigured         | Google, GitHub, Apple, etc. |
| **MFA**              | Yes                       | Yes (with breach detection)    | Limited                   | Yes                         |
| **SAML/SSO**         | Full enterprise SSO       | Yes                            | No                        | No                          |
| **Multi-Tenancy**    | Manual configuration      | Built-in (orgs, roles)         | No                        | Via RLS policies            |
| **Compliance**       | Self-managed              | SOC 2 Type 2, CCPA             | Self-managed              | SOC 2                       |
| **DevEx**            | Complex setup, powerful   | Excellent (drop-in components) | Simple for OAuth          | Good (bundled)              |
| **Features (count)** | 30 supported features     | Modern, focused                | 15 supported features     | Moderate                    |

**Analysis for Competition Platform:**

- **Keycloak** is the most powerful for enterprise: SAML, OIDC brokering, full SSO. But it requires DevOps capacity for deployment and maintenance. Overkill for MVP.
- **Clerk** offers the best DX with drop-in React components, built-in multi-tenancy (organizations = tournament organizers), and SOC 2 compliance — important for money-involved competitions. The trade-off is vendor lock-in and cost at scale.
- **Auth.js** is lightweight and free with 80+ OAuth providers, but lacks MFA, SAML, and compliance certifications. Not ideal when money is involved.
- **Supabase Auth** is compelling if you adopt Supabase as your database platform — auth comes free and integrated.

**Verdict:** For a money-involved competition platform, **Clerk** provides the best balance of security (SOC 2, breach detection, MFA), DX (drop-in components), and features (multi-tenancy for organizations). For self-hosted control, **Keycloak** post-MVP. **Auth.js** is insufficient for the compliance requirements of a platform handling real money.

_Sources: [Clerk vs Auth0 vs Keycloak vs FusionAuth](https://www.justaftermidnight247.com/insights/clerk-vs-auth0-vs-keycloak-vs-fusionauth/), [Auth.js vs Keycloak](https://www.auth0alternatives.com/compare/auth-js/vs/keycloak), [Comparing Auth Providers](https://blog.hyperknot.com/p/comparing-auth-providers)_

#### Testing & Quality

- **Vitest** — fast unit testing for TypeScript (replaces Jest)
- **Playwright** — E2E testing for competition flows across browsers
- **k6** — load testing for WebSocket connections at scale
- **GitHub Actions** — CI/CD pipeline

### Cloud Infrastructure and Deployment

#### Deployment Platform: Kubernetes vs Fly.io vs Railway vs Cloudflare

| Criteria                  | Kubernetes (K8s)        | Fly.io                   | Railway         | Cloudflare Workers       |
| ------------------------- | ----------------------- | ------------------------ | --------------- | ------------------------ |
| **Global Regions**        | Any cloud (depends)     | 30+ regions              | Limited regions | 300+ edge locations      |
| **Auto-Scaling**          | KEDA, HPA (powerful)    | Metrics-based            | Usage-based     | Automatic (per-request)  |
| **WebSocket Support**     | Full (sticky sessions)  | Full (native)            | Yes             | Durable Objects          |
| **DevOps Overhead**       | Very high               | Low–medium               | Very low        | Low (different paradigm) |
| **Cost (small)**          | $50–200/mo minimum      | ~$5–20/mo                | ~$5–20/mo       | ~$5/mo (Workers paid)    |
| **Cost (scale)**          | Predictable at scale    | Usage-based              | Usage-based     | Very low per-request     |
| **Deploy-close-to-event** | Manual region selection | `fly deploy --region`    | Limited         | Automatic (nearest edge) |
| **Cold Start**            | None (always running)   | ~300ms (scale from zero) | Varies          | Sub-5ms                  |

**Analysis for "Deploy Close to Event" Requirement:**

This is a critical differentiator. You need to spin up infrastructure near the physical event location worldwide.

- **Kubernetes** gives maximum control but requires a dedicated DevOps team. You'd need to pre-provision clusters in each cloud region near events. High cost, high complexity.
- **Fly.io** is the sweet spot: `fly deploy --region sin` (Singapore), `fly deploy --region gru` (São Paulo), etc. 30+ regions, Fly Postgres included, WebSocket-native. Metrics-based autoscaler creates/destroys machines automatically. A shared 256MB instance costs ~$1.94/mo.
- **Railway** offers the best DX (zero-config from GitHub) and usage-based pricing, but has limited regions compared to Fly.io — weaker for the "worldwide close to event" requirement.
- **Cloudflare Workers + Durable Objects** run in 300+ locations automatically. Zero cold start, zero region management. Each competition becomes a Durable Object that runs at the nearest edge. The most cost-efficient option at ~$5/mo for moderate usage. But it requires a different programming model (no long-lived NestJS processes).

**Verdict for MVP:** **Fly.io** — best balance of global deployment, WebSocket support, cost efficiency, and low DevOps overhead. You can spin up competition servers in any region with a single command.

**Verdict for Scale:** **Cloudflare Workers + Durable Objects** for the real-time competition layer (each tournament = a Durable Object at the edge), with a traditional backend (Fly.io or Railway) for admin APIs, auth, and data management.

_Sources: [Fly.io Pricing](https://fly.io/pricing/), [What is Fly.io](https://kuberns.com/blogs/post/what-is-flyio/), [Railway vs Render vs Fly.io 2026](https://www.pkgpulse.com/blog/railway-vs-render-vs-fly-io-app-hosting-platforms-nodejs-2026), [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)_

### Technology Adoption Trends

_Migration Patterns (2025–2026):_

- Shift from monolithic K8s to edge-first architectures (Cloudflare Workers, Fly.io)
- Serverless databases replacing always-on instances (Neon, PlanetScale Postgres)
- Managed auth (Clerk, Auth0) replacing self-hosted Keycloak for startups
- Hono surging as the edge-native TypeScript framework
- Socket.IO holding steady but Cloudflare Durable Objects emerging as the edge-native alternative

_Emerging Technologies:_

- **Cloudflare Durable Objects** — stateful serverless at the edge (most relevant for this project)
- **PlanetScale Postgres** (GA 2025) — sharded PostgreSQL as a service
- **Partial Prerendering (Next.js 16)** — hybrid static/dynamic rendering
- **Svelte 5 Runes** — new reactivity model gaining enterprise traction

_Community Trends:_

- TypeScript remains the clear winner for full-stack real-time applications
- Developer platforms (Fly.io, Railway) are displacing raw K8s for small-to-mid teams
- "Edge-first" is the dominant deployment trend for latency-sensitive applications

_Sources: [Real-Time Web Apps in 2025](https://www.debutinfotech.com/blog/real-time-web-apps), [WebSocket Scale in 2025](https://www.videosdk.live/developer-hub/websocket/websocket-scale), [Choosing Tech Stack 2025](https://dev.to/dimeloper/choosing-tech-stack-in-2025-a-practical-guide-4gll)_

---

## Integration Patterns Analysis

### Communication Protocols

#### Real-Time Protocol Selection: WebSocket vs WebTransport vs SSE

| Criteria            | WebSocket                    | WebTransport                                  | SSE (Server-Sent Events)         |
| ------------------- | ---------------------------- | --------------------------------------------- | -------------------------------- |
| **Direction**       | Full-duplex (bidirectional)  | Full-duplex + datagrams                       | Server → Client only             |
| **Protocol**        | TCP (HTTP/1.1 upgrade)       | QUIC (HTTP/3)                                 | HTTP/1.1 or HTTP/2               |
| **Latency**         | Low (~1–5ms)                 | Ultra-low (35% less than WS)                  | Low for server push              |
| **Reliability**     | Ordered, guaranteed delivery | Configurable (reliable or unreliable streams) | Ordered, guaranteed              |
| **Multiplexing**    | Single stream per connection | Multiple streams + datagrams                  | Single stream                    |
| **Browser Support** | Universal (all browsers)     | Chrome, Edge (limited in 2026)                | Universal                        |
| **Reconnection**    | Manual (Socket.IO automates) | Built-in                                      | Built-in (auto-retry)            |
| **Use Case**        | Chat, gaming, live scoring   | Ultra-low-latency gaming, media               | Dashboards, notifications, feeds |

**Analysis for Competition Platform:**

- **WebSocket (via Socket.IO)** is the correct primary protocol. It provides full-duplex communication essential for player actions → server processing → state broadcast. Socket.IO adds rooms (per competition), namespaces (per phase), auto-reconnection, and fallback to long-polling. A gaming platform reported **30% latency reduction and 50% connection stability improvement** over HTTP polling.
- **WebTransport** achieved a **35% latency cut** in real-world testing, but browser support is still limited in early 2026 — no production-ready support for WebSocket over HTTP/3 yet. Worth monitoring for post-MVP.
- **SSE** is ideal for the **admin/judge dashboards** — they primarily receive updates (scoreboard changes, player status) without sending frequent data. SSE is simpler, works over standard HTTP, auto-reconnects, and avoids WebSocket overhead for read-only views.

**Verdict:** **WebSocket (Socket.IO) for player competition flows** + **SSE for admin/judge dashboard feeds**. Evaluate WebTransport post-MVP as browser support matures.

_Sources: [WebSockets vs SSE vs WebTransport 2025](https://www.aptuz.com/blog/websockets-vs-sse-vs-webtransports/), [Beyond WebSockets: WebTransport](https://www.vroble.com/2025/11/beyond-websockets-mastering.html), [SSE Beat WebSockets for 95% of Apps](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l), [Socket.IO Complete Guide 2026](https://dev.to/abanoubkerols/socketio-the-complete-guide-to-building-real-time-web-applications-2026-edition-c7h)_

### Message Broker / Pub-Sub Backplane

#### Socket.IO Redis Adapter vs NATS vs Kafka

| Criteria        | Redis Adapter (Socket.IO)  | NATS                                     | Kafka                          |
| --------------- | -------------------------- | ---------------------------------------- | ------------------------------ |
| **Throughput**  | Moderate (pub/sub limited) | 11–12M msgs/sec per node                 | Millions msgs/sec (batched)    |
| **Latency**     | 1–5ms                      | Sub-millisecond                          | 5–50ms (batched writes)        |
| **Memory**      | 8–32GB under load          | 10–50MB base, 100–500MB under load       | Disk-based (low memory)        |
| **Persistence** | Optional                   | JetStream (~1M msgs/sec with durability) | Native (log-based)             |
| **Use Case**    | Socket.IO multi-node sync  | Lightweight real-time messaging          | Event streaming, audit logs    |
| **Complexity**  | Low (drop-in adapter)      | Low–medium                               | High (Zookeeper/KRaft)         |
| **Cost**        | Upstash $10–50/mo          | Self-hosted or Synadia Cloud             | Self-hosted or Confluent ($$$) |

**Analysis:**

- **Redis Adapter** is the default for Socket.IO multi-node: every event goes through Redis Pub/Sub for cross-server routing. Simple to set up, but Redis pub/sub historically didn't scale horizontally (improved in Redis 7.0+).
- **NATS** is the emerging favorite for WebSocket backplanes: 10–50MB memory (vs 8–32GB for Redis), sub-millisecond latency, and 11–12M msgs/sec. NATS JetStream adds persistence when needed. "NATS is more preferred for websockets; it's super light and simple to operate."
- **Kafka** is overkill for real-time WebSocket coordination but ideal for the **audit trail** — append-only log for all scoring events, perfect for event sourcing.

**Verdict for MVP:** **Redis Adapter** — drop-in with Socket.IO, zero additional infrastructure. Switch to **NATS** at scale when Redis memory costs become a concern. Use **Kafka (or PostgreSQL append-only tables)** for the scoring audit trail if full event sourcing is adopted.

_Sources: [Scaling Socket.IO](https://ably.com/topic/scaling-socketio), [NATS vs Redis vs Kafka 2026](https://www.index.dev/skill-vs-skill/nats-vs-redis-vs-kafka), [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/), [Scaling WebSockets with Redis Pub/Sub](https://dev.to/myougatheaxo/scaling-websockets-with-claude-code-redis-pubsub-and-socketio-adapter-2026-03-11-5666)_

### API Design Patterns

#### REST + WebSocket Hybrid Architecture

For the competition platform, a pure REST or pure WebSocket approach is insufficient. The recommended pattern:

| Concern                                                     | Protocol              | Pattern                                 |
| ----------------------------------------------------------- | --------------------- | --------------------------------------- |
| **CRUD operations** (tournaments, users, settings)          | REST (HTTP)           | Standard RESTful API with JSON          |
| **Real-time competition state** (scores, phase transitions) | WebSocket (Socket.IO) | Event-driven rooms + namespaces         |
| **Dashboard feeds** (admin/judge views)                     | SSE or WebSocket      | Server-push with subscription model     |
| **File uploads** (player avatars, documents)                | REST (HTTP)           | Multipart upload with presigned URLs    |
| **Webhooks** (third-party integrations)                     | HTTP callbacks        | Event notifications to external systems |

**API Gateway with NestJS:**

NestJS natively supports building an API Gateway that handles routing, authentication, rate-limiting, and cross-cutting concerns. Best practices from 2025–2026:

- Centralized authentication at the gateway before forwarding to microservices
- Circuit breaker pattern — if a downstream service fails, trip the circuit and stop sending requests, giving the service time to recover
- Strict service boundaries with async events for cross-domain changes
- Reliability as first-class: outbox pattern, retries, idempotency keys, distributed tracing

_Sources: [NestJS WebSocket Gateways](https://docs.nestjs.com/websockets/gateways), [API Gateway with NestJS](https://dev.to/thisdotmedia/build-an-api-gateway-with-nestjs-in-10-minutes-16db), [NestJS Microservices Blueprint](https://medium.com/@Modexa/nestjs-microservices-blueprint-that-actually-scales-9ab714f31e72)_

### Event-Driven Architecture & Audit Trail

#### Event Sourcing + CQRS for Scoring Integrity

For a platform where **money is involved**, every scoring decision must be auditable and reconstructable. Event Sourcing + CQRS is the gold standard:

**Event Sourcing** records every state change as an immutable event:

```
ScoreSubmitted { judgeId, competitorId, roundId, score, timestamp }
ScoreValidated { validatorId, eventRef, status, timestamp }
PhaseTransitioned { tournamentId, fromPhase, toPhase, trigger, timestamp }
DisputeRaised { competitorId, roundId, reason, timestamp }
DisputeResolved { adminId, disputeId, resolution, adjustedScore, timestamp }
```

**Benefits for Competition Platform:**

- **Complete audit trail** — every scoring decision is preserved with who, what, when, and why
- **Time-travel queries** — reconstruct any tournament state at any point in time (critical for disputes)
- **Replay capability** — reprocess events if scoring logic changes or errors are discovered
- **CQRS separation** — write model (commands: submit score, transition phase) optimized for consistency; read model (queries: leaderboard, standings) optimized for fast lookups

**Implementation Approach:**

- PostgreSQL as the event store (append-only table with immutable events)
- Materialized views or Redis for read-optimized leaderboard projections
- No need for Kafka at MVP — PostgreSQL LISTEN/NOTIFY + application-level event bus is sufficient

_Sources: [Event Sourcing Pattern (Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing), [Event Sourcing and CQRS](https://mia-platform.eu/blog/understanding-event-sourcing-and-cqrs-pattern/), [Event Sourcing FinTech Example](https://news.ycombinator.com/item?id=45628315)_

### WebSocket Reconnection & Offline Tolerance

This is a **critical edge case** for a competition platform — a player disconnecting mid-round with money on the line.

**Reconnection Strategy:**

1. **Detection** — Application-level heartbeats (not TCP keepalive). 3 missed heartbeats = connection considered dead. Socket.IO handles this natively with `pingInterval` and `pingTimeout`.

2. **Reconnection** — Exponential backoff with jitter to prevent reconnection storms (all players reconnecting simultaneously after a network blip). Socket.IO provides automatic reconnection with configurable backoff.

3. **State Recovery** — On reconnect, client sends `last_seen_sequence_number`. Server replays missed events from the event store. This is where Event Sourcing pays off — the server can precisely replay what was missed.

4. **Reconnection Storm Prevention** — For tournaments with hundreds of simultaneous connections, implement draining based on time + capped limits for controlled reconnection rather than all connections hitting at once.

5. **Idempotency** — Every message gets an idempotency key. On reconnect, the retry queue resends unacknowledged messages, and the server deduplicates using these keys. Critical for scoring — a judge's score must not be counted twice.

6. **Grace Period** — Define a tournament-configurable grace period (e.g., 30 seconds) during which a disconnected player's state is preserved. If they reconnect within the window, they resume seamlessly. If not, the tournament rules dictate the outcome (forfeit, pause, or admin decision).

_Sources: [WebSocket Reconnection Guide](https://websocket.org/guides/reconnection/), [WebSocket Reconnection Logic](https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection-logic/view), [WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices)_

### Integration Security Patterns

#### WebSocket Authentication Flow

**The Challenge:** Unlike HTTP, WebSocket doesn't have per-request headers after the initial handshake. Authentication must be handled carefully.

**Recommended Pattern for Competition Platform:**

1. **Initial Auth:** Client authenticates via REST (OAuth/Clerk) → receives JWT
2. **WS Handshake:** JWT sent during WebSocket connection upgrade (in auth header or query param)
3. **Server Validation:** NestJS guard validates JWT on connection, attaches user context (role: admin/player/judge)
4. **Token Refresh:** For long-running competition sessions, implement token refresh over the existing WebSocket connection or via a parallel REST call
5. **Role-Based Events:** Socket.IO rooms enforce role-based access — players only receive their competition room events, judges see scoring events, admins see everything

**Security Best Practices (2025–2026):**

- Always use `wss://` (WebSocket over TLS) — never plain `ws://`
- Token-based auth (JWT) over credential-based — avoid sending passwords over WebSocket
- Sender-constrained tokens (token binding) to prevent theft/replay — emerging best practice in 2026
- Short-lived JWTs (15 min) with refresh tokens for long competition sessions
- Rate limiting on WebSocket messages to prevent abuse

_Sources: [WebSocket Authentication 2025](https://www.videosdk.live/developer-hub/websocket/websocket-authentication), [JWT Security Best Practices](https://curity.io/resources/learn/jwt-best-practices/), [Modern Authentication 2025](https://www.aesthetesoft.dev/blog/modern-authentication-oauth-security)_

### Data Formats and Serialization

| Format               | Size                   | Speed                | Use Case                                 |
| -------------------- | ---------------------- | -------------------- | ---------------------------------------- |
| **JSON**             | Larger                 | Fast (native JS)     | REST APIs, WebSocket messages (default)  |
| **MessagePack**      | ~30% smaller than JSON | Faster encode/decode | High-frequency WebSocket events at scale |
| **Protocol Buffers** | Smallest               | Fastest              | gRPC service-to-service (post-MVP)       |

**Verdict:** **JSON for MVP** — universal, debuggable, native to JavaScript. Consider **MessagePack** for high-frequency scoring events if bandwidth becomes a constraint at scale. Protocol Buffers only if service-to-service gRPC is introduced.

---

## Architectural Patterns and Design

### System Architecture Pattern: Modular Monolith → Microservices

**The 2025–2026 Industry Consensus:**

The industry is swinging back toward modular monoliths. A 2025 CNCF survey found **42% of organizations that adopted microservices have consolidated at least some services back** into larger deployable units. Amazon Prime Video famously moved components back to a monolith. The key insight: microservices benefits only appear with teams larger than 10 developers.

**Recommended Architecture for Competition Platform:**

**Phase 1 (MVP): Modular Monolith on NestJS**

```
┌─────────────────────────────────────────────────┐
│                  NestJS Application              │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │   Auth   │  │Tournament│  │  Competition   │  │
│  │  Module  │  │  Module  │  │  Engine Module │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Scoring │  │  User    │  │   WebSocket    │  │
│  │  Module  │  │  Module  │  │  Gateway Module│  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  Shared: EventBus, Guards, Interceptors, Pipes   │
└─────────────────────────────────────────────────┘
         │              │              │
    PostgreSQL        Redis       Clerk Auth
```

Each NestJS module has:

- **Strict boundaries** — modules communicate through defined interfaces (services), not direct database access
- **Separate database schemas** — within the same PostgreSQL instance but schema-isolated
- **Own domain events** — published to the internal event bus

This gives you the architectural rigor of microservices (clean boundaries, domain isolation) without the operational overhead (network calls, service discovery, distributed tracing).

**Phase 2 (Scale): Extract Hot Paths**

When load demands it, extract only the modules that need independent scaling:

- **Competition Engine** → separate service (handles real-time WebSocket load)
- **Scoring Service** → separate service (handles event sourcing writes independently)
- Everything else stays in the monolith

_Sources: [Microservices vs Monoliths 2026](https://www.javacodegeeks.com/2025/12/microservices-vs-monoliths-in-2026-when-each-architecture-wins.html), [Why Teams Are Moving Back to Modular Monoliths](https://codingplainenglish.medium.com/why-teams-are-moving-back-from-microservices-to-modular-monoliths-in-2026-76a3eb7162b8), [Modular Monolith in Cloud Environments](https://www.mdpi.com/1999-5903/17/11/496)_

### Tournament State Machine Design

The competition lifecycle is a **finite state machine (FSM)** — the most critical architectural component of this platform.

**Tournament State Machine:**

```
                    ┌─────────┐
                    │  DRAFT  │ (Admin creates tournament)
                    └────┬────┘
                         │ publish
                    ┌────▼────┐
                    │  OPEN   │ (Registration open)
                    └────┬────┘
                         │ close_registration / start
                    ┌────▼────┐
                    │ ACTIVE  │ (Competition running)
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
       ┌────▼────┐  ┌───▼────┐  ┌───▼─────┐
       │ PAUSED  │  │ ROUND  │  │DISPUTED │
       │(admin)  │  │COMPLETE│  │(review) │
       └────┬────┘  └───┬────┘  └───┬─────┘
            │            │            │
            └────────────┼────────────┘
                         │ all_rounds_complete
                    ┌────▼────┐
                    │FINALIZE │ (Calculating final results)
                    └────┬────┘
                         │ confirm_results
                    ┌────▼─────┐
                    │COMPLETED │ (Immutable final state)
                    └──────────┘
```

**Design Principles:**

- **Server-authoritative** — all state transitions happen on the server. The client requests transitions, the server validates and executes.
- **Event-sourced transitions** — every state change is an immutable event (`PhaseTransitioned { from, to, trigger, timestamp, adminId }`). This means you can reconstruct the exact tournament timeline for any dispute.
- **Guard conditions** — NestJS guards validate that a transition is legal before executing (e.g., can't start a round if not all judges are connected, can't finalize if disputes are pending).
- **Rollback capability** — because state is event-sourced, you can "undo" a transition by appending a compensating event rather than mutating state.

**Implementation:** Use a library like `xstate` (TypeScript state machine library) for formal FSM definition with typed states, events, and transitions. This gives compile-time guarantees that invalid transitions are impossible.

_Sources: [State Design Pattern (Game Programming Patterns)](https://gameprogrammingpatterns.com/state.html), [State Pattern (Refactoring Guru)](https://refactoring.guru/design-patterns/state), [Super State Design Pattern](https://medium.com/nerd-for-tech/the-super-state-design-pattern-166127ce7c9a)_

### Multi-Tenancy & Data Isolation

The competition platform is inherently multi-tenant: **organizations** create and manage their own tournaments, with competitors who can participate across multiple organizations.

**Architecture: Shared Schema + PostgreSQL Row-Level Security (RLS)**

| Approach                | Isolation            | Cost    | Complexity      | Recommended         |
| ----------------------- | -------------------- | ------- | --------------- | ------------------- |
| **Database-per-tenant** | Strongest            | Highest | High (many DBs) | No (overkill)       |
| **Schema-per-tenant**   | Strong               | Medium  | Medium          | No (migration pain) |
| **Shared schema + RLS** | Strong (DB-enforced) | Lowest  | Low–medium      | **Yes**             |

**Why RLS for this platform:**

- PostgreSQL RLS enforces data isolation at the database level — even a buggy application query can't leak data across organizations
- Minimal overhead: **1–5% performance impact** compared to application-level filtering, because PostgreSQL's planner optimizes RLS predicates like WHERE clauses
- Competitors can belong to multiple organizations (many-to-many) — RLS policies handle this naturally with `current_setting('session.current_organization_id')`
- Organizations see only "minimum basic information" about competitors (as per your requirement) — RLS + column-level permissions enforce this

**Data Model Sketch:**

```
organizations (org_id, name, ...)
tournaments (tournament_id, org_id, type, status, ...)  ← RLS on org_id
competitors (competitor_id, user_id, ...)                ← cross-org, not RLS'd
tournament_entries (tournament_id, competitor_id, ...)    ← RLS on org_id via tournament
scores (score_id, tournament_id, judge_id, ...)          ← RLS on org_id via tournament
```

**Privacy Control:** Organizations see competitor `display_name` and `tournament_stats` only — personal details (email, phone) are never exposed to org admins. This is enforced at the database view level, not just the API.

_Sources: [Multi-Tenant Data Isolation with PostgreSQL RLS (AWS)](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/), [Shipping Multi-Tenant SaaS with Postgres RLS](https://www.thenile.dev/blog/multi-tenant-rls), [RLS for Tenants (Crunchy Data)](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)_

### Scalability and Performance Patterns

#### Horizontal WebSocket Scaling Strategy

WebSocket connections are stateful — unlike REST, a connection is bound to a specific server instance. This requires careful architectural planning.

**Recommended Pattern: Shared State + Pub/Sub Backplane (Not Sticky Sessions)**

Sticky sessions become a liability at scale: when a server fails, every client pinned to it loses their session. The better approach is **shared state** — store connection and session state externally (Redis) so any server can handle any reconnecting client.

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client A │     │ Client B │     │ Client C │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
┌────▼─────┐     ┌────▼─────┐     ┌────▼─────┐
│ WS Server│     │ WS Server│     │ WS Server│
│   Node 1 │◄───►│   Node 2 │◄───►│   Node 3 │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     └────────────────┼────────────────┘
                      │
              ┌───────▼───────┐
              │ Redis Pub/Sub │  (or NATS at scale)
              │   Backplane   │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │  PostgreSQL   │
              │  (Event Store)│
              └───────────────┘
```

**Fly.io-Specific Scaling:**

On Fly.io, use the `fly-replay` header to route WebSocket connections to the correct region/machine. Deploy machines in the region closest to the physical event:

- `fly scale count 3 --region gru` — 3 machines in São Paulo for a Brazilian tournament
- `fly scale count 0 --region gru` — scale down after event ends (pay nothing)
- Fly's internal DNS routes connections to the nearest healthy machine

**Auto-Scaling Triggers:**

- WebSocket connection count per machine (primary metric)
- CPU/memory usage (secondary)
- Custom metrics via Fly's metrics-based autoscaler (e.g., active tournament count)

_Sources: [How to Scale WebSocket](https://tsh.io/blog/how-to-scale-websocket), [WebSockets at Scale](https://websocket.org/guides/websockets-at-scale/), [Challenges of Scaling WebSockets](https://dev.to/ably/challenges-of-scaling-websockets-3493), [Fly.io Sticky Sessions](https://community.fly.io/t/session-affinity-sticky-sessions/638)_

### Security Architecture Patterns

#### Server Authority Model (Anti-Cheat)

For a competition platform with money involved, the server must be the **single source of truth** for all game state.

**Principles:**

1. **Server-authoritative scoring** — the client submits actions, the server validates and computes results. No client-side score calculation.
2. **Input validation** — every player action is validated against the current game state. Invalid actions (e.g., submitting a score outside the allowed range, acting out of turn) are rejected.
3. **Timing control** — the server controls all timers. Round start/end times are server timestamps, not client-reported. This prevents timing attacks where a client manipulates local clock to gain advantage.
4. **Rate limiting** — cap the number of actions per second per client. Prevents abuse and automated submissions.
5. **Audit logging** — every action (valid or rejected) is logged with timestamp, user ID, IP, and action payload. Rejected actions are flagged for review.

**Detection Algorithms:**

Modern anti-cheat operates within millisecond timeframes. For this platform:

- **Statistical anomaly detection** — flag scores that deviate significantly from a competitor's historical pattern
- **Timing analysis** — flag suspiciously fast submissions
- **Cross-validation** — if multiple judges score the same competitor, flag significant score divergence for admin review

_Sources: [Securing Game Code 2025](https://medium.com/@lzysoul/securing-game-code-in-2025-modern-anti-cheat-techniques-and-best-practices-e2e0f6f14173), [Real-Time Cheat Detection](https://medium.com/@amol346bhalerao/how-game-developers-detect-and-stop-cheating-in-real-time-0aa4f1f52e0c)_

### Data Architecture & Compliance

#### GDPR and Data Residency Strategy

For a worldwide competition platform, data residency is a strategic architecture decision — not an afterthought.

**Regulatory Landscape (2025–2026):**

- **EU (GDPR)** — personal data of EU residents must be processed with legal basis; transfers outside EU require adequacy decisions or SCCs. Violations: up to **4% of global revenue or €20M**. Cumulative fines reached €5.88B since 2018.
- **India (DPDPA)** — expanding local storage requirements
- **Indonesia** — mandatory local data centers for specific data categories
- **Saudi Arabia (PDPL)** — data residency provisions since Sept 2024

**Architecture for Compliance:**

For MVP, this is simpler than it sounds:

1. **Deploy Fly.io machines in the event's region** — tournament data stays in-region by default
2. **PostgreSQL in-region** — Fly Postgres deploys in the same region as your app
3. **Minimal PII collection** — competitors provide display name + auth token. Clerk handles PII (email, phone) in their SOC 2-compliant infrastructure.
4. **Data classification** — separate PII (auth provider handles) from competition data (your DB handles). Competition data (scores, rankings) is generally not PII.

For post-MVP international expansion, consider region-aware data routing where user PII is stored in their home region and competition data is replicated to the event region.

_Sources: [Data Residency for SaaS](https://www.alation.com/blog/data-residency-by-design-global-compliance/), [GDPR Compliance Guide 2026](https://secureprivacy.ai/blog/gdpr-compliance-2026), [Tracking Global Data Protection Laws 2026](https://www.forcepoint.com/blog/insights/tracking-global-data-protection-laws-2026)_

### Deployment and Operations Architecture

#### Recommended Deployment Topology

```
┌─────────────────────────────────────────────────────────┐
│                     Cloudflare CDN                       │
│              (Static assets, DDoS protection)            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    Fly.io Edge                            │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  App Machine  │  │  App Machine  │  │  App Machine  │  │
│  │  (Region: GRU)│  │  (Region: CDG)│  │  (Region: NRT)│  │
│  │  NestJS + WS  │  │  NestJS + WS  │  │  NestJS + WS  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │           │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐   │
│  │ Fly Postgres │  │ Fly Postgres │  │ Fly Postgres │   │
│  │  (Primary)   │  │  (Replica)   │  │  (Replica)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              Upstash Redis (Global)               │    │
│  │         (Pub/Sub backplane + session cache)       │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   Clerk Auth    │
              │   (Managed)     │
              └─────────────────┘
```

**Key Decisions:**

- **Per-event deployment** — spin up machines in the region closest to the physical event. Scale down to zero after the event. Pay only for active events.
- **Primary + read replicas** — PostgreSQL primary in one region, read replicas in event regions for low-latency reads. Write to primary (async replication acceptable for leaderboard reads).
- **Upstash Redis Global** — serverless Redis with global replication for the Socket.IO backplane. Pay per request, no always-on cost.
- **Cloudflare CDN** — free tier handles static Next.js assets and provides DDoS protection.

---

## Implementation Approaches and Technology Adoption

### Project Structure & Module Organization

**NestJS Modular Monolith with DDD Bounded Contexts:**

The project should map NestJS modules to domain bounded contexts — not to entities or features. Each module encapsulates its domain logic, application services, and infrastructure concerns.

```
src/
├── modules/
│   ├── auth/                    # Authentication bounded context
│   │   ├── domain/              # Entities, value objects
│   │   ├── application/         # Commands, queries, handlers
│   │   ├── infrastructure/      # Clerk integration, JWT
│   │   └── auth.module.ts
│   │
│   ├── tournament/              # Tournament management bounded context
│   │   ├── domain/
│   │   │   ├── entities/        # Tournament, Round, Bracket
│   │   │   ├── value-objects/   # TournamentStatus, CompetitionType
│   │   │   └── events/          # TournamentCreated, PhaseTransitioned
│   │   ├── application/
│   │   │   ├── commands/        # CreateTournament, StartRound
│   │   │   ├── queries/         # GetTournament, GetStandings
│   │   │   └── sagas/           # Tournament lifecycle orchestration
│   │   ├── infrastructure/
│   │   │   ├── persistence/     # TypeORM/Prisma repositories
│   │   │   └── state-machine/   # XState tournament FSM
│   │   └── tournament.module.ts
│   │
│   ├── competition/             # Real-time competition engine
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── competition.module.ts
│   │
│   ├── scoring/                 # Scoring & audit bounded context
│   │   ├── domain/
│   │   │   ├── entities/        # Score, ScoreEvent
│   │   │   └── events/          # ScoreSubmitted, ScoreValidated
│   │   ├── application/
│   │   │   ├── commands/        # SubmitScore, ValidateScore
│   │   │   └── queries/         # GetLeaderboard, GetScoreHistory
│   │   ├── infrastructure/
│   │   │   └── event-store/     # PostgreSQL append-only event store
│   │   └── scoring.module.ts
│   │
│   ├── user/                    # User profiles & competitor management
│   │   └── user.module.ts
│   │
│   └── websocket/               # WebSocket gateway (cross-cutting)
│       ├── gateways/            # Socket.IO gateways per namespace
│       ├── guards/              # WS auth guard, role guard
│       ├── interceptors/        # Rate limiting, logging
│       └── websocket.module.ts
│
├── shared/                      # Shared kernel (minimal)
│   ├── event-bus/               # Internal async event bus
│   ├── guards/                  # Common guards
│   └── types/                   # Shared TypeScript types
│
└── main.ts
```

**Key Principles:**

- Modules communicate through defined interfaces (service facades) — never direct database access across modules
- Each module owns its database schema (tables prefixed by module name or separate schemas)
- Internal event bus for cross-module communication (e.g., `ScoreSubmitted` event triggers leaderboard update in tournament module)
- The websocket module is a thin gateway layer that delegates to domain modules

**XState Integration for Tournament FSM:**

XState provides first-class TypeScript support and integrates well with NestJS. Each tournament instance gets its own XState actor, with states and transitions defined formally:

- Compile-time guarantees that invalid transitions are impossible
- Side effects managed through XState services (e.g., notify players on phase transition)
- State persistence to PostgreSQL — tournament FSM can be rehydrated after server restart
- Visual debugging — XState provides a visual editor/inspector for state machine design

_Sources: [NestJS Modular Monolith CQRS Template](https://github.com/deadislove/nestJS-modular-monolith-cqrs-event-sourcing-architecture-template), [Modular Monolith NestJS (DDD)](https://github.com/jsantanders/modular-monolith-nestjs), [NestJS Clean Architecture](https://medium.com/@sebastian.iwanczyszyn/building-maintainable-nestjs-apps-with-clean-architecture-056248f04cef), [XState with NestJS](https://www.restack.io/p/state-machines-knowledge-xstate-nestjs-cat-ai), [XState Docs](https://stately.ai/docs/xstate)_

### Development Workflows and Tooling

#### CI/CD Pipeline: GitHub Actions → Fly.io

```yaml
# Simplified pipeline flow
on push to main: 1. Lint (ESLint + Prettier)
  2. Type check (tsc --noEmit)
  3. Unit tests (Vitest)
  4. Build Docker image (multi-stage)
  5. Integration tests (against test DB)
  6. Deploy to Fly.io (flyctl deploy)
  7. Smoke test (health check + WS connection test)
```

**Fly.io CI/CD specifics:**

- Dockerfile + `fly.toml` committed to repo root
- Multi-stage Docker builds reduce image size (dev deps excluded from production)
- `fly secrets set KEY=VALUE` for sensitive environment variables (never in Docker image)
- GitHub Actions integration is documented and straightforward — deploy in ~5 minutes setup

**Development Tooling Ecosystem:**

| Tool                    | Purpose         | Why                                                      |
| ----------------------- | --------------- | -------------------------------------------------------- |
| **pnpm**                | Package manager | Faster installs, strict dependency resolution            |
| **Turborepo**           | Monorepo build  | If frontend (Next.js) and backend (NestJS) share a repo  |
| **ESLint + Prettier**   | Code quality    | Consistent style, catch errors early                     |
| **Husky + lint-staged** | Git hooks       | Pre-commit linting and formatting                        |
| **Prisma** (or TypeORM) | ORM             | Type-safe database access, migrations, schema management |
| **Docker Compose**      | Local dev       | PostgreSQL + Redis + app in one command                  |

_Sources: [Fly.io Continuous Deployment with GitHub Actions](https://fly.io/docs/launch/continuous-deployment-with-github-actions/), [NestJS Deployment Guide for Fly.io](https://app-generator.dev/docs/deployment/fly-io/deploy-nestjs.html), [CI/CD with Fly.io in 5 minutes](https://medium.com/@stefannovak96/ci-cd-with-fly-io-and-github-actions-in-5-minutes-2da8c58e444f)_

### Testing and Quality Assurance

#### Testing Pyramid for Competition Platform

```
                    ┌─────────┐
                    │  E2E    │  Playwright (critical flows)
                    │  Tests  │  - Tournament creation → competition → results
                    ├─────────┤
                    │  Load   │  k6 (WebSocket stress)
                    │  Tests  │  - 1000 concurrent WS connections
                    ├─────────┤
                    │  Integ  │  Vitest + Testcontainers
                    │  Tests  │  - DB, Redis, Socket.IO interactions
                    ├─────────┤
                    │  Unit   │  Vitest
                    │  Tests  │  - State machine transitions, scoring logic
                    └─────────┘
```

**Layer Details:**

1. **Unit Tests (Vitest):** Game theory scoring calculations, tournament state machine transitions (XState), input validation, authorization logic. These are the fastest and most numerous tests.

2. **Integration Tests (Vitest + real DB):** Socket.IO event flow (server emits → client receives), database queries with RLS policies, event sourcing write → read projection, API endpoint auth + response validation.

3. **Load Tests (k6):** Simulate 100–1000 concurrent WebSocket connections, measure message delivery latency under load, test reconnection storm behavior, validate auto-scaling triggers. k6 has native WebSocket support and integrates directly with Grafana for visualization.

4. **E2E Tests (Playwright):** Full tournament lifecycle: create → register → compete → score → results. Multi-browser for admin/judge/player views simultaneously. Playwright supports WebSocket interception via `page.routeWebSocket()`.

**Critical Test Scenarios:**

- Judge submits score → leaderboard updates in <100ms for all connected clients
- Player disconnects mid-round → reconnects → state is recovered
- Two judges submit conflicting scores → dispute flow triggers
- Tournament state machine: every valid transition works, every invalid transition is rejected

_Sources: [Socket.IO Testing](https://socket.io/docs/v4/testing/), [Socket.IO Load Testing](https://socket.io/docs/v4/load-testing/), [k6 WebSocket Testing](https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/), [NestJS Load Testing with k6](https://mikeyland.netlify.app/post/how-to-master-load-testing-in-nestjs-with-k6)_

### Monitoring and Observability

#### Observability Stack

| Layer        | Tool                                    | Metrics                                                                             |
| ------------ | --------------------------------------- | ----------------------------------------------------------------------------------- |
| **Metrics**  | Prometheus + Grafana                    | WS connection count, message throughput, latency histograms, event store write rate |
| **Logging**  | Structured JSON logs → Fly.io log drain | Request/response logs, error traces, audit events                                   |
| **Tracing**  | OpenTelemetry                           | Request flow across modules, WebSocket event lifecycle                              |
| **Alerting** | Grafana Alerts                          | Connection count spikes, latency threshold breaches, error rate increases           |
| **Uptime**   | Fly.io health checks                    | HTTP + WebSocket health endpoints                                                   |

**Key WebSocket Metrics to Monitor:**

- Handshake latency (time from request to upgrade confirmation)
- Message throughput (messages/second per server)
- Round-trip latency (message sent → acknowledgment)
- Active connection count per machine/region
- Reconnection rate (indicator of network issues)
- Event store write latency (scoring pipeline health)

**Grafana Cloud** offers out-of-the-box application observability with native OpenTelemetry and Prometheus support — a managed alternative to self-hosted Prometheus.

_Sources: [Application Monitoring with Prometheus and Grafana](https://dev.to/_85e8844dcca5f98bfa936/application-monitoring-with-prometheus-and-grafana-a-developers-guide-1jeh), [WebSocket Application Monitoring](https://www.dotcom-monitor.com/blog/websocket-monitoring/), [Grafana Cloud Application Observability](https://grafana.com/products/cloud/application-observability/)_

### Cost Optimization and Resource Management

#### MVP Cost Estimate (Monthly)

| Service                                 | Tier                    | Estimated Cost |
| --------------------------------------- | ----------------------- | -------------- |
| **Fly.io** (2 machines, 1 CPU/1GB each) | Pay-as-you-go           | ~$20–40/mo     |
| **Fly Postgres** (1 primary, 1 replica) | Included with machines  | ~$10–20/mo     |
| **Upstash Redis** (serverless)          | Pay-per-request         | ~$5–10/mo      |
| **Clerk Auth**                          | Free tier (10k MAU)     | $0             |
| **Cloudflare CDN**                      | Free tier               | $0             |
| **GitHub Actions**                      | Free tier (2000 min/mo) | $0             |
| **Domain + DNS**                        | Cloudflare              | ~$10/yr        |
| **Grafana Cloud**                       | Free tier (10k metrics) | $0             |
| **Total MVP**                           |                         | **~$35–70/mo** |

**During Active Events (scale-up):**

| Service                                  | Tier                   | Estimated Cost   |
| ---------------------------------------- | ---------------------- | ---------------- |
| **Fly.io** (6 machines across 2 regions) | Scale-up               | ~$60–100/mo      |
| **Fly Postgres** (primary + 2 replicas)  | Scale-up               | ~$30–50/mo       |
| **Upstash Redis** (higher throughput)    | Usage spike            | ~$15–30/mo       |
| **Clerk Auth**                           | Pro tier (if >10k MAU) | $25/mo           |
| **Total Active Event**                   |                        | **~$130–205/mo** |

**Between Events (scale-down):**

- Scale machines to 0 in event regions → **$0 compute**
- Neon alternative: database scales to zero → **$0 DB** (vs Fly Postgres which charges for volume even when stopped)
- Upstash Redis: no requests = no cost → **$0**
- **Idle cost: ~$5–15/mo** (domain + primary DB volume + monitoring)

**Cost Comparison vs Original Stack (K8s):**

|                         | K8s (Original)                          | Fly.io (Recommended) | Savings         |
| ----------------------- | --------------------------------------- | -------------------- | --------------- |
| **MVP monthly**         | $200–500 (minimum viable K8s)           | $35–70               | **75–85%**      |
| **Event scale-up**      | $400–800                                | $130–205             | **65–75%**      |
| **Idle between events** | $100–200 (clusters always on)           | $5–15                | **90–95%**      |
| **DevOps overhead**     | Dedicated engineer or managed K8s ($$$) | Zero (Fly manages)   | **Significant** |

_Sources: [Fly.io Pricing](https://fly.io/pricing/), [Fly.io Pricing Calculator](https://fly.io/calculator), [Fly.io Pricing Breakdown 2025](https://www.withorb.com/blog/flyio-pricing), [Fly.io Hidden Costs 2026](https://costbench.com/software/developer-tools/flyio/)_

### Risk Assessment and Mitigation

| Risk                             | Severity | Likelihood | Mitigation                                                                                                                           |
| -------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Fly.io vendor lock-in**        | Medium   | Medium     | Docker-based deployment — portable to any container platform. No proprietary APIs used except `fly-replay` header (easy to replace). |
| **Clerk vendor lock-in**         | Medium   | Low        | Auth abstraction layer in code. Clerk → Keycloak migration path documented. JWT-based — any OIDC provider works.                     |
| **Socket.IO protocol lock-in**   | Low      | Low        | Socket.IO is open-source with massive community. WebSocket gateway abstraction in NestJS makes swapping possible.                    |
| **Neon/DB outage during event**  | High     | Low        | Fly Postgres as fallback. Connection pooling with PgBouncer. Read replicas for query continuity.                                     |
| **Redis backplane failure**      | High     | Low        | Fallback to single-node mode (one Fly machine handles all connections for that region). NATS as migration path.                      |
| **WebSocket reconnection storm** | Medium   | Medium     | Exponential backoff with jitter. Draining limits. Grace period for disconnected players.                                             |
| **Regulatory non-compliance**    | High     | Low        | Minimal PII in DB. Clerk handles PII (SOC 2). Deploy-in-region by default. Legal review before international launch.                 |
| **Scoring integrity compromise** | Critical | Low        | Event sourcing (immutable audit trail). Server-authoritative model. Cross-validation. Statistical anomaly detection.                 |

---

## Technical Research Recommendations

### Recommended Tech Stack (Final)

| Layer             | MVP Choice                        | Scale Path                         | Reasoning                                    |
| ----------------- | --------------------------------- | ---------------------------------- | -------------------------------------------- |
| **Language**      | TypeScript                        | TypeScript                         | Shared types, universal runtime support      |
| **Backend**       | NestJS (modular monolith)         | Extract hot paths to microservices | WebSocket gateway, guards, DI, modularity    |
| **Frontend**      | Next.js 16 + Tailwind + shadcn/ui | Same                               | PPR, React ecosystem, hiring pool            |
| **Real-time**     | Socket.IO on NestJS               | Durable Objects (edge)             | Rooms, namespaces, auto-reconnection         |
| **Database**      | Neon Serverless PostgreSQL        | Fly Postgres + replicas            | Scale-to-zero, cost-efficient, PG-compatible |
| **Cache/Pub-Sub** | Upstash Redis (serverless)        | NATS                               | Socket.IO adapter, pay-per-request           |
| **Auth**          | Clerk                             | Keycloak (self-hosted)             | SOC 2, MFA, multi-tenancy, DX                |
| **State Machine** | XState                            | XState                             | Typed FSM, NestJS integration, visual editor |
| **Deployment**    | Fly.io                            | Fly.io + Cloudflare Workers        | Global regions, scale-to-zero, low ops       |
| **CDN**           | Cloudflare (free)                 | Cloudflare Pro                     | Static assets, DDoS, edge caching            |
| **Monitoring**    | Grafana Cloud (free tier)         | Grafana Cloud + Prometheus         | Metrics, logs, alerts, WS dashboards         |
| **CI/CD**         | GitHub Actions                    | GitHub Actions                     | Free tier sufficient, Fly.io integration     |
| **Testing**       | Vitest + Playwright + k6          | Same                               | Unit + E2E + Load testing                    |
| **i18n**          | i18next                           | i18next                            | Runtime switching, 70+ languages             |
| **ORM**           | Prisma                            | Prisma                             | Type-safe, migrations, PG-native             |

### Implementation Roadmap

**Phase 1 — Foundation (Weeks 1–3):**

- NestJS project scaffold with modular structure
- Clerk auth integration + JWT WebSocket guard
- PostgreSQL schema with RLS policies
- Basic tournament CRUD (REST API)
- Docker Compose local dev environment

**Phase 2 — Real-Time Core (Weeks 4–6):**

- Socket.IO gateway with rooms and namespaces
- XState tournament state machine
- Event sourcing for scoring (append-only store)
- Real-time leaderboard projection
- Player/Judge WebSocket flows

**Phase 3 — Competition MVP (Weeks 7–9):**

- Tournament registration flow
- Competition type configuration
- Admin dashboard (Next.js)
- Player competition view (real-time)
- Basic judge scoring interface

**Phase 4 — Hardening (Weeks 10–12):**

- Reconnection handling + grace periods
- Load testing with k6 (target: 500 concurrent WS)
- Monitoring setup (Grafana + Prometheus)
- Multi-region Fly.io deployment
- E2E test suite (Playwright)

### Skill Development Requirements

| Skill                                        | Priority | Resources                                                                                                              |
| -------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| NestJS (WebSocket gateway, guards, modules)  | Critical | [NestJS Docs](https://docs.nestjs.com)                                                                                 |
| Socket.IO (rooms, namespaces, Redis adapter) | Critical | [Socket.IO Docs](https://socket.io/docs/v4/)                                                                           |
| XState (state machines, actors)              | High     | [XState Docs](https://stately.ai/docs/xstate)                                                                          |
| PostgreSQL RLS                               | High     | [AWS RLS Guide](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) |
| Event Sourcing / CQRS                        | High     | [Azure Event Sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)                   |
| Fly.io deployment                            | Medium   | [Fly.io Docs](https://fly.io/docs/)                                                                                    |
| Clerk auth integration                       | Medium   | [Clerk Docs](https://clerk.com/docs)                                                                                   |
| k6 load testing                              | Medium   | [k6 Docs](https://grafana.com/docs/k6/)                                                                                |

### Success Metrics and KPIs

| Metric                                   | Target                   | Measurement                                |
| ---------------------------------------- | ------------------------ | ------------------------------------------ |
| **WebSocket latency** (state update)     | <100ms p95               | Prometheus histogram                       |
| **Reconnection success rate**            | >99% within grace period | Application logs                           |
| **Scoring event throughput**             | 1000 events/sec per node | k6 load test                               |
| **Concurrent WebSocket connections**     | 500+ per machine         | Grafana dashboard                          |
| **Tournament state machine reliability** | Zero invalid transitions | Unit test coverage + production monitoring |
| **Infrastructure cost (idle)**           | <$15/mo                  | Fly.io billing                             |
| **Infrastructure cost (event)**          | <$200/mo                 | Fly.io billing                             |
| **Deployment time**                      | <5 minutes (CI/CD)       | GitHub Actions metrics                     |
| **MTTR (incident recovery)**             | <15 minutes              | Grafana alerts + runbooks                  |

---

## Research Synthesis and Future Outlook

### Summary of Key Technical Findings

This research analyzed 15+ technology alternatives across 6 stack layers and arrived at a recommended architecture that differs from the original proposal in two critical areas:

**Confirmed from Original Proposal:**

- TypeScript full-stack (no viable alternative for this use case)
- NestJS backend (WebSocket gateway + guards + DI is unmatched)
- Next.js frontend (PPR, React ecosystem, hiring pool)
- PostgreSQL primary database (battle-tested, RLS for multi-tenancy)
- Redis for pub/sub (Socket.IO adapter ecosystem)
- i18next for internationalization

**Changed from Original Proposal:**
| Layer | Original | Recommended | Why |
|---|---|---|---|
| **Deployment** | Docker + Kubernetes | Fly.io | 75–85% cost savings, 30+ regions, zero DevOps, deploy-per-event |
| **Auth** | Keycloak or Auth.js | Clerk (MVP) → Keycloak (scale) | SOC 2 compliance for money-involved platform, zero ops, multi-tenancy |
| **Database hosting** | Managed PostgreSQL | Neon Serverless (MVP) → Fly Postgres (scale) | Scale-to-zero between events, 30% cheaper than Supabase |
| **Redis hosting** | Self-managed Redis | Upstash (serverless) | Pay-per-request, global replication, no always-on cost |

**New Architectural Patterns Introduced:**

- Event Sourcing + CQRS for scoring integrity (not in original proposal)
- XState formal state machine for tournament lifecycle (not in original proposal)
- PostgreSQL RLS for multi-tenant data isolation (not in original proposal)
- SSE for admin/judge dashboards alongside WebSocket for players (not in original proposal)
- Modular monolith architecture (instead of implied microservices)

### Future Technical Outlook

**Near-term (6–12 months):**

- **Cloudflare Durable Objects** — as the platform scales, migrating the real-time competition layer to Durable Objects could reduce costs by 70% vs Redis and provide automatic edge distribution. Each tournament becomes a stateful actor at the nearest edge location. Worth evaluating after MVP when WebSocket connection patterns are understood.
- **WebTransport** — browser support is expanding. Once Chrome, Firefox, and Safari all support it, migrating latency-sensitive player flows from WebSocket to WebTransport could yield 35% latency reduction.

**Medium-term (1–2 years):**

- **NATS replacement for Redis** — as connection volume grows, NATS offers 10–50MB memory footprint vs 8–32GB for Redis at scale, with sub-millisecond latency and 11–12M msgs/sec throughput.
- **Keycloak migration** — if enterprise SSO (SAML) becomes a requirement or Clerk costs escalate, migrate to self-hosted Keycloak. The auth abstraction layer in the modular monolith makes this a module swap, not a rewrite.
- **CockroachDB evaluation** — if tournaments run simultaneously across continents with local write requirements, CockroachDB's native multi-region writes become compelling.

**Long-term (2+ years):**

- The esports/competition platform market is projected to reach **$4.5B in 2026, growing at 21% CAGR to $30.7B by 2036**. AI-driven features (automated referee systems, real-time performance analytics, AI coaching) are becoming standard. The event-sourced architecture positions this platform perfectly for ML/analytics — the complete event history is a rich training dataset.
- The modular monolith architecture allows extracting any module into an independent service when team size or load demands it — without a rewrite.

_Sources: [eSports Market Trends 2026–2036](https://www.futuremarketinsights.com/reports/esports-market), [Global Esports Market Report 2025](https://asoworld.com/blog/global-esports-market-report-2025/), [Esports Tournament Platform Development Market](https://www.researchandmarkets.com/reports/6153881/esports-tournament-platform-development-market)_

---

## Source Documentation

### Research Methodology

- **Research Phases:** 6 structured steps (scope → stack analysis → integration → architecture → implementation → synthesis)
- **Web Searches Conducted:** 30+ targeted queries against current (2025–2026) sources
- **Source Verification:** Multi-source validation for all critical claims; confidence levels applied to uncertain data
- **Analysis Period:** March 2026, focusing on technologies and pricing current as of Q1 2026
- **Comparison Framework:** Each technology evaluated on cost, scalability, DX, security, and alignment with project requirements

### Key Sources by Category

**Frameworks & Languages:**

- [Best TypeScript Backend Frameworks 2026 (Encore)](https://encore.dev/articles/best-typescript-backend-frameworks)
- [NestJS vs SonicJS vs Hono (SonicJS)](https://sonicjs.com/blog/nestjs-vs-sonicjs-vs-hono)
- [Hono Benchmarks](https://hono.dev/docs/concepts/benchmarks)
- [Next.js vs Remix vs SvelteKit 2026 (NxCode)](https://www.nxcode.io/resources/news/nextjs-vs-remix-vs-sveltekit-2025-comparison)

**Databases & Storage:**

- [Neon vs Supabase Comparison (Design Revision)](https://designrevision.com/blog/supabase-vs-neon)
- [Neon Major Price Reduction](https://neon.com/blog/major-compute-price-reduction-on-neon)
- [CockroachDB Multi-Region (OneUptime)](https://oneuptime.com/blog/post/2026-02-02-cockroachdb-multi-region/view)
- [Why I Ditched Redis for Durable Objects (DZone)](https://dzone.com/articles/why-ditch-redis-for-cloudflare-durable-objects)
- [Durable Objects Pricing (Cloudflare)](https://developers.cloudflare.com/durable-objects/platform/pricing/)

**Real-Time & Integration:**

- [WebSockets vs SSE vs WebTransport 2025 (Aptuz)](https://www.aptuz.com/blog/websockets-vs-sse-vs-webtransports/)
- [Socket.IO Complete Guide 2026 (DEV)](https://dev.to/abanoubkerols/socketio-the-complete-guide-to-building-real-time-web-applications-2026-edition-c7h)
- [NATS vs Redis vs Kafka 2026 (Index.dev)](https://www.index.dev/skill-vs-skill/nats-vs-redis-vs-kafka)
- [Scaling Socket.IO (Ably)](https://ably.com/topic/scaling-socketio)

**Architecture & Patterns:**

- [Microservices vs Monoliths 2026 (Java Code Geeks)](https://www.javacodegeeks.com/2025/12/microservices-vs-monoliths-in-2026-when-each-architecture-wins.html)
- [Why Teams Moving Back to Modular Monoliths (Medium)](https://codingplainenglish.medium.com/why-teams-are-moving-back-from-microservices-to-modular-monoliths-in-2026-76a3eb7162b8)
- [Event Sourcing Pattern (Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [Multi-Tenant RLS (AWS)](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)

**Auth & Security:**

- [Clerk vs Auth0 vs Keycloak vs FusionAuth (JAM)](https://www.justaftermidnight247.com/insights/clerk-vs-auth0-vs-keycloak-vs-fusionauth/)
- [WebSocket Authentication 2025 (VideoSDK)](https://www.videosdk.live/developer-hub/websocket/websocket-authentication)
- [Securing Game Code 2025 (Medium)](https://medium.com/@lzysoul/securing-game-code-in-2025-modern-anti-cheat-techniques-and-best-practices-e2e0f6f14173)
- [GDPR Compliance Guide 2026 (SecurePrivacy)](https://secureprivacy.ai/blog/gdpr-compliance-2026)

**Deployment & Ops:**

- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly.io CI/CD with GitHub Actions](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)
- [Railway vs Render vs Fly.io 2026 (PkgPulse)](https://www.pkgpulse.com/blog/railway-vs-render-vs-fly-io-app-hosting-platforms-nodejs-2026)
- [WebSocket Reconnection Guide (WebSocket.org)](https://websocket.org/guides/reconnection/)

**Market & Industry:**

- [eSports Market Trends 2026–2036 (FMI)](https://www.futuremarketinsights.com/reports/esports-market)
- [Global Esports Market Report 2025 (ASO World)](https://asoworld.com/blog/global-esports-market-report-2025/)

---

**Technical Research Completion Date:** 2026-03-24
**Research Period:** Comprehensive technical analysis (Q1 2026)
**Source Verification:** All technical facts cited with current (2025–2026) sources
**Technical Confidence Level:** High — based on 30+ web searches across multiple authoritative sources

_This comprehensive technical research document serves as the authoritative reference for the Competition Platform tech stack decisions and provides the foundation for the subsequent BMAD workflow phases (PRD, Architecture, Epics)._
