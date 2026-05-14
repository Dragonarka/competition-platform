---
slug: group-rounds-1v1
human_name: 1v1 Group Rounds
status: planned
package: packages/formats/group-rounds-1v1/ (not yet created)
target_epic: TBD (post-MVP)
domain_origins: ['Esports group stages', 'Round-robin tournaments', 'Sports league qualifiers']
---

# 1v1 Group Rounds

Participants are split into groups of N. Within each group, every participant faces every other (round-robin). Top K per group advance to a bracket or merged final.

## When to pick this

- You want **round-robin within sub-groups** rather than full single-elimination
- The field is large (>16) and you want to **reduce single-elimination luck** with multiple matches per participant
- 1v1 head-to-head is the unit of competition (not panel judging)
- Win/loss is the primary signal; tiebreakers come from a secondary metric

## Phases

1. **Group assignment** — Participants seeded into groups of N (typically 4–6). Seeding can be random, ranked, or snake-draft.
2. **Group round-robin** — Each participant plays every other in their group. Win = 1 point, loss = 0 (or 3/0 if you want soccer-style; or +0.5 for draws).
3. **Advancement** — Top K per group advance to bracket (or to a merged "winners pool" for a second round-robin).
4. **Finals bracket** — Single-elimination among advancing participants.

## Configurable

| Setting           | Range                      | Default  | Notes                                              |
| ----------------- | -------------------------- | -------- | -------------------------------------------------- |
| Group size N      | 3–8                        | 4        | Determines matches per participant                 |
| Top K per group   | 1–4                        | 2        | Drives bracket size                                |
| Scoring per match | win/loss / 3-1-0 / custom  | win/loss |                                                    |
| Tiebreaker (1st)  | head-to-head               | —        | Did A beat B directly?                             |
| Tiebreaker (2nd)  | point differential         | —        | Total points scored minus conceded                 |
| Tiebreaker (3rd)  | random / coin flip         | random   |                                                    |
| Bracket seeding   | group rank → cross-bracket | yes      | Avoid same-group rematches in early bracket rounds |

## Fairness invariants

- Every participant in a group plays every other in that group exactly once
- Group assignments published before round 1 starts (no mid-event resorting)
- Tiebreaker hierarchy is deterministic and documented before the event

## What it should NOT do

- **No partner rotation** — that's Jack & Jill
- **No panel judging within a match** — match outcomes are win/loss (or in a future variant, a single referee call)
- **No group reseeding mid-phase** — locks at phase start

## Real-world references

- League of Legends Worlds group stage
- Most esports group/playoff bracket events
- Round-robin chess tournaments

## Notes for implementation

- The group-assignment seeder is the trickiest piece. Snake draft from a seed list is a sensible default.
- Match scheduling within a group (which match first?) matters for tournament pacing; needs an explicit pairing order rule.
- Standings recompute after every match — easy on the API, but the UI needs careful re-render to avoid flashing.
