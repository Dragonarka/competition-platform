---
slug: <kebab-case-name>
date: <YYYY-MM-DD>
parent_desire: desires/desire-<date>-<slug>.md
status: requested | story-created | in-development | shipped
estimated_complexity: S | M | L
target_epic: <epic-id-or-tbd>
---

# Format Implementation Request — <human-readable name>

A new competition format identified by the desire-driven design workflow. The parent `desire-*.md` captures the agreed model; this file is the structured ticket to implement it as a `packages/formats/<slug>/` module against the format SDK.

---

## Summary

<2-3 sentences. What format. Who needs it. Why we can't reuse an existing one.>

---

## Source desire

See [`../desires/desire-<date>-<slug>.md`](../desires/desire-<date>-<slug>.md) for the full conversation, tradeoffs accepted, and fairness audit.

---

## SDK surface to implement

| Format SDK type         | What to provide                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| `CompetitionFormat`     | Top-level format definition (manifest + state machine + scoring)   |
| `PhaseDefinition[]`     | The phase sequence with types and advancement criteria             |
| `CriterionDefinition[]` | Scoring criteria with types and aggregation rules                  |
| `ScoringSchema`         | What judges submit per participant per round                       |
| `ValidationResult`      | Format-specific validation (e.g., enough participants for pairing) |
| `JudgeGroupAssignment`  | How judges are grouped/assigned across phases                      |
| `TieBreakRule`          | Resolution when aggregated scores tie                              |
| `ComponentManifest`     | Optional UI surfaces (custom scoring UI, custom standings widget)  |

Reference: `packages/format-sdk/src/types/` for the full contracts.

---

## Acceptance criteria

The format ships when:

- [ ] `packages/formats/<slug>/` builds with the standard package build pipeline (`tsc` → `dist/`)
- [ ] Manifest exposes `CompetitionFormat` via `src/index.ts` and the registry can load it
- [ ] All `PhaseDefinition` transitions produce valid `CompetitionState` (verified by `validateFormat()`)
- [ ] Vitest covers: happy path, edge cases enumerated in the desire doc, and the format's fairness invariants
- [ ] At least one E2E spec in `tests/e2e/` exercises a full competition lifecycle in this format
- [ ] `formats/predefined/<slug>.md` is added so the desire-driven workflow can match it
- [ ] Update `_bmad-output/planning-artifacts/architecture.md` if this format introduces new domain types or constraints

---

## Open implementation questions

These came out of the desire conversation and need answers before code:

- [ ] <Specific design decision left to implementation>
- [ ] <Naming choice for new domain concept>
- [ ] <Integration question with existing platform module>

---

## Closest existing format

**Reference:** `packages/formats/<existing-slug>/`

**What we keep:**

- <Pattern X — same state machine shape>
- <Pattern Y — same scoring aggregation>

**What we change:**

- <Pattern Z — different pairing model>
- <Pattern W — different advancement rule>

---

## Suggested handoff to BMAD

```
/bmad-bmm-create-story    # creates story under target_epic from this request
/bmad-bmm-dev-story       # executes the story
```

The story should reference this file by path so the dev agent reads both the request and the parent desire.
