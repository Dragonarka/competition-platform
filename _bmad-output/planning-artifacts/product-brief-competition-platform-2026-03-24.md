---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - 'PROJECT-SEED.md'
  - '_bmad-output/planning-artifacts/research/technical-competition-platform-tech-stack-research-2026-03-24.md'
date: 2026-03-24
author: Dragonarka
---

# Product Brief: competition-platform

## Executive Summary

**competition-platform** is a real-time competition management platform that replaces the spreadsheets, manual bracket construction, and improvised workflows that organizers currently rely on to run live competitive events.

Born from the pain of organizing dance competitions — where formats like Solo, Couples, Jack & Jill, and hybrid scoring-to-bracket tournaments must coexist within a single event — the platform automates match generation, bracket progression, real-time scoring, and tournament state management. The primary paying customer is the **organizer**, who today bears an unsustainable cognitive load acting simultaneously as system operator, decision engine, and data processor during live events.

The MVP delivers a system where an organizer can create and configure a competition in minutes, judges score through a simple interface, and competitors see their results and status in real-time — all while the platform handles the complex logic of odd-number participant handling, format transitions, and fair matchup generation. Monetized through a **pay-per-competition model** via Stripe, the platform is designed to scale from dance competitions to any structured competitive format worldwide.

---

## Core Vision

### Problem Statement

Organizing competitions with multiple dynamic formats is a manual, fragmented, and error-prone process. No tool exists that allows organizers to configure and run diverse competition formats — Solo, Couples (same-gender, mixed-gender), Jack & Jill (random pairing with score-based progression), and hybrid formats (point-based qualification into elimination brackets) — within a single event, in real-time, with automated orchestration.

Organizers currently rely on spreadsheets, manual score aggregation, ad-hoc bracket construction, and improvised decision-making under pressure. These tools were never designed for live competition orchestration.

### Problem Impact

- **Organizers** bear crushing cognitive load during live events — monitoring multiple rounds, manually generating matchups, tracking scores, handling odd participant numbers, and making pairing decisions that directly affect fairness. One mistake can undermine the integrity of the entire competition.
- **Judges** lack intuitive scoring tools, causing delays that bottleneck the event flow. Inconsistent submission methods introduce friction and errors.
- **Competitors** experience uncertainty — unclear on who they face next, when they compete, or where they stand in rankings. Manual decisions by organizers can be perceived as unfair, eroding trust.
- **The event itself** suffers: delays compound, errors propagate, and the experience degrades for everyone involved.

### Why Existing Solutions Fall Short

Current approaches fail because they are either:

- **Generic tools** (spreadsheets, paper brackets) that require massive manual effort and provide zero real-time capability
- **Rigid tournament platforms** that support only standard bracket/round-robin formats and cannot handle hybrid flows (e.g., point-based qualification rounds feeding into elimination brackets)
- **Domain-specific apps** that are locked to a single sport or format without the flexibility to combine Solo, Couples, and Jack & Jill within one event

No existing platform handles the **dynamic format composition** that real-world competitions demand — where an event might include a Solo qualifying round scored on points, followed by a Jack & Jill round with random pairing, feeding into a top-16 elimination bracket, all managed by the same organizer in real-time.

### Proposed Solution

A real-time web platform where:

1. **Organizers** create competitions in minutes by selecting and combining format templates (Solo, Couples, Jack & Jill, Hybrid), configuring rules, and letting the system handle the rest — match generation, bracket creation, participant progression, format transitions, and odd-number handling are all automated.
2. **Judges** score through a simple, mobile-friendly interface with minimal friction — scores flow to the system in real-time with connection recovery and retry queues for unreliable networks.
3. **Competitors** see their results, upcoming matches, and tournament progression in real-time — full transparency at all times.

The system is the **single source of truth** for the competition state, replacing the organizer's mental model with an automated, auditable engine.

### Key Differentiators

1. **Dynamic Format Composition** — not just brackets or round-robin, but the ability to combine Solo, Couples, Jack & Jill, and hybrid formats within a single event with automated transitions between stages.
2. **Jack & Jill Automation** — random pairing, score-based progression across partners, and fair matchup generation for a format that is nearly impossible to manage manually at scale.
3. **Real-Time Orchestration** — live scoring, automatic bracket progression, instant visibility for all participants. Not a planning tool — a live operations platform.
4. **Connection Resilience** — retry queues, data transmission recovery, and graceful degradation for the unreliable network conditions common at live events. Future vision includes Bluetooth/intranet mode for zero-internet environments.
5. **Generic & Extensible** — built for dance competitions but architected to support any structured competitive format (sports, esports, academic), becoming the global infrastructure for organizing competitions.
6. **Pay-Per-Competition** — simple monetization via Stripe. Organizers pay per event, no subscriptions. Low barrier to entry for worldwide adoption.
7. **Simulation Mode** — organizers can rehearse entire competitions before going live, test edge cases (odd numbers, withdrawals, format transitions), and run the platform for training sessions without needing real participants. The entire system can be operated solo from the admin panel.

---

## Target Users

### Primary Users

#### 1. The Organizer — "Elena"

**Profile:** Elena runs a dance school in Barcelona and organizes 6–8 competitions per year — from small in-house training events (4–20 dancers) to regional competitions (80–200 dancers). Twice a year she helps coordinate an international congress with 400–700 competitors across multiple formats running simultaneously.

**Current Reality:** Elena manages everything from a laptop at a desk near the stage. During live events she juggles a spreadsheet with competitor names, a WhatsApp group with judges, and handwritten notes for bracket progression. Her phone buzzes constantly with judges asking "who's next?" For small training events it's manageable. For anything above 30 competitors, she dreads the moment she has to manually decide bracket rebalancing when someone drops out or a round produces odd numbers.

**Worst Moment:** A Jack & Jill round with 47 dancers. Three "lives" format — competitors get eliminated after three low scores across different partners. Halfway through, she loses track of who has how many lives, makes a pairing error, and a competitor is wrongly eliminated. The dispute takes 20 minutes to resolve while 46 other dancers wait. Trust eroded.

**Success Vision:** Elena creates an event in 5 minutes, selects "Jack & Jill + Solo Finals" format, imports her competitor list (or shares a registration link), and hits Start. The system handles pairing, tracks lives, flags eliminations, and auto-generates the next round. She watches from her laptop or phone — intervening only for exceptional decisions, not routine operations.

Before the event, Elena runs **simulations** — she creates a test competition with mock competitors, validates format configurations, watches the bracket auto-generate, and verifies scoring flow and elimination logic. On event day, she's confident because she's rehearsed the entire flow. For small training sessions at her school, she runs the **entire system solo from the admin panel** — acting as organizer and judge simultaneously, entering scores herself, no separate judge logins needed.

**Motivation:** Reduce stress, eliminate errors, look professional, grow her event business.

#### 2. The Judge — "Marco"

**Profile:** Marco is a professional dance judge who evaluates at 15–20 events per year. He's experienced and efficient — he knows what he's looking for and can score quickly. At the other end, **Lucía** is a volunteer judge at a local school event — she's a senior dancer helping out, less confident in the process, and needs clear guidance.

**Current Reality:** Marco receives a paper scorecard or is told to "send scores via WhatsApp." At larger events he might use a shared Google Sheet. The friction isn't the scoring itself — it's the submission method. He finishes judging a couple but can't submit because the organizer hasn't told him which row in the spreadsheet to use. Or he submits, but the Wi-Fi drops and he's unsure if it went through.

**Worst Moment:** Submitting scores during a round and the spreadsheet shows a conflict — another judge accidentally overwrote his row. He re-enters, but now there's a 5-minute delay and the organizer is calling him asking what happened.

**Success Vision:** A mobile-first scoring screen. Tap the score, hit submit, see confirmation. If the connection drops, the app queues it and submits when back online. No spreadsheets, no row conflicts, no ambiguity. For Lucía (the volunteer), the interface is simple enough that she needs zero training — just "rate this performance 1–10."

**Motivation:** Speed, reliability, zero friction. Focus on judging, not on tools.

#### 3. The Competitor — "André"

**Profile:** André is a seasoned West Coast Swing dancer who competes at 10+ events per year across Europe. He's in multiple categories — Solo, Jack & Jill, and Couples with his partner. At the other end, **Mia** is entering her first local competition — nervous, unsure how brackets work, and checking her phone every 2 minutes for updates.

**Current Reality:** André checks a printed paper bracket taped to a wall, or refreshes a Google Sheet on his phone. Between rounds he asks other dancers "do you know when Jack & Jill starts?" or "who am I paired with next?" At bigger events, results take 30+ minutes to post because the organizer is manually calculating scores.

**Worst Moment:** André dances a Jack & Jill round, waits 45 minutes for results, then discovers he was eliminated based on a score he believes was entered incorrectly. There's no way to verify — the organizer's spreadsheet is the only record, and it's been modified since.

**Success Vision:** André opens the app, sees his upcoming matches, gets a push notification when it's his turn, and checks real-time standings between rounds. After each round, results appear within seconds. For Mia (the first-timer), the app explains "You're in Round 2 of 4. Your next match is in ~15 minutes. You're currently ranked 8th of 24."

**Motivation:** Transparency, real-time information, trust in the system's fairness.

### Secondary Users

#### Platform Administrator (Future)

As the platform scales, a super-admin role will manage the platform itself — onboarding organizers, managing subscriptions, monitoring system health, handling disputes escalated beyond event level. Not needed for MVP but architecturally anticipated.

#### Spectators (Future Vision)

Friends, family, and remote fans who want to follow a competition live. Read-only leaderboard and bracket view. Low priority but high engagement potential.

### User Journey

| Phase             | Organizer (Elena)                                                                                                                                                                                                                         | Judge (Marco)                                                                                                     | Competitor (André)                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Discovery**     | Word of mouth from other organizers, social media, sees it at a competitor's event                                                                                                                                                        | Invited by organizer ("use this to score")                                                                        | Sees registration link shared by organizer, or sees live results at an event                                          |
| **Onboarding**    | Creates account, runs first event as a simulation — full admin control, no real judges/competitors needed. Learns the system risk-free. Free tier for <15 competitors                                                                     | Receives invite link from organizer. Opens on phone, logs in, sees assigned rounds                                | Clicks registration link, creates profile, selects categories                                                         |
| **Core Usage**    | Pre-event: runs simulation to validate format config. During event: monitors live from laptop/phone, handles edge cases. Post-event: reviews results and audit trail. For training sessions: runs entire system solo as organizer + judge | Opens scoring interface on phone during event. Taps scores, submits, sees confirmation. Moves to next performance | Checks upcoming matches, receives notifications, views real-time standings and results                                |
| **"Aha!" Moment** | First event where a Jack & Jill round with odd numbers auto-resolves without manual intervention — "I didn't have to touch anything"                                                                                                      | Submits a score during a Wi-Fi drop, sees it auto-sync when connection returns — "it just worked"                 | Sees real-time leaderboard update seconds after a judge scores — "I know exactly where I stand"                       |
| **Long-term**     | Runs all events on the platform. Upgrades to paid tier as events grow. Becomes an advocate. Shares with other organizers                                                                                                                  | Expects every event to use it. Refuses to go back to paper/WhatsApp scoring                                       | Prefers events that use the platform. Trusts the results. Considers paying for personal performance feedback (future) |

---

## Success Metrics

### User Success Metrics

| Metric                             | Target                                                                  | How We Measure                                                |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Time to first competition**      | <10 minutes from signup to running a simulation                         | Track onboarding funnel completion time                       |
| **Competition setup time**         | <5 minutes for a standard format (quick mode: enter names + type, go)   | In-app timer from "create event" to "start competition"       |
| **Organizer self-sufficiency**     | Organizer runs full event without contacting support                    | Support ticket rate per event                                 |
| **Zero scoring errors**            | 0 manual scoring errors per event (system handles all calculations)     | Compare system-calculated vs manually-overridden results      |
| **Judge submission success rate**  | >99% of scores successfully submitted (including retry/recovery)        | Track submissions, retries, and failures                      |
| **Competitor real-time awareness** | Results visible within 10 seconds of last judge submission              | Measure time from score submission to leaderboard update      |
| **Format coverage**                | Organizer says "it covers all my competition needs"                     | Post-event survey: "Did the platform handle your format?" Y/N |
| **Repeat usage**                   | Organizer uses platform for next event (not going back to spreadsheets) | Retention rate: % of organizers who create 2+ events          |

### Business Objectives

**Phase 1 — Colombia Launch (Months 1–3):**

- Launch with 3–5 organizers in the Colombian dance competition community (friends & immediate network)
- Run 10+ real events successfully on the platform
- Cover all common formats: Solo, Couples (leader/follower with imbalance handling), Jack & Jill, 1v1, 2v2
- Zero critical failures during live events
- Platform monthly cost stays under $50/mo (leveraging Fly.io scale-to-zero architecture)

**Phase 2 — Word of Mouth Growth (Months 4–8):**

- Organic growth through Colombia's dance community — organizers recommend to other organizers
- 15+ active organizers, 50+ events completed
- Expand format support based on real organizer feedback
- Introduce paid tier (symbolic pricing for art/dance community)
- Multi-language: Spanish (Colombia) + English as baseline

**Phase 3 — Regional Expansion (Months 9–12):**

- Expand to Latin America and European dance communities
- Explore AI-powered features: automated bracket optimization, performance insights, smart pairing suggestions
- Revenue covers platform operational costs + 5-year data retention
- Begin building reputation as the go-to competition platform

**Long-term Vision (Year 2+):**

- Global platform supporting all competition types (dance, sports, esports, academic)
- AI capabilities in all world languages
- Significant revenue from international adoption
- 5+ years of historical competition data preserved for every organizer

### Key Performance Indicators

| KPI                               | 3-Month Target                                       | 12-Month Target            | Measurement                                            |
| --------------------------------- | ---------------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| **Active organizers**             | 5                                                    | 30+                        | Unique organizers who created an event in last 30 days |
| **Events completed**              | 10                                                   | 100+                       | Events that reached "completed" status                 |
| **Competitors managed**           | 200                                                  | 5,000+                     | Unique competitor registrations across all events      |
| **Platform uptime during events** | 99.9%                                                | 99.9%                      | Monitoring (Grafana)                                   |
| **Event completion rate**         | 100% (zero abandoned events due to platform failure) | 100%                       | Events started vs events completed                     |
| **Monthly infrastructure cost**   | <$50                                                 | <$200                      | Fly.io + services billing                              |
| **Organizer retention**           | 80%+ return for second event                         | 70%+ active after 6 months | Cohort retention analysis                              |
| **NPS (organizers)**              | >50                                                  | >60                        | Post-event survey                                      |

### Pricing Strategy (To Be Validated)

- **Free tier:** <15 competitors per event (covers training sessions and small events)
- **Paid tier:** 15+ competitors — symbolic pricing appropriate for the art/dance community. Exact price TBD after validating with initial Colombian organizers.
- **Pricing principle:** Cover operational costs + 5-year historical data retention. Not profit-maximizing initially — build trust and adoption first.
- **Future:** Scale pricing with event size and premium features (AI insights, advanced analytics, reports/graphics export)

---

## MVP Scope

### Core Features

**1. Competition Management**

- Organizer creates and manages multiple competitions within an event
- Custom category naming (amateur, pro, star, urban, etc.) — organizer-defined, not platform-imposed
- Organizer manually registers competitors (name, basic info)
- Competitors persist across phases within a competition — a competitor registered once carries their identity, scores, and progression history through all phases

**2. Qualification Templates**

- Organizer creates scoring templates: a list of items/criteria to be evaluated
- Templates are reusable across competitions
- Each criterion produces a numeric score with 2-decimal precision
- Judges see and use these templates during live scoring

**3. Three Base Format Engines**

| Format                  | Description                                                                                                                                                                | Key Logic                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **1v1 Group Rounds**    | Groups of 4–5 competitors perform in rounds (e.g., 2 rounds per song). Judges score each competitor in the group using the qualification template. Top performers advance. | Group assignment, round rotation, score aggregation, advancement threshold                          |
| **2v2 Leader/Follower** | Paired competition with leader/follower roles. Handles role imbalance (e.g., more leaders than followers).                                                                 | Role-based pairing, imbalance resolution (byes, rotation), pair scoring                             |
| **Jack & Jill**         | Partner selection/random pairing. Judges score competitors individually across different partners. Progression based on accumulated qualifications.                        | Random/managed pairing, per-competitor scoring across partners, elimination logic (e.g., "3 lives") |

**4. Format Composition & Phase Transitions**

- A competition can have multiple sequential phases (e.g., Group Qualification → Top-16 Bracket → Finals)
- Each phase can use a different format engine
- Competitors who meet advancement conditions automatically carry into the next phase
- Organizer defines transition rules: how many advance, by what criteria (top N scores, threshold, etc.)

**5. Real-Time Judge Interface**

- Mobile-first scoring screen
- Shows: current competitors being judged, qualification template with criteria, score input (2-decimal numeric)
- Submit confirmation with retry queue for unreliable connections
- Judges see only what they need — no competition management complexity

**6. Real-Time Competition State**

- Live bracket/standings visible to organizer
- Automatic matchup generation and progression
- Odd-number handling (byes, rotation) automated
- Score aggregation and ranking calculated by the system — zero manual math

**7. Simulation Mode**

- Organizer inputs real or mock competitors
- Runs full competition flow: format configuration → scoring → progression → results
- Used for: platform testing, judge training, format validation before live events
- Organizer can act as all roles (organizer + judge) from admin panel
- No separate judge accounts required for simulation

**8. Admin Solo Operation**

- For small events/training: organizer scores directly from admin panel
- No mandatory judge logins — single-person operation possible

**9. Authentication & Roles**

- Organizer account (email + password, OAuth)
- Judge access via invite link from organizer
- Two roles for MVP: Organizer (admin) and Judge

**10. Internationalization (Minimal)**

- Spanish and English only
- UI language switching at user level

### Out of Scope for MVP

| Feature                                     | Rationale                                                                                        | When                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| **Competitor self-registration & profiles** | Simplifies MVP — organizer controls registration. Dance profile with history is a growth feature | Post-MVP (fast-follow) |
| **AI-generated feedback via email**         | Requires AI pipeline, email infrastructure, and template design                                  | Post-MVP               |
| **Spectator view**                          | Read-only public view is high engagement but not core to running competitions                    | Post-MVP               |
| **Advanced analytics & reports**            | Organizers need to run events first; analytics come from accumulated data                        | Post-MVP               |
| **Export (PDF, CSV, graphics)**             | Nice-to-have for post-event sharing, not needed for live operations                              | Post-MVP               |
| **Languages beyond ES/EN**                  | Colombia launch + English covers initial market                                                  | Post-MVP               |
| **Stripe payments / paid tier**             | Launch free, validate product-market fit first. Symbolic pricing introduced in Phase 2           | Months 4–8             |
| **Push notifications**                      | Competitors aren't self-registering in MVP; organizer communicates directly                      | Post-MVP               |
| **Platform super-admin**                    | Not needed until multi-organizer scale                                                           | Post-MVP               |
| **Offline/Bluetooth mode**                  | Retry queues handle bad connectivity; true offline is a different architecture                   | Future                 |

### MVP Success Criteria

| Criteria                                | Gate                                                                                         | How We Validate                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **End-to-end competition**              | Organizer creates competition → judges score → system progresses bracket → results displayed | Run 3+ full simulations with all 3 format engines                |
| **Format transitions work**             | Group phase → bracket phase with competitor persistence and score carryover                  | Test with 20+ competitors through 2+ phase transitions           |
| **Judge UX passes the "Lucía test"**    | Volunteer judge with zero training can score a round in <2 minutes                           | Usability test with non-technical user                           |
| **Simulation validates live readiness** | Organizer runs simulation, gains confidence, proceeds to live event                          | First 3 organizers run simulations before their first live event |
| **Zero abandoned events**               | No competition fails mid-event due to platform error                                         | 10+ events completed with 100% completion rate                   |
| **Colombia adoption**                   | 3–5 organizers actively using platform                                                       | Track active organizers in months 1–3                            |

### Future Vision

**Post-MVP Enhancements (Months 4–12):**

- Competitor self-registration with dance profile (competition history, qualifications, rankings)
- AI-generated performance feedback sent to competitors via email
- Stripe integration with symbolic pricing for art/dance community
- Spectator mode — live public leaderboard and bracket view
- Export: results as PDF, CSV, branded graphics for social media
- Advanced analytics: organizer dashboard with event insights, judge consistency metrics

**Platform Evolution (Year 2+):**

- AI capabilities: bracket optimization, smart pairing suggestions, performance pattern analysis
- Full multi-language support (all world languages)
- Competitor-facing app with personal performance tracking across events
- API for third-party integrations (event platforms, social media, streaming)
- Expansion beyond dance: sports, esports, academic competitions, hackathons
- Enterprise tier for large-scale international events (400–700+ competitors)
