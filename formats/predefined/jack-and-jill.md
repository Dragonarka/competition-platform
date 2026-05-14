---
slug: jack-and-jill
human_name: Jack & Jill
status: planned
package: packages/formats/jack-and-jill/ (not yet created)
target_epic: TBD (post-MVP)
domain_origins: ['Partner dance', 'Swing', 'Salsa', 'Lindy hop', 'WCS']
---

# Jack & Jill

Random partner rotation. Each participant dances with multiple different partners across rounds; the platform tracks each individual's score independently across all their pairings. The "3 lives" elimination model is common.

## When to pick this

- Participants compete **as individuals but dance with assigned partners** (and partners rotate)
- You need to **score each individual independently** despite the pair-based performance
- Roles matter: leaders are paired with followers
- Imbalance is the rule, not the exception (more leaders than followers, or vice versa)

## Phases

1. **Preliminaries** — Random partner assignment per heat. Each individual scored 1–10 by panel.
2. **Lives accounting** — Individuals start with 3 lives; failing to meet the threshold per heat costs a life. Elimination at 0 lives.
3. **Finals** — Top survivors compete in a final heat with new pairings, ranked.

## What's hard about this format

- **Pairing fairness** — Random pairing across rounds must distribute "stronger" partners evenly across the field, otherwise individual scores become noisy estimators of skill
- **Role imbalance** — N leaders, M followers where N ≠ M. Need a rule: rotate by sitting out, double-pair, gender-neutral roles, etc.
- **Score normalization** — Different judges may anchor on different parts of the scale; rolling normalization may be needed if score distributions drift
- **Tracking individual scores across rotating partners** — Each individual's standing is the aggregate of their scores under different partner assignments

## Configurable (proposed)

| Setting        | Range                                | Default | Notes                                               |
| -------------- | ------------------------------------ | ------- | --------------------------------------------------- |
| Lives          | 1–5                                  | 3       | Per individual                                      |
| Rounds         | 2–5                                  | 3       | More rounds = better individual estimate, more time |
| Role split     | strict / open                        | strict  | "Open" allows any role                              |
| Imbalance rule | sit-out / double-pair / role-swap    | sit-out | What happens when N ≠ M                             |
| Aggregation    | mean of per-round / sum of per-round | mean    |                                                     |
| Tie-break      | head-to-head heat                    | rematch |                                                     |

## What it should NOT do

- **No fixed brackets** — the format is fundamentally about rotation
- **No team scoring** — individuals only, even though they dance with a partner

## Fairness invariants (proposed)

- Pairing algorithm must produce a distribution where, in expectation, every individual dances with partners of comparable average skill
- Per-round scoring is per-individual, not per-pair (no shared score)
- Lives accounting is transparent and audit-traceable

## Real-world references

Most West Coast Swing tournaments. Several Lindy hop events.

## Notes for implementation

This format is harder than Cypher Battles for two reasons:

1. **Pairing math** — naive random assignment can produce unfair clustering. May need a Latin square or balanced incomplete block design.
2. **Live state visualization** — judges/organizers need to see "who has how many lives" at any moment.
