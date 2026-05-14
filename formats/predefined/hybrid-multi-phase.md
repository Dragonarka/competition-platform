---
slug: hybrid-multi-phase
human_name: Hybrid Multi-Phase
status: meta-format (composition pattern, not a single module)
package: orchestrated via FormatComposer (planned)
target_epic: TBD (post-MVP)
domain_origins:
  [
    'Multi-discipline events',
    'Festivals with multiple categories',
    'Real-world Colombian dance events',
  ]
---

# Hybrid Multi-Phase

Not a single competition format — a **composition pattern** that chains multiple format modules end-to-end within one event. Phase 1 uses Format A; phase 2 uses Format B; the advancing pool from A becomes the input pool for B.

## When to pick this

- Your event is **not modelable as a single format**
- Different stages of the same event need fundamentally different mechanics (e.g., Jack & Jill qualifier → Couples finals with the winners pairing into self-selected duos)
- You need composition, not just configuration

## How it works (proposed design)

A `HybridFormat` manifest declares an array of phase modules:

```typescript
const hybridFormat: CompetitionFormat = {
  name: 'Festival 2026',
  phases: [
    { phase: 'cypher', module: 'cypher-battles', config: { ... } },
    { phase: 'battles', module: 'cypher-battles', config: { ... } },
    { phase: 'finals', module: 'jack-and-jill', config: { ... } },
  ],
  advancement: [
    { from: 'cypher', to: 'battles', rule: 'top-8' },
    { from: 'battles', to: 'finals', rule: 'top-4' },
  ],
};
```

Each phase is a real format module under `packages/formats/`; the hybrid orchestrator just sequences them and pipes participant advancement through.

## Where the complexity lives

| Complexity                          | Why                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Entity type changes between phases  | Jack & Jill produces individual rankings, but Couples needs paired entities. Need transition rules.               |
| Scoring scales differ across phases | Phase 1 scores aren't directly comparable to phase 2 scores. Aggregate ranking must be hierarchical, not summed.  |
| Withdrawal mid-event                | Withdrawing in phase 2 doesn't retroactively change phase 1 standings, but the public scoreboard must reflect it. |
| Format-specific judge groups        | Phase 1 might use 3 judges, phase 2 might use 5. Need to support changing the judge pool between phases.          |
| State machine                       | The platform's general state machine must support arbitrary phase sequences, not just `cypher → battles`.         |

## Configurable

The whole point is configuration — pick which formats, in what order, with what advancement rules between them.

## What this should NOT do

- **Not a one-size-fits-all "Festival" format** — every hybrid is custom-composed
- **Not a way to avoid implementing individual format modules** — you need both phases' formats to exist first

## Real-world references

Most Colombian dance festivals run hybrid events: solo qualifying → couples bracket. International salsa congresses run similar patterns.

## Notes for implementation

This is **the most architecturally important post-MVP feature**. It validates the format SDK's promise of composability. Until we ship this, the platform is a single-format runner, not a true format engine.

Suggested first hybrid to implement, once underlying formats exist:
**`cypher-battles` (qualifier) → `jack-and-jill` (finals)**
because we already have one and the other is the most-requested missing format.
