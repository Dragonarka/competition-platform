---
slug: couples
human_name: Couples (Fixed Partner)
status: planned
package: packages/formats/couples/ (not yet created)
target_epic: TBD (post-MVP)
domain_origins: ['Partner dance (registered couples)', 'Skating pairs', 'Ice dance']
---

# Couples (Fixed Partner)

Competitors enter **as a partnership** and stay together through all phases. The platform tracks the couple as a single entity. Unlike Jack & Jill, partners do not rotate.

## When to pick this

- Competitors register **as a duo** and are judged **as a duo**
- The pair is the unit of competition (no individual scores)
- Partner cohesion / chemistry is part of what's judged
- Withdrawal of one partner means the couple withdraws

## Phases

Highly configurable. Common shapes:

- **Single-phase panel scoring** — All couples perform, all couples judged on criteria, ranked. (Looks like Cypher's first phase but with pair entities.)
- **Qualifying → finals** — Top K from a panel-scored qualifying round perform again in the finals, fresh judging.
- **Round-robin showcase** — Each couple performs in front of the panel multiple times across "rounds" to smooth out one-shot variance.

## Configurable

| Setting          | Range                                                                        | Default                 | Notes                                                                                     |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| Criteria         | 1–10                                                                         | 3                       | E.g., technique, musicality, partner connection                                           |
| Score scale      | 1–10 / 1–100                                                                 | 1–10                    |                                                                                           |
| Judge count      | 1–N                                                                          | 3                       |                                                                                           |
| Phases           | 1 / 2 / 3                                                                    | 2 (qualifying + finals) |                                                                                           |
| Advancement K    | 4–16                                                                         | 8                       |                                                                                           |
| Rounds per phase | 1+                                                                           | 1                       | >1 averages variance                                                                      |
| Tie-break        | head-to-head re-show / judge re-vote / aggregate of lower-weighted criterion | re-show                 | Couples can't be paired against each other; "head-to-head" means simultaneous performance |
| Withdrawal       | both must withdraw                                                           | yes                     | Partial withdrawal not supported                                                          |

## Fairness invariants

- Each couple performs the same number of times per phase
- Judge identities masked from each other
- Withdrawal handled atomically — score history of the withdrawn couple preserved but excluded from live standings
- Scores published per-couple, never split per-partner

## What it should NOT do

- **No individual scoring within a couple** — the pair is the entity. If you want individual scores, use Jack & Jill.
- **No partner swaps** — once registered, couples are fixed for the event.

## Real-world references

- Most ballroom competitions (Standard / Latin)
- Figure skating pairs
- Acro / partner acrobatics

## Notes for implementation

This is **the closest variant of Cypher Battles** — same panel scoring, but the entity type is "couple" not "individual". The platform's data model already supports `competitors` as a generic entity, so this is mostly:

- A registration UI for couples
- A different `CompetitorEntity` type in the format manifest
- Tweaks to standings display ("1st place: Maria & Juan")

If we built this next, expect ~60% code reuse from cypher-battles.
