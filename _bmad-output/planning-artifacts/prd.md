---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
inputDocuments:
  - '_bmad-output/planning-artifacts/product-brief-competition-platform-2026-03-24.md'
  - '_bmad-output/planning-artifacts/research/technical-competition-platform-tech-stack-research-2026-03-24.md'
documentCounts:
  briefs: 1
  research: 1
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: 'saas_web_app_hybrid'
  domain: 'events_competition_management'
  complexity: 'medium-high'
  projectContext: 'greenfield'
workflowType: 'prd'
date: '2026-03-30'
author: 'Dragonarka'
---

# Product Requirements Document - competition-platform

**Author:** Dragonarka
**Date:** 2026-03-30

## Executive Summary

competition-platform is a real-time competition management platform built on a **game-theory-driven format engine** that guarantees mathematical fairness across any competition type. The platform replaces the spreadsheets, manual bracket construction, and improvised workflows that organizers currently rely on to run live competitive events — where a single pairing error or scoring mistake can undermine an entire competition's integrity.

The primary paying customer is the **organizer** — today bearing unsustainable cognitive load as system operator, decision engine, and fairness arbiter simultaneously. The platform automates match generation, bracket progression, real-time scoring, format transitions, and odd-number handling. Judges score through a mobile-first interface with connection resilience. Competitors see results and standings in real-time.

The initial market is the **Colombian dance competition community**, where formats like Solo, Couples, Jack & Jill, and hybrid scoring-to-bracket tournaments coexist within single events. Monetized through a **pay-per-competition model** via Stripe, the platform is designed to scale from dance to any structured competitive format worldwide.

### What Makes This Special

The core differentiator is the **competition format engine** — a modular, game-theory-based system where fairness is the foundation, not a feature. Competition formats (Solo, Jack & Jill, 1v1, 2v2, hybrid multi-phase) are pluggable modules built on mathematical fairness principles: provably fair pairing algorithms, unbiased progression logic, and transparent scoring aggregation.

This engine is designed to be **independently extensible** — potentially open-source — so the community can contribute new competition formats without modifying the platform core. No existing platform treats competition format logic as a composable, mathematically grounded module. Existing solutions are either generic tools (spreadsheets) that require massive manual effort, rigid tournament platforms locked to standard brackets, or domain-specific apps without format flexibility.

When the engine guarantees fairness by design, organizers stop being referees of fairness and become hosts of great events. The trust problem — competitors questioning manual decisions — dissolves because the system's logic is transparent and auditable through event sourcing.

## Project Classification

- **Project Type:** SaaS / Web App (Hybrid) — multi-tenant web platform with real-time WebSocket capabilities, RBAC (organizer/judge roles), pay-per-competition monetization, and mobile-first judge interface
- **Domain:** Events / Competition Management — competition orchestration with tournament state machines, format engines, and scoring integrity. Elevated integrity requirements due to money-on-the-line scoring
- **Complexity:** Medium-High — complex domain logic (Jack & Jill pairing, multi-format composition, phase transitions, odd-number handling) combined with real-time technical requirements (WebSocket, event sourcing, reconnection resilience). No regulated-industry compliance beyond Stripe/SOC 2
- **Project Context:** Greenfield — new product, no existing codebase

## Success Criteria

### User Success

| Metric                             | Target                                                          | Measurement                                             |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| **Time to first competition**      | <10 minutes from signup to running a simulation                 | Onboarding funnel completion time                       |
| **Competition setup time**         | <5 minutes for a standard format                                | In-app timer from "create event" to "start competition" |
| **Organizer self-sufficiency**     | Runs full event without contacting support                      | Support ticket rate per event                           |
| **Zero manual scoring errors**     | 0 per event — system handles all calculations                   | System-calculated vs manually-overridden results        |
| **Judge submission success rate**  | >99% including retry/recovery                                   | Track submissions, retries, failures                    |
| **Competitor real-time awareness** | Results visible within 10 seconds of last judge submission      | Time from score submission to leaderboard update        |
| **Fairness confidence**            | Zero organizer overrides of automated pairings needed per event | Track manual override rate                              |
| **Zero fairness disputes**         | 0 disputes caused by pairing or progression logic per event     | Dispute log categorization                              |
| **Repeat usage**                   | Organizer uses platform for next event                          | Retention: % of organizers who create 2+ events         |

### Business Success

**Phase 1 — Colombia Launch (Months 1–3):**

- 3–5 organizers in the Colombian dance community actively using the platform
- 10+ real events completed successfully
- Zero critical failures during live events
- Infrastructure cost <$50/mo (Fly.io scale-to-zero)

**Phase 2 — Word of Mouth + Monetization (Months 4–8):**

- Organizers share platform with competition allies — organic network growth
- Introduce paid tier (pay-per-competition via Stripe)
- 15+ active organizers, 50+ events completed
- Multi-language: Spanish + English as baseline
- Begin global ad campaigns targeting competition-related keywords across languages and formats

**Phase 3 — Market Expansion (Months 9–12):**

- Expand to Latin America and European competition communities
- Capitalize on market gap: existing platforms only support pair/bracket formats — competition-platform covers Solo, J&J, group rounds, hybrid, and any composable format
- Revenue covers operational costs + 5-year data retention
- 30+ active organizers, 100+ events completed

**Open-Source Engine Adoption:**

- Format engine published as independent open-source module
- External contributors submitting new competition formats
- Community-driven format library growing beyond dance (sports, esports, academic)

### Technical Success

| Metric                                   | Target                                        | Measurement                        |
| ---------------------------------------- | --------------------------------------------- | ---------------------------------- |
| **WebSocket latency**                    | <100ms p95 for state updates                  | Prometheus histogram               |
| **Concurrent WebSocket connections**     | 500+ per machine                              | Grafana dashboard                  |
| **Reconnection success rate**            | >99% within grace period                      | Application logs                   |
| **Scoring event throughput**             | 1000 events/sec per node                      | k6 load test                       |
| **Tournament state machine reliability** | Zero invalid state transitions                | Unit tests + production monitoring |
| **Platform uptime during events**        | 99.9%                                         | Monitoring                         |
| **Event completion rate**                | 100% (zero abandoned due to platform failure) | Events started vs completed        |
| **Infrastructure cost (idle)**           | <$15/mo                                       | Fly.io billing                     |
| **Deployment time**                      | <5 minutes (CI/CD)                            | GitHub Actions metrics             |

### Measurable Outcomes

| Outcome                         | 3-Month                      | 12-Month                   |
| ------------------------------- | ---------------------------- | -------------------------- |
| **Active organizers**           | 5                            | 30+                        |
| **Events completed**            | 10                           | 100+                       |
| **Competitors managed**         | 200                          | 5,000+                     |
| **Organizer retention**         | 80%+ return for second event | 70%+ active after 6 months |
| **Organizer NPS**               | >50                          | >60                        |
| **Format engine contributors**  | —                            | 5+ external contributors   |
| **Monthly infrastructure cost** | <$50                         | <$200                      |

## Product Scope

### MVP - Minimum Viable Product

1. **Competition Management** — Create/manage multiple competitions within an event. Custom category naming. Manual competitor registration. Competitor persistence across phases.
2. **Qualification Templates** — Reusable scoring templates with numeric criteria (2-decimal precision). Judges use templates during live scoring.
3. **Three Base Format Engines** — 1v1 Group Rounds (group assignment, rotation, score aggregation, advancement). 2v2 Leader/Follower (role-based pairing, imbalance resolution). Jack & Jill (random pairing, per-competitor scoring across partners, elimination logic).
4. **Format Composition & Phase Transitions** — Multi-phase competitions with different format engines per phase. Automated competitor progression with configurable advancement rules.
5. **Real-Time Judge Interface** — Mobile-first scoring with retry queue for unreliable connections. Minimal UI — judges see only what they need.
6. **Real-Time Competition State** — Live bracket/standings. Automatic matchup generation and progression. Automated odd-number handling (byes, rotation).
7. **Simulation Mode** — Run full competition flow with mock competitors. Organizer can act as all roles from admin panel.
8. **Admin Solo Operation** — Single-person operation for small events/training. No mandatory judge logins.
9. **Authentication & Roles** — Organizer account (email + OAuth via Clerk). Judge access via invite link. Two roles: Organizer and Judge.
10. **Internationalization** — Spanish and English. UI language switching.

### Growth Features (Post-MVP)

- **Stripe integration** — Pay-per-competition monetization. Free tier <15 competitors.
- **Competitor self-registration & profiles** — Dance profile with competition history and rankings.
- **Spectator view** — Read-only public leaderboard and bracket.
- **Global ad campaigns** — Keyword-targeted ads in multiple languages for competition formats.
- **Export** — Results as PDF, CSV, branded graphics for social media.
- **Advanced analytics** — Organizer dashboard with event insights, judge consistency metrics.
- **Push notifications** — Competitor alerts for upcoming matches and results.
- **AI-generated feedback** — Performance feedback sent to competitors via email.

### Vision (Future)

- **Open-source format engine** — Published as independent module. Community contributes new competition formats. Format library extends beyond dance.
- **Global platform** — All competition types (dance, sports, esports, academic, hackathons). AI capabilities in all world languages.
- **AI features** — Bracket optimization, smart pairing suggestions, performance pattern analysis, automated referee systems.
- **Competitor app** — Personal performance tracking across events.
- **API ecosystem** — Third-party integrations (event platforms, social media, streaming).
- **Enterprise tier** — Large-scale international events (400–700+ competitors).
- **Offline/Bluetooth mode** — Zero-internet environments for remote venues.

## User Journeys

### Journey 1: Elena Runs a Live Competition (Organizer — Happy Path)

Elena opens her laptop at a dance congress in Medellín. 180 competitors across three categories: Solo, Couples, and Jack & Jill. She used to dread this moment — the spreadsheet, the WhatsApp chaos, the mental math. Not today.

She logs into competition-platform, opens the event she configured last week, and reviews: Solo qualifying round (groups of 5, top 3 advance), feeding into a top-16 bracket. Couples running in parallel. Jack & Jill starting after the Solo qualifier finishes. She taps **Start Competition**.

The system generates groups, assigns competitors, and displays the first round. Elena sends judge links via WhatsApp — each judge taps a link and sees their scoring screen. Scores flow in real-time. After each group finishes, the system auto-aggregates scores, ranks competitors, and advances the top 3. Elena watches from her dashboard — green checkmarks appearing as rounds complete.

The Jack & Jill round starts. 47 dancers. The system randomly pairs them, tracks individual scores across different partners, manages the "3 lives" elimination format, and flags eliminations automatically. Elena doesn't touch a thing. The round that once caused a 20-minute dispute now runs itself.

The Solo bracket auto-generates from qualifier results. Matchups appear. Competitors see their opponents. Judges get their next assignments. Elena sips her coffee. The event finishes on time for the first time in years.

**Climax:** The Jack & Jill round with 47 dancers auto-resolves odd-number pairing, tracks lives across partners, and eliminates fairly — zero manual intervention needed.

**Resolution:** Elena finishes the event calm, professional, and on schedule. She texts another organizer friend: "You need to try this."

---

### Journey 2: Elena Handles Mid-Event Problems (Organizer — Edge Case)

Round 3 of the Solo bracket. A competitor, Carlos, twists his ankle and withdraws. Elena opens the admin panel, selects Carlos, and marks him as **withdrawn**. The system recalculates the bracket — Carlos's opponent advances automatically, bye slots adjust, and the bracket rebalances. Judges see updated matchups within seconds.

Later, during the Couples round, Judge Marco's phone loses signal. His last score didn't submit. Elena sees a yellow warning on her dashboard: "Judge Marco — disconnected, 1 pending score." Marco reconnects 30 seconds later. His queued score auto-submits. Green checkmark. No intervention needed.

Then, a judgment call. In the Jack & Jill semifinals, a dancer named Sofía is eliminated on points — barely below the threshold. Three judges approach Elena and say, "She deserves to continue — her technique was exceptional, the scores don't reflect it." Elena opens the admin panel, selects Sofía, and uses the **Admin Rescue** function. She enters a note: "Judge consensus override — exceptional technique recognized." Sofía is reinstated into the next round. The event log records every detail: who overrode, why, when, which judges requested it.

**Climax:** Every override — withdrawal, rescue, recalculation — is auditable, traceable, and instant. Elena makes judgment calls confidently because the system handles the cascading effects.

**Resolution:** The event continues smoothly despite three disruptions. The audit trail means no one can question what happened or why.

---

### Journey 3: Elena Rehearses in Simulation Mode (Organizer — Solo Operation)

Two weeks before her next event, Elena sits at her kitchen table with her laptop. She creates a new competition in simulation mode — 24 mock competitors auto-generated, Solo qualifier into top-8 bracket.

She configures the format: groups of 4, 2 rounds per group, top 2 advance. She hits **Start Simulation**. The system generates groups and shows her the first round. Since there are no real judges, Elena switches to the admin scoring panel and enters scores herself — tapping through each competitor's criteria. She's testing the flow, not the scores.

After scoring two groups, she sees how advancement works. She adjusts the threshold from "top 2" to "top 3" and restarts the simulation. She tests what happens with an odd number — removes one mock competitor. The system creates a bye. She tests a withdrawal mid-bracket. The rebalancing works.

She runs a Jack & Jill simulation with 15 mock dancers and the "3 lives" format. She enters scores across rounds, watches eliminations trigger, and verifies the pairing algorithm doesn't repeat partners.

**Climax:** Elena discovers that her planned format transition (Solo qualifier → bracket) needs a scoring threshold adjustment. She catches it in simulation, not on event day.

**Resolution:** Event day arrives. Elena has already rehearsed every scenario. She's confident because she's seen the system handle every edge case she could think of.

---

### Journey 4: Lucía Scores Her First Competition (Judge — First-Timer Onboarding)

Lucía is a senior dancer helping out at a local school competition. She's never judged before and isn't tech-savvy. The organizer, Elena, sends a WhatsApp message to the judges group: "Here's your judging link for today's event 👇" followed by a URL.

Lucía taps the link on her phone. No signup. No app download. The browser opens directly to her scoring screen. She sees: the competition name, her role ("Judge"), and the current round with the first group of competitors listed.

The interface is dead simple: competitor name, scoring criteria below (Technique, Musicality, Expression — each a slider or number input from 1.00 to 10.00), and a big green **Submit** button. Lucía watches the first competitor, slides her scores, and taps Submit. A confirmation appears: "Score submitted ✓". She moves to the next competitor.

Halfway through, her phone screen locks. She unlocks it — the scoring page is still there, right where she left it. Later, during a group, her Wi-Fi drops. She submits a score — the button shows "Sending..." then "Queued — will submit when connection returns." Ten seconds later, Wi-Fi reconnects, and the score auto-submits. "Score submitted ✓".

**Climax:** Lucía finishes scoring her assigned rounds and tells Elena, "That was really easy. I didn't need any help."

**Resolution:** The "Lucía test" passes — a volunteer judge with zero training scored a full round in under 2 minutes with no errors and no confusion.

---

### Journey 5: Marco Judges a Full Event (Judge — Experienced)

Marco arrives at a regional competition. He receives Elena's WhatsApp link, taps it, and he's in. He's assigned to the Solo qualifier and the Jack & Jill rounds.

He scores efficiently — he knows what he's looking for. The interface shows him only the current competitor and the criteria. No distractions, no competition management details. Between rounds, he sees "Waiting for next round..." He checks his phone for messages, comes back, and the next round is ready.

During the Jack & Jill, the system tells him which pair is currently performing. He scores the competitor (not the pair) — the system handles the per-competitor aggregation across partners. He submits, moves on. No spreadsheet rows to find, no conflicts with other judges.

**Climax:** Marco submits a score during a Wi-Fi drop. It queues, auto-syncs, confirmed. He thinks: "Finally, a system that just works."

**Resolution:** Marco finishes judging and tells Elena he expects every event to use this platform from now on.

---

### Journey 6: Mia Competes for the First Time (Competitor — First-Timer)

Mia is 19 and entering her first local dance competition. She's nervous. The organizer told all competitors they'd be called when it's their turn — no app needed for now.

She sits in the audience area, watching other competitors perform. When it's her group's turn, the announcer calls: "Group 4 — Mia, Diego, Carla, Tomás — please come to the stage." She performs. She goes back to her seat.

After all groups finish, the organizer projects the live standings screen on a monitor near the stage. Mia sees her name — ranked 6th out of 24. She advanced! The bracket shows her next opponent. She knows exactly when she's up and who she's facing.

Between rounds, the standings update in real-time as other brackets complete. Mia watches her section of the bracket progress. When her next match comes, the announcer calls her again.

**Climax:** Results appear on the projected screen within seconds of the last judge submitting. Mia knows exactly where she stands — no waiting 45 minutes, no ambiguity.

**Resolution:** Mia finishes 5th. She's proud, she trusted the results because she saw them update live, and she signs up for the next event.

---

### Journey 7: André Competes Across Multiple Formats (Competitor — Experienced)

André is at a major congress — Solo, Couples with his partner, and Jack & Jill. He's registered in all three. The organizer projected a live dashboard on screens around the venue.

His Solo qualifier finishes — he checks the standings screen. 3rd place, advances to the bracket. His Couples round is scheduled next — the dashboard shows the order. After Couples, he checks the Jack & Jill schedule — his first pairing is in 20 minutes.

André appreciates that the system tracks his identity across all three formats. His scores, progression, and history are unified. When the Jack & Jill eliminates someone, the reason is transparent — visible accumulated scores, not a mysterious organizer decision.

**Climax:** André sees his J&J elimination score breakdown — transparent, auditable, fair. Even though he disagrees with one judge's score, he trusts the system because the data is visible and the pairing was provably random.

**Resolution:** André finishes the congress having competed in three formats seamlessly. He prefers events that use this platform.

---

### Journey Requirements Summary

| Journey                             | Key Capabilities Revealed                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Elena — Happy Path**              | Event configuration, format composition, auto-generated matchups, real-time dashboard, judge link sharing, automated bracket progression, odd-number handling |
| **Elena — Edge Case**               | Competitor withdrawal with bracket recalculation, admin rescue/override with audit logging, judge disconnection monitoring, phase recalculation               |
| **Elena — Simulation**              | Simulation mode, mock competitor generation, admin scoring panel, format parameter adjustment, restart/reset, solo operation                                  |
| **Lucía — First-Timer Judge**       | WhatsApp link access (no signup), dead-simple scoring UI, connection resilience (queue + auto-retry), session persistence (screen lock recovery)              |
| **Marco — Experienced Judge**       | Fast scoring workflow, per-competitor scoring in J&J, round transition visibility, Wi-Fi drop recovery                                                        |
| **Mia — First-Timer Competitor**    | Projected live standings, bracket visibility, real-time score updates, clear next-match information                                                           |
| **André — Multi-Format Competitor** | Cross-format identity persistence, transparent scoring breakdown, provably fair pairing visibility, unified competition history                               |

## Domain-Specific Requirements

### Scoring Integrity

- Scores are **immutable after submission** — read-only for judges and competitors
- Only the **super admin (organizer)** can modify a submitted score
- Every score modification requires a **mandatory reason** (free-text justification)
- All modifications are recorded in a **changelog**: original score, new score, who changed it, when, and why
- The append-only event store preserves the original score event — modifications are compensating events, never overwrites
- Score history is fully auditable and reconstructable at any point in time

### Fairness Guarantees

- The format engine uses **cryptographically strong randomness** for pairing generation (no predictable seeds)
- Pairing logic is **internally verifiable** but not exposed to users — "the system did it" is the trust model
- No pairing repeats within the same format phase (e.g., J&J partners don't repeat)
- Odd-number handling follows deterministic rules (byes, rotation) — consistent and predictable, not arbitrary
- Game-theory principles ensure no competitor has a structural advantage from pairing order, group assignment, or bracket position

### Data Privacy

- **MVP scope:** Colombia launch — no GDPR compliance required initially
- **Minimal PII collection:** display name + auth token. Clerk handles email/phone in SOC 2-compliant infrastructure
- **European launch deferred** — GDPR compliance will be addressed before regional expansion (Phase 3)
- Competitor personal details (email, phone) are never exposed to organizers — only display name and competition stats

### Financial Considerations

- **Stripe integration is post-MVP** — free platform during Phase 1 validation
- When monetized: pay-per-competition model with transparent pricing
- Refund policy and dispute handling to be defined before Stripe launch
- Pricing sensitivity: dance/art community expects symbolic pricing — cover costs, not maximize profit

### Risk Mitigations

| Risk                             | Mitigation                                                              |
| -------------------------------- | ----------------------------------------------------------------------- |
| **Score tampering**              | Event sourcing — immutable audit trail, compensating events only        |
| **Unfair pairings**              | Cryptographic randomness, no-repeat constraints, game-theory validation |
| **Mid-event data loss**          | WebSocket retry queues, event store replay, connection resilience       |
| **Admin abuse of override**      | Mandatory reason field, full changelog, audit trail visible to platform |
| **Competitor identity disputes** | Organizer-managed registration (MVP), verified profiles (post-MVP)      |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Game-Theory-Based Format Engine (Core Innovation)**
Competition formats treated as composable, mathematically grounded modules — not hardcoded tournament brackets. Each format (Solo, J&J, 1v1, 2v2, group rounds) is a pluggable engine with game-theory fairness guarantees. No existing platform approaches competition logic this way.

**2. Dynamic Format Composition**
Multiple format engines combined within a single event with automated phase transitions and competitor persistence across phases. Example: Solo qualifier (scored) → top-16 bracket (elimination) → Jack & Jill finals (random pairing). No platform handles this today.

**3. Open-Source Extensible Engine**
The format engine published as an independent open-source module, enabling community-contributed competition formats. This creates a network effect: every new format added by the community makes the platform more valuable for all organizers.

### Market Context & Competitive Landscape

| Platform            | Type               | Formats Supported                      | Subjective Judging | Real-Time     | Limitations                                                    |
| ------------------- | ------------------ | -------------------------------------- | ------------------ | ------------- | -------------------------------------------------------------- |
| **O2CM**            | Dance-specific     | Ballroom heats, callbacks              | Yes                | Yes (basic)   | Dated UI, HTTP security issues, $50+ fees, no modern API       |
| **CompMngr**        | Dance-specific     | Ballroom DanceSport                    | Paper-based        | No            | Windows desktop app, stagnant development                      |
| **DanceComp Genie** | Dance-specific     | Studio dance (jazz, tap, ballet)       | Yes                | Yes           | No partner dance / J&J / social dance formats                  |
| **EEPro**           | Dance-specific     | WCS, Hustle, J&J callbacks             | Yes                | Yes           | Niche to swing dance, small operation, limited features        |
| **Challonge**       | General tournament | Single/double elim, round robin, Swiss | No                 | Bracket only  | No subjective judging, no format mixing, ads on free tier      |
| **Start.gg**        | Esports            | Brackets, pools, Swiss                 | No                 | Match results | Esports-only, no scored competitions                           |
| **Toornament**      | Esports            | Brackets, Swiss, Battle Royale         | No                 | Match results | Gaming-centric, no judging support                             |
| **ScoreJudge**      | Generic judging    | Custom criteria scoring                | Yes                | Yes           | Scoring-only — no brackets, registration, or format management |

**Key market gaps this platform fills:**

1. **No platform combines multiple competition formats within one event** — dance weekends mix Solo, J&J, Couples, and bracket competitions but current tools handle at most one or two
2. **Jack & Jill is poorly served** — random pairing + per-competitor scoring across partners handled by only EEPro and O2CM, neither integrates with other formats
3. **Dance platforms have dated UX/architecture** — Windows-only apps, HTTP security issues, no APIs, no WebSocket real-time
4. **Tournament platforms lack subjective judging** — Challonge, Start.gg, Toornament assume win/loss outcomes, not multi-judge scored competitions
5. **No real-time WebSocket scoring at scale** — most platforms use polling or page refresh

**Market size:** Dance competition platforms market valued at $1.12B (2024), projected $3.47B by 2033 (14.7% CAGR).

### Validation Approach

1. **Mathematical validation** — Formal proofs for fairness properties of each format engine (no structural advantage from pairing order, group assignment, or bracket position)
2. **Simulation testing** — Run thousands of simulated competitions with varying participant counts, odd numbers, withdrawals, and format transitions. Validate statistical fairness across outcomes
3. **Real-world validation** — Run 10+ events with 3–5 Colombian organizers. "Run 50 events and see if anyone complains" as the pragmatic validation layer
4. **Fallback strategy** — MVP starts with hardcoded format implementations (Solo, J&J, 1v1, 2v2). Pluggable architecture is a refactor after MVP validates the formats work. Non-negotiable for open-source release, but MVP can ship without it

### Risk Mitigation

| Innovation Risk                                 | Mitigation                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Format engine too complex for MVP timeline**  | Start with hardcoded implementations, refactor to pluggable architecture post-MVP               |
| **Game-theory fairness claims challenged**      | Mathematical proofs + simulation testing + transparent audit trail                              |
| **Open-source engine not adopted**              | Engine is valuable to the platform regardless — community adoption is a bonus, not a dependency |
| **New format types have unforeseen edge cases** | Simulation mode lets organizers test any format configuration before going live                 |
| **Competitors don't trust "the system did it"** | Audit trail available to organizers; transparent scoring breakdowns visible to competitors      |

## SaaS / Web App Specific Requirements

### Project-Type Overview

A multi-tenant real-time web platform with two distinct frontend experiences: an **organizer dashboard** (desktop + mobile) for competition configuration and live management, and a **judge scoring interface** (mobile-first) for frictionless score submission. Competitors interact through projected/shared screens at MVP — no dedicated competitor app.

### Technical Architecture Considerations

**Rendering Strategy:**

- **Next.js with PPR (Partial Prerendering)** — static shell served instantly, dynamic content streamed. Ideal for dashboards mixing static layout with live competition data
- Organizer dashboard: server-rendered pages with real-time WebSocket overlays for live state
- Judge scoring interface: lightweight client-side app optimized for minimal JS payload and fast interaction on mobile
- Public event pages: server-rendered for future SEO discoverability (not MVP priority)

**Browser Support:**

- Modern evergreen browsers only: Chrome, Safari, Firefox, Edge (latest 2 versions)
- No IE11, no legacy browser support
- Mobile: iOS Safari 16+, Chrome Android 110+
- Desktop: Chrome 110+, Safari 16+, Firefox 110+, Edge 110+

**Responsive Design:**

- Judge interface: **mobile-first** — designed for phone screens, scales up to tablet
- Organizer dashboard: **desktop-first** — designed for laptop/desktop, responsive down to tablet. Usable on phone but optimized for larger screens
- Public standings/bracket view: responsive — works on projected screens, desktop, and phone

### Multi-Tenancy Model

- **Shared database + PostgreSQL Row-Level Security (RLS)** — all organizations share one database, data isolation enforced at the database level
- Each organizer account is an organization (tenant)
- Competitions belong to an organization — RLS ensures organizers only see their own data
- Competitors can participate across organizations (many-to-many) — organizers see only display name and competition stats, never PII
- Session context sets `current_organization_id` for RLS policy enforcement

### RBAC Matrix (MVP)

| Role                        | Create Event | Configure Format | Score               | View Live State          | Override/Rescue           | Manage Judges |
| --------------------------- | ------------ | ---------------- | ------------------- | ------------------------ | ------------------------- | ------------- |
| **Organizer (Super Admin)** | ✓            | ✓                | ✓ (solo mode)       | ✓ (full dashboard)       | ✓ (with mandatory reason) | ✓             |
| **Judge**                   | —            | —                | ✓ (assigned rounds) | ✓ (own submissions only) | —                         | —             |
| **Competitor (future)**     | —            | —                | —                   | ✓ (public standings)     | —                         | —             |

- Organizer is the only authenticated role (email + OAuth via Clerk)
- Judges access via shareable invite link — no account creation required
- Judge links are competition-specific and shareable via WhatsApp
- Future: Competitor role with self-registration and personal dashboard

### Subscription Model (Post-MVP)

- **Free tier:** <15 competitors per event (covers training and small events)
- **Paid tier:** 15+ competitors — pay-per-competition via Stripe
- **Pricing principle:** Symbolic pricing for art/dance community. Cover costs + data retention, not profit-maximizing
- No subscription — event-based pricing only

### Performance Targets

| Metric                     | Target                                    | Context                                                  |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| **Judge score submission** | <500ms round-trip (submit → confirmation) | Critical path — judges need instant feedback             |
| **Leaderboard update**     | <10 seconds after last judge submits      | Competitor/spectator visibility                          |
| **Dashboard page load**    | <2 seconds (organizer)                    | PPR serves static shell instantly                        |
| **Judge interface load**   | <1 second on 4G mobile                    | Minimal JS payload, optimized for phones                 |
| **WebSocket reconnection** | <5 seconds with state recovery            | Unreliable venue Wi-Fi                                   |
| **Concurrent connections** | 500+ per machine                          | Large events with judges + organizer + projected screens |

### Integration List (MVP)

| Integration             | Method                                                | Priority |
| ----------------------- | ----------------------------------------------------- | -------- |
| **WhatsApp**            | Shareable judge links (URL only — no API integration) | MVP      |
| **Clerk**               | Authentication provider (organizer accounts, OAuth)   | MVP      |
| **Projected screens**   | Public URL for venue display (bracket/standings)      | MVP      |
| **Stripe**              | Payment processing (pay-per-competition)              | Post-MVP |
| **Email notifications** | Competitor alerts, event summaries                    | Post-MVP |
| **Google Calendar**     | Event scheduling integration                          | Future   |
| **Social media**        | Result sharing, branded graphics export               | Future   |

### Implementation Considerations

- **Security first** — platform handles money-involved competitions. All data in transit over TLS. JWT-based auth with short-lived tokens. Server-authoritative for all game state
- **SEO is not MVP priority** — focus is secure, functional platform. Public event pages will be server-rendered for future discoverability, but no SEO optimization effort in MVP
- **Accessibility baseline** — "usable on any phone" is the standard. Adequate touch targets (44px minimum), readable font sizes, sufficient contrast. No formal WCAG audit for MVP
- **Internationalization** — Spanish and English with runtime switching via i18next. UI strings externalized from day one

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP — the minimum that lets an organizer run a real Cypher → Battle competition without spreadsheets.

**Resource Reality:** Solo developer, 30-day timeline. This means one competition format done excellently, not three formats done partially. The earlier three-engine scope (1v1 Group, 2v2 Leader/Follower, Jack & Jill) is deferred to post-MVP. The MVP ships the **Cypher → Battles** format — which is the actual competition your friend runs.

**Resource Requirements:** 1 full-stack developer, 30 days. NestJS + Next.js + PostgreSQL + Redis + Clerk + Fly.io.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- Elena runs a live Cypher → Battles competition (happy path)
- Elena handles mid-event problems (withdrawal, override, rescue)
- Elena rehearses in simulation mode (solo operation, judge training)
- Lucía scores via WhatsApp link (first-timer judge)
- Marco judges efficiently (experienced judge)
- Mia/André see live standings on projected screen (competitors)

**Must-Have Capabilities:**

**1. Competition Configuration**

- Organizer creates a competition with two phases: Cypher (scoring) → Battles (elimination)
- Configurable evaluation items/criteria for Cypher phase (musicality, technique, etc.)
- Configurable number of participants, judges, judge groups, and advancement threshold (top N)
- Manual competitor registration (name + unique ID)
- Participant format: individual or pairs (evaluation always individual)

**2. Cypher Phase (Scoring Round)**

- Judges divided into configurable groups (e.g., 3 groups of 3)
- Each judge group assigned a subset of participants
- Judges score each assigned participant on all configured criteria (numeric scores)
- Score per participant per judge = sum of all item scores
- Final score = aggregation across all judges who evaluated that participant
- Participants ranked by final score
- Top N advance to Battles phase (configurable N)
- Partner rotation supported — evaluation remains individual

**3. Battles Phase (Elimination Round)**

- Tournament bracket generated from Cypher qualifiers
- Judges vote: **Player 1**, **Player 2**, or **Tie**
- Winner = majority of votes
- Tie-breaking rules (configurable by organizer or re-vote)
- Bracket progression until final winner
- Configurable number of judges for Battles (can differ from Cypher)

**4. Judge Interface (Mobile-First)**

- WhatsApp-shareable link — no signup, no app download
- Cypher mode: see participant ID + name, score each criterion, submit
- Battles mode: see both competitors, vote Player 1 / Player 2 / Tie, submit
- Retry queue for unreliable connections
- Session persistence (screen lock recovery)
- Judge sees only their assigned participants/matches

**5. Organizer Dashboard**

- Live competition state: current phase, scores flowing in, standings
- Judge connection monitoring (connected/disconnected/pending scores)
- Admin overrides: score modification (with mandatory reason + changelog), competitor rescue, withdrawal with bracket recalculation
- Phase transition control: review Cypher results → confirm advancement → start Battles
- Solo scoring mode: organizer can score directly from admin panel

**6. Real-Time Competition State**

- Live standings visible via public URL (for projected screens at venue)
- Bracket view for Battles phase
- Real-time updates as scores/votes come in
- WebSocket for live state, retry queue for resilience

**7. Simulation Mode**

- Create competition with mock competitors
- Organizer acts as all roles (organizer + judges)
- Test full flow: Cypher scoring → advancement → Battles bracket → winner
- Used for: judge training, format validation, pre-event rehearsal
- Restart/reset capability

**8. Authentication & Access**

- Organizer account via Clerk (email + OAuth)
- Judge access via invite link (competition-specific, no signup)
- Two roles: Organizer (super admin) and Judge

**9. Internationalization**

- Spanish and English
- UI language switching

### Post-MVP Features (Phase 2 — Months 2–4)

- **Additional format engines** — Jack & Jill (random pairing, lives elimination), 2v2 Leader/Follower (role imbalance handling), Solo group rounds
- **Format composition** — Multiple format engines within a single event with automated phase transitions
- **Stripe integration** — Pay-per-competition monetization
- **Competitor self-registration** — Registration links, competitor profiles
- **Spectator view** — Public leaderboard beyond projected screens
- **Export** — Results as PDF, CSV, branded graphics
- **Push notifications** — Competitor alerts

### Expansion Features (Phase 3 — Months 5–12)

- **Pluggable format engine architecture** — Refactor hardcoded formats into composable modules
- **Open-source format engine** — Publish as independent module
- **Advanced analytics** — Organizer dashboard with event insights, judge consistency metrics
- **AI features** — Smart pairing, performance analysis, automated feedback
- **Global ad campaigns** — Multi-language keyword targeting
- **Multi-language expansion** — Beyond ES/EN
- **API ecosystem** — Third-party integrations
- **Enterprise tier** — Large-scale international events

### Risk Mitigation Strategy

**Technical Risks:**

| Risk                               | Mitigation                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **30-day timeline too tight**      | Cypher phase is priority #1. If time runs short, Battles bracket can be simplified (single elimination, no re-seeding). Simulation mode can launch with basic flow (no edge case testing) |
| **Real-time WebSocket complexity** | Start with Socket.IO defaults (single node). Multi-node scaling (Redis adapter) is not needed at MVP scale (one event, <50 connections)                                                   |
| **Judge group assignment logic**   | Well-defined algorithm: round-robin assignment of participants to judge groups. Implement and test in simulation first                                                                    |
| **Event sourcing overhead**        | For MVP, append-only PostgreSQL table is sufficient. Full CQRS separation can come post-MVP                                                                                               |

**Market Risks:**

| Risk                                   | Mitigation                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Friend doesn't adopt platform**      | Simulation mode lets them try risk-free before a live event. Solo operation means they can test alone            |
| **Format doesn't generalize**          | Cypher → Battles is a common competition format beyond dance. Validates core scoring + voting + bracket pipeline |
| **Competitors don't trust the system** | Transparent scoring breakdown on projected screens. Audit trail for organizer                                    |

**Resource Risks:**

| Risk                       | Mitigation                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solo developer burnout** | Focus on one format done well, not three partial implementations. Use Clerk (zero auth dev), Fly.io (zero DevOps), shadcn/ui (pre-built components) |
| **Scope creep**            | MVP is Cypher → Battles only. Everything else is post-MVP. No exceptions                                                                            |
| **30 days isn't enough**   | Worst case: ship Cypher-only MVP (scoring + rankings), add Battles bracket in week 5. Still useful for organizer                                    |

## Functional Requirements

### Competition Setup & Configuration

- **FR1:** Organizer can create a new competition with a name, date, and description
- **FR2:** Organizer can define evaluation criteria for the Cypher phase (e.g., musicality, technique, creativity) with configurable number of items
- **FR3:** Organizer can register participants manually by entering name and unique ID
- **FR4:** Organizer can specify participant format (individual or pairs) for the Cypher phase
- **FR5:** Organizer can configure the number of judges and how they are divided into groups for the Cypher phase
- **FR6:** Organizer can assign subsets of participants to each judge group
- **FR7:** Organizer can configure the advancement threshold (top N participants) that qualify from Cypher to Battles
- **FR8:** Organizer can configure the number of judges for the Battles phase (independently from Cypher)
- **FR9:** Organizer can configure tie-breaking rules for the Battles phase (re-vote or organizer decision)
- **FR10:** Organizer can reuse evaluation criteria templates across competitions

### Cypher Phase (Scoring Round)

- **FR11:** System generates judge group assignments based on organizer configuration (participants distributed across judge groups)
- **FR12:** Each judge receives only the participants assigned to their group for scoring
- **FR13:** Judges score each assigned participant on every configured evaluation criterion using numeric values
- **FR14:** System calculates per-participant-per-judge score as the sum of all criterion scores
- **FR15:** System calculates final participant score as the aggregation of scores from all judges who evaluated that participant
- **FR16:** System ranks all participants by final score
- **FR17:** System identifies the top N participants who advance to the Battles phase based on the configured threshold
- **FR18:** System supports partner rotation during the Cypher phase while maintaining individual evaluation
- **FR19:** Organizer can review all Cypher scores and rankings before confirming advancement to Battles

### Battles Phase (Elimination Round)

- **FR20:** System generates a tournament bracket from the participants who advanced from the Cypher phase
- **FR21:** Each battle matchup is presented to judges with two competitors identified
- **FR22:** Judges vote for one of three options per matchup: Player 1, Player 2, or Tie
- **FR23:** System determines the winner of each matchup by majority vote
- **FR24:** System handles tie votes according to the configured tie-breaking rules
- **FR25:** System progresses the bracket automatically as matchup results are confirmed
- **FR26:** System handles odd numbers in the bracket (byes) when the qualifier count isn't a power of two
- **FR27:** System determines and displays the final competition winner

### Judge Interface

- **FR28:** Judges can access the scoring interface via a shareable URL link (no account creation required)
- **FR29:** Judge links are competition-specific and can be shared via messaging apps
- **FR30:** In Cypher mode, judges see participant ID, name, and all evaluation criteria with score input fields
- **FR31:** In Battles mode, judges see both competitors and three voting options (Player 1, Player 2, Tie)
- **FR32:** Judges receive confirmation after each score/vote submission
- **FR33:** System queues submissions when connection is lost and auto-submits when connection returns
- **FR34:** Judge session persists through screen locks and brief disconnections
- **FR35:** Judges see only their assigned participants/matchups — no access to competition management

### Organizer Administration

- **FR36:** Organizer can view a live dashboard showing current phase, incoming scores/votes, and standings
- **FR37:** Organizer can monitor judge connection status (connected, disconnected, pending submissions)
- **FR38:** Organizer can modify a submitted score with a mandatory reason that is recorded in a changelog
- **FR39:** Organizer can rescue a competitor from elimination (override advancement decisions) with a mandatory reason logged
- **FR40:** Organizer can mark a participant as withdrawn, triggering automatic bracket recalculation
- **FR41:** Organizer can recalculate phase results after a withdrawal or override
- **FR42:** Organizer can control phase transitions (review Cypher results → confirm advancement → start Battles)
- **FR43:** Organizer can score directly from the admin panel (solo operation mode) without separate judge accounts
- **FR44:** All admin overrides are recorded in an immutable audit trail (who, what, when, why)

### Real-Time Competition State

- **FR45:** The system exposes live standings/rankings via a public URL for projected screens at venues
- **FR46:** The system displays a bracket view showing current Battles phase progress on the public URL
- **FR47:** The system updates standings and bracket in real-time as judges submit scores and votes
- **FR48:** The system shows each participant their ranking and upcoming matchup on the projected display
- **FR49:** The system displays score breakdowns on public standings to ensure transparent scoring

### Simulation Mode

- **FR50:** Organizer can create a competition in simulation mode with mock or real participant data
- **FR51:** Organizer can act as all roles (organizer + all judges) from the admin panel in simulation
- **FR52:** Simulation runs the full competition flow: Cypher scoring → advancement → Battles bracket → winner
- **FR53:** Organizer can restart or reset a simulation at any point
- **FR54:** The system displays a persistent visual indicator (banner and distinct color scheme) during simulation mode that is visible on every screen, ensuring users cannot mistake a simulation for a live competition
- **FR55:** Simulation can be used for judge training (judges access via link and practice scoring)

### Authentication & Access Control

- **FR56:** Organizers can create an account using email or OAuth providers
- **FR57:** Organizers can manage their competitions from a personal dashboard
- **FR58:** Judge access links are generated per competition by the organizer
- **FR59:** Judge links authenticate the judge for that specific competition without requiring account creation
- **FR60:** System enforces role-based access: organizers see full admin, judges see only scoring interface
- **FR61:** Organizer data is isolated — organizers cannot see other organizers' competitions

### Internationalization

- **FR62:** Users can switch the UI language between Spanish and English
- **FR63:** Language preference persists across sessions
- **FR64:** All user-facing text is translatable (no hardcoded strings)

## Non-Functional Requirements

### Performance

| Requirement                                                | Target                          | Rationale                                                  |
| ---------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| **NFR1:** Judge score submission round-trip                | <500ms                          | Judges need instant feedback during live scoring           |
| **NFR2:** Vote submission round-trip (Battles)             | <300ms                          | Voting is faster than scoring — responsiveness must match  |
| **NFR3:** Leaderboard/bracket update after last submission | <10 seconds                     | Projected screens at venue must feel "live"                |
| **NFR4:** Judge interface initial load on 4G mobile        | <1 second                       | Judges open link at venue with variable connectivity       |
| **NFR5:** Organizer dashboard page load                    | <2 seconds                      | PPR serves static shell instantly, streams dynamic data    |
| **NFR6:** WebSocket reconnection with state recovery       | <5 seconds                      | Venue Wi-Fi drops are frequent — recovery must be seamless |
| **NFR7:** Score calculation (ranking update)               | <2 seconds for 200 participants | System must recalculate rankings quickly as scores flow in |

### Security

| Requirement                                          | Target                               | Rationale                                                        |
| ---------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| **NFR8:** All data in transit encrypted via TLS      | 100% — no plain HTTP                 | Money-involved competitions require transport security           |
| **NFR9:** JWT tokens short-lived                     | 15-minute expiry with refresh        | Prevent token theft/replay during long competition sessions      |
| **NFR10:** Server-authoritative for all game state   | No client-side score calculation     | Prevent score manipulation — server validates all inputs         |
| **NFR11:** Scores immutable after submission         | Append-only event store              | Original scores preserved; modifications are compensating events |
| **NFR12:** Admin overrides require mandatory reason  | 100% enforcement — no silent changes | Audit trail integrity for dispute resolution                     |
| **NFR13:** Organizer data isolation                  | Database-enforced row-level security | Even application bugs cannot leak cross-tenant data              |
| **NFR14:** Judge links are unguessable               | Cryptographically random tokens      | Prevent unauthorized access to scoring interface                 |
| **NFR15:** Rate limiting on all submission endpoints | Configurable per-endpoint            | Prevent abuse, automated submissions, or accidental double-taps  |

### Reliability

| Requirement                                              | Target                                                 | Rationale                                                       |
| -------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| **NFR16:** Platform uptime during active competitions    | 99.9%                                                  | A mid-event failure is catastrophic — 180 people waiting        |
| **NFR17:** Zero data loss for submitted scores/votes     | 100% durability                                        | Every score must persist even through server restarts           |
| **NFR18:** Submission retry queue with offline tolerance | Auto-retry for up to 5 minutes                         | Venue Wi-Fi is unreliable — queued submissions must not be lost |
| **NFR19:** Graceful degradation on connection loss       | UI remains functional, queues submissions              | Judges should not see error screens — just "Sending..." state   |
| **NFR20:** Event completion rate                         | 100% — zero abandoned events due to platform failure   | No competition should fail mid-event because of the system      |
| **NFR21:** State recovery after server restart           | Full tournament state reconstructable from event store | Event sourcing ensures no state is lost on restart              |

### Scalability

| Requirement                                           | Target                                    | Rationale                                                            |
| ----------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| **NFR22:** Concurrent WebSocket connections per event | 50+ (MVP), 500+ (post-MVP)                | MVP: ~9 judges + organizer + projected screens. Growth: large events |
| **NFR23:** Concurrent competitions per organizer      | 5+                                        | Large events run multiple competitions simultaneously                |
| **NFR24:** Participants per competition               | 200+                                      | Regional events with 80–200 dancers                                  |
| **NFR25:** Infrastructure cost when idle (no events)  | <$15/month                                | Scale-to-zero between events — pay only during active use            |
| **NFR26:** Infrastructure cost during active event    | <$50/month (MVP)                          | Single-region deployment sufficient for MVP                          |
| **NFR27:** Deployment to new regions                  | Single command via infrastructure tooling | Future: spin up near physical event location                         |
