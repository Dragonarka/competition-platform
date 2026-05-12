# Architecture

Modular monolith. One Next.js process, one NestJS process, one Postgres, one Redis. tRPC for type-safe request/response, Socket.IO for live updates, Clerk for auth, Drizzle for data with row-level security at every protected procedure.

---

## 1. System view

```mermaid
flowchart TB
    subgraph Browser["Browser"]
        UI["Next.js app<br/>RSC + Client Islands"]
        SIO["socket.io-client"]
        TC["tRPC client (TanStack Query)"]
        UI --> TC
        UI --> SIO
    end

    subgraph Edge["Edge / Next.js server (port 3000)"]
        PROXY["proxy.ts<br/>(Clerk → next-intl)"]
        RSC["RSC renderer"]
        REW["/trpc/* rewrite → API"]
        PROXY --> RSC
        PROXY --> REW
    end

    subgraph Backend["NestJS API (port 3001)"]
        direction TB
        AuthM["AuthModule<br/>(Clerk JWT verify)"]
        TrpcM["TrpcModule<br/>(routers)"]
        WsM["WebsocketModule<br/>(Socket.IO gateway)"]
        DbM["DatabaseModule<br/>(Drizzle + RLS helper)"]
        TrpcM --> AuthM
        WsM --> AuthM
        TrpcM --> DbM
        WsM --> DbM
    end

    subgraph Stores["Stores"]
        PG[("Postgres<br/>schemas: org, competition, score, …")]
        R[("Redis<br/>Socket.IO adapter + cache")]
    end

    TC -->|HTTPS| PROXY
    SIO -->|wss| WsM
    REW -->|tRPC over HTTP| TrpcM
    DbM --> PG
    WsM <--> R
```

### Why this shape

- **One API process** keeps deploys simple and shares the in-memory tRPC schema. Splitting into microservices isn't justified until horizontal-scale signals appear.
- **tRPC end-to-end** means web and api share the exact same types and validators. No drift, no codegen.
- **Socket.IO via Redis adapter** lets us horizontally scale the WebSocket layer later without rewriting clients.
- **RLS at the DB** means even a code bug can't leak data across organizers — Postgres refuses.

---

## 2. Routes and roles

```mermaid
flowchart LR
    subgraph Public["/* (anonymous)"]
        P1["/sign-in"]
        P2["/sign-up"]
        P3["/[id]/standings"]
        P4["/[id]/bracket"]
    end

    subgraph Org["/competitions/*, /dashboard (organizer)"]
        O1["/dashboard"]
        O2["/competitions/[id]"]
        O3["/competitions/[id]/live"]
        O4["/competitions/[id]/simulation"]
    end

    subgraph Judge["/judge/* (token-gated)"]
        J1["/judge/[token]"]
    end

    subgraph Presenter["/present/* (organizer-only big screen)"]
        Pr1["/present/[id]"]
    end

    style Public fill:#e8f5e9
    style Org fill:#e3f2fd
    style Judge fill:#fff3e0
    style Presenter fill:#f3e5f5
```

next-intl locale strategy is `as-needed`: English routes have no prefix; Spanish routes are prefixed `/es/`. Clerk's `createRouteMatcher` in `apps/web/src/proxy.ts` lists every protected path explicitly per-locale because path-to-regexp v6 doesn't support `?` on unnamed groups.

---

## 3. Real-time scoring flow

The hot path. From "judge taps score" to "every public viewer sees the new standings" must complete in under 500ms (NFR1).

```mermaid
sequenceDiagram
    autonumber
    participant J as Judge (mobile)
    participant W as Next.js (web)
    participant A as NestJS (api)
    participant DB as Postgres
    participant R as Redis
    participant P as Public viewer

    J->>W: Tap score (UI)
    W->>A: tRPC score.submit
    A->>A: Clerk JWT verify + role check
    A->>DB: BEGIN tx; SET LOCAL session.current_organizer_id; INSERT score
    DB-->>A: commit ✓
    A->>R: publish score.updated {compId, …}
    R-->>A: ack
    A-->>W: { ok: true }
    W-->>J: optimistic UI confirmed

    R->>A: deliver to every Socket.IO node
    A-->>P: ws emit 'score.updated'
    P->>P: re-render standings (<10ms)
```

Why Redis pub/sub between API instances: when the WebSocket fleet scales out, each instance must broadcast to clients connected to _other_ instances. The Redis adapter is the industry-standard way.

---

## 4. Data model — high level

```mermaid
erDiagram
    ORGANIZER ||--o{ COMPETITION : owns
    COMPETITION ||--o{ CRITERION : defines
    COMPETITION ||--o{ PARTICIPANT : has
    COMPETITION ||--o{ JUDGE_GROUP : has
    JUDGE_GROUP ||--o{ JUDGE_LINK : issues
    PARTICIPANT ||--o{ SCORE : receives
    JUDGE_LINK ||--o{ SCORE : submits
    CRITERION ||--o{ SCORE : evaluates

    ORGANIZER {
        text clerkUserId PK
        text email
        text preferredLocale
        timestamptz createdAt
    }
    COMPETITION {
        uuid id PK
        text organizerId FK
        text name
        text phase
        timestamptz createdAt
    }
    SCORE {
        uuid id PK
        uuid competitionId FK
        uuid participantId FK
        uuid criterionId FK
        text judgeLinkToken FK
        numeric value
        timestamptz createdAt
    }
```

(Simplified — see `packages/db/src/schema` for the full set.)

RLS policy on every protected table: `current_setting('session.current_organizer_id') = organizerId`. The helper `withOrganizer(clerkUserId, fn)` in `packages/db` is the only correct way to call queries.

---

## 5. Front-end composition

```mermaid
flowchart TB
    RootLayout["app/layout.tsx<br/>(pass-through)"]
    LocaleLayout["app/[locale]/layout.tsx<br/>(ClerkProvider, IntlProviderClient, TrpcProvider, LocaleBootstrap)"]
    AuthLayout["[locale]/(auth)/layout.tsx<br/>(centered shell + LanguageSwitcher)"]
    AdminLayout["[locale]/(admin)/layout.tsx<br/>(dashboard nav + OrganizerLocaleReconciler)"]
    JudgeLayout["[locale]/(judge)/layout.tsx<br/>(mobile-first, no chrome)"]
    PublicLayout["[locale]/(public)/layout.tsx<br/>(minimal viewer)"]
    PresenterLayout["[locale]/(presenter)/layout.tsx<br/>(big-screen / fullscreen)"]

    RootLayout --> LocaleLayout
    LocaleLayout --> AuthLayout
    LocaleLayout --> AdminLayout
    LocaleLayout --> JudgeLayout
    LocaleLayout --> PublicLayout
    LocaleLayout --> PresenterLayout
```

Every route group has its own layout with role-appropriate chrome. Shared providers (Intl, Clerk, tRPC) live in the locale layout so they wrap everything.

---

## 6. Format plugin architecture

Competition formats (e.g., Cypher Battles) are pluggable modules implementing the `format-sdk` contract. This is a day-one architectural commitment — see [`memory/project_format_plugin_architecture.md`](https://github.com/Dragonarka/competition-platform/blob/main/.claude/projects/-Users-dragonarka-git-competition-platform/memory/project_format_plugin_architecture.md).

```mermaid
flowchart LR
    subgraph SDK["packages/format-sdk"]
        Contract["FormatPlugin<br/>contract"]
        UISurface["UI surface API"]
        Scoring["Scoring API"]
    end

    subgraph FormatPkg["packages/formats/cypher-battles"]
        Manifest["manifest.ts"]
        Logic["scoring.ts"]
        Components["ui/*.tsx"]
    end

    subgraph Web["apps/web"]
        Registry["plugin registry"]
        Resolver["dynamic import"]
    end

    subgraph API["apps/api"]
        FormatAware["format-aware<br/>tRPC procedures"]
    end

    Contract --> Manifest
    UISurface --> Components
    Scoring --> Logic
    Registry --> Resolver
    Resolver --> FormatPkg
    FormatAware --> Logic
```

Adding a new format = new package under `packages/formats/`. The web app discovers it via the registry; the API consumes its scoring rules through the SDK. No edits to core web/api required.

---

## 7. Deployment topology (target state)

```mermaid
flowchart TB
    subgraph DNS["DNS / Edge"]
        D["dragonarka.com"]
    end

    subgraph Vercel["Vercel (or Fly)"]
        Wapp["Next.js<br/>(SSR + edge)"]
    end

    subgraph FlyBog["Fly.io · Bogotá (bog)"]
        Api["NestJS API<br/>(scale-to-zero, 512MB)"]
    end

    subgraph Managed["Managed services"]
        Neon[("Neon Serverless<br/>Postgres")]
        Upstash[("Upstash<br/>Redis")]
        Clerk["Clerk auth"]
    end

    D --> Wapp
    Wapp -->|tRPC over HTTPS| Api
    Wapp <-->|wss| Api
    Api --> Neon
    Api --> Upstash
    Wapp --> Clerk
    Api --> Clerk

    style FlyBog stroke:#7c3aed,stroke-width:2px
    style Managed stroke:#0891b2,stroke-width:2px
```

Current state: API config exists but isn't deployed; web has no deploy config; Neon/Upstash aren't provisioned. See [Deploy](./deploy.md) for the unblock checklist.
