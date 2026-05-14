---
slug: cypher-battles
human_name: Cypher Battles
status: implemented
package: packages/formats/cypher-battles/
ships_with: 1.0
domain_origins: ['Hip-hop dance', 'B-boy/B-girl', 'Freestyle competitions']
---

# Cypher Battles

The first format implemented on the platform. Two-phase model: a judged scoring round (cypher) that filters down to a bracket of head-to-head battles.

## When to pick this

- You want **judges to score against criteria** in a structured first phase, then **eliminate via 1v1 face-offs**
- Participants are **solo** (not pairs, not teams)
- The first phase is **non-elimination**, the second phase is **elimination by direct comparison**
- You want **panel-based scoring** in the first phase (multiple judges, aggregated) and **voting** in the second phase (yes/no per judge per match)

## Phases

1. **Cypher (scoring)** — Every participant performs in front of the judge panel. Each judge scores against the configured criteria (e.g., musicality, technique, originality). Aggregated scores produce a ranked standings list.
2. **Advancement** — Top K participants advance to the battles bracket. K is configurable.
3. **Battles (bracket)** — Single-elimination 1v1 head-to-head. Judges vote per match; majority advances.

## Configurable

| Setting              | Range / Type                                     | Default          | Notes                                            |
| -------------------- | ------------------------------------------------ | ---------------- | ------------------------------------------------ |
| Criteria count       | 1–10                                             | 3                | Each with own scale + weight                     |
| Score scale          | 1–10 or 1–100                                    | 1–10             | Strings stored with 2 decimal precision          |
| Judge count (cypher) | 1–N                                              | 3                | Aggregated by mean                               |
| Advancement K        | 4, 8, 16, 32                                     | 8                | Bracket size must be power of 2                  |
| Judge groups         | per criterion vs all-vs-all                      | all-vs-all       | Story 2.4 added grouping                         |
| Solo mode            | enabled / disabled                               | disabled         | Organizer scores in absence of panel (Story 4.4) |
| Bracket tie-break    | rematch / judge tiebreaker / earlier-round score | judge tiebreaker |                                                  |

## What it explicitly does NOT do

- **No pairs or teams** — solo participants only
- **No cross-pairing or rotating partners** (that's Jack & Jill territory)
- **No qualifying rounds before the cypher** — the cypher IS the first round
- **No audience voting** — judges only
- **No score weights per judge** — every judge counts equally; if you need that, add it as a config and update this doc

## Fairness invariants

- Every participant scored by every cypher judge (no missing data) before advancement is computed
- All scores append-only via event store; overrides produce compensating events
- Bracket pairing seeded by cypher rank (1 vs 8, 2 vs 7, etc.) — deterministic given the same standings
- Judge identity hidden from other judges' view to prevent cross-influence

## Real-world origin

Built for the Colombian hip-hop dance community where cypher-into-battle is the dominant competitive structure.

## Reference implementation

`packages/formats/cypher-battles/src/cypher-battles.format.ts`

## Related desires

Browse `formats/desires/` for past conversations that converged on or diverged from this format.
