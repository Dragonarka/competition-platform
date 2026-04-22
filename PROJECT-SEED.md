# Competition Platform — Project Seed

> **Owner:** Dragonarka
> **Created:** 2026-03-23
> **BMAD Strategy:** Full BMAD (Maximum Structure)
> **Status:** Not started — begin with `/bmad-bmm-create-product-brief`

---

## Vision

A real-time web browser platform using WebSockets where contenders/players compete in qualification rounds. The system handles multiple competition phases with fair, mathematically-grounded logic based on game theory principles.

## Core Requirements

### Functional

- **Real-time competition** via WebSockets — live scoring, phase transitions, player state sync
- **Multiple competition phases** — qualifiers, brackets, finals, custom tournament structures
- **Game theory fairness** — mathematically verifiable scoring, mechanism design, anti-collusion
- **3 User profiles:**
  - **Admin** — create/manage competitions, configure rules, monitor system
  - **Player** — join competitions, compete in real-time, view rankings
  - **Judge** — score/evaluate, validate results, flag disputes
- **Multi-language support** — full i18n for all world languages, RTL support
- **Multiple auth methods** — OAuth (Google, GitHub, Apple), email/password, SSO/SAML, phone OTP
- **Scalable** — horizontal scaling, handle thousands of concurrent players
- **Cloud-agnostic** — deployable on AWS, GCP, Azure, or self-hosted

### Non-Functional

- Low latency (<100ms for game state updates)
- Audit trail for all scoring decisions (fairness transparency)
- Accessible (WCAG 2.1 AA minimum)
- API-first design for third-party integrations

## Proposed Tech Stack

| Layer       | Technology              | Reasoning                                                          |
| ----------- | ----------------------- | ------------------------------------------------------------------ |
| Language    | TypeScript (full stack) | Type safety for game logic, shared types client/server             |
| Backend     | NestJS                  | WebSocket gateway, guards (roles), modular, i18n                   |
| Real-time   | Socket.IO on NestJS     | Rooms per competition, namespaces per phase, reconnection          |
| Database    | PostgreSQL + Redis      | PG for persistent state/audit, Redis for real-time scoring/pub-sub |
| Auth        | Keycloak or Auth.js     | Multi-method, role management (admin/player/judge)                 |
| i18n        | i18next                 | Runtime switching, 70+ languages, namespace separation             |
| Frontend    | Next.js + Tailwind      | SSR for admin/judge dashboards, CSR for player real-time           |
| Deployment  | Docker + Kubernetes     | Cloud-agnostic, horizontal scaling for socket servers              |
| Game Theory | Custom engine           | ELO/Glicko-2, Nash equilibrium, mechanism design                   |

## Open Debates (Resolve in PRD/Architecture)

1. **Fairness model:** ELO vs Glicko-2 vs custom mechanism design
2. **Socket scaling:** Sticky sessions vs Redis adapter for multi-node
3. **Competition state machine:** Phase transitions, rollback handling, edge cases
4. **Offline tolerance:** What happens when a player disconnects mid-competition
5. **Anti-cheat:** Client validation, server authority, timing attack prevention
6. **Data residency:** Multi-region deployment for compliance (GDPR, etc.)
7. **Monetization model:** Free tier, premium, enterprise licensing
8. **Competition templates:** Predefined formats vs fully custom rule engines

## BMAD Workflow — Execution Order

```
1. /bmad-bmm-create-product-brief     → Nail down the idea
2. /bmad-bmm-create-prd               → Full requirements (REQUIRED)
3. /bmad-bmm-validate-prd             → Quality check
4. /bmad-bmm-create-ux-design         → UX flows for 3 profiles
5. /bmad-bmm-create-architecture      → Technical decisions (REQUIRED)
6. /bmad-bmm-create-epics-and-stories → Break into work units (REQUIRED)
7. /bmad-bmm-check-implementation-readiness → Gate check (REQUIRED)
8. /bmad-bmm-sprint-planning          → Plan sprints (REQUIRED)
9. /bmad-bmm-create-story             → Story cycle begins (REQUIRED)
10. /bmad-bmm-dev-story               → Implement (REQUIRED)
11. /bmad-bmm-code-review             → Quality review
12. /bmad-bmm-retrospective           → Learn and improve
```

**Supplementary tools:**

- `/ui-ux-pro-max` — Frontend design decisions
- `/bmad-tea-testarch-test-design` — Test strategy alongside architecture
- `/bmad-review-adversarial-general` — Stress-test any artifact

## First Command

Open a new Claude Code session in this directory and run:

```
/bmad-bmm-create-product-brief
```
