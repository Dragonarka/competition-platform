---
slug: <kebab-case-name>
date: <YYYY-MM-DD>
author: <username>
status: drafting | agreed | implemented | rejected
path: existing-with-config | new-format
matched_format: <predefined-format-slug | null>
---

# Desire — <human-readable name>

## TL;DR

<2-3 sentences. What kind of competition. Who runs it. What makes it different from what we have.>

## Origin story

<Where did this desire come from? Real organizer ask? Personal hunch? Market gap? Pull from the conversation transcript if useful.>

---

## What the user wants (their words, paraphrased)

> <Plain-language description, before any agent critique. Captures the desire raw.>

---

## Critical interrogation (the conversation)

### Ambiguity surfaced

| Term the user used | What they actually meant                                | Why it mattered                             |
| ------------------ | ------------------------------------------------------- | ------------------------------------------- |
| "Fair"             | <e.g., equal weight per judge, regardless of expertise> | <implication on scoring math>               |
| "Fast"             | <e.g., <30s per scoring decision>                       | <implies UI design constraint>              |
| "Simple"           | <e.g., judges only enter one number>                    | <single-criterion vs multi-criterion model> |

### Assumptions challenged

- **<User said X.>** Counter: <agent's challenge>. Resolved: <how the user revised, or stuck to>.
- **<User said Y.>** Counter: <agent's challenge>. Resolved: <how>.

### Tradeoffs accepted explicitly

| Want A                   | Conflicts with want B     | User chose                           | Cost                                                   |
| ------------------------ | ------------------------- | ------------------------------------ | ------------------------------------------------------ |
| <e.g., anonymous voting> | <transparent audit trail> | <e.g., anonymous, with hashed audit> | <judge identity is recoverable post-event if disputed> |

### Fairness audit

| Concern                                              | How this format addresses it                              |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Judge collusion                                      | <e.g., independent score submission, no cross-visibility> |
| Late-round bias (judges get tougher as they fatigue) | <e.g., randomized order, or rolling normalization>        |
| Tied results                                         | <tie-break rule>                                          |
| Drop-outs                                            | <withdrawal handling>                                     |
| Cheating / score manipulation                        | <append-only audit trail, override compensating events>   |

---

## Agreed model

### Format shape

- **Phases:** <e.g., single phase | group rounds → bracket | qualifying → finals>
- **Participants:** <solo | pairs | teams of N>
- **Pairing model:** <e.g., random per round, fixed bracket, swiss>
- **Judges:** <panel of N | solo organizer | crowd vote>
- **Scoring criteria:** <list> — <how each is scored: 1-10, yes/no, ranking, etc.>
- **Aggregation:** <e.g., mean, weighted mean, trimmed mean, majority vote>
- **Advancement:** <e.g., top-K, threshold, knockout bracket>
- **Tie-break:** <rule>
- **Withdrawal/rescue:** <policy>

### State machine (sketch)

```
<idle> → <phase-1> → <intermission?> → <phase-2> → <finished>
```

### Edge cases the model handles

- <Odd number of participants>
- <Judge drops out mid-round>
- <Score override after submission>
- <Phase aborted by organizer>

### What the model deliberately does NOT support

- <e.g., live audience voting — orthogonal feature, not in scope here>

---

## Path forward

### Selected: <existing-with-config | new-format>

#### If existing-with-config

- **Format module:** `packages/formats/<slug>/`
- **Configuration:**
  ```typescript
  // The exact config to instantiate this format
  {
    judgeCount: ...,
    aggregation: ...,
    // ...
  }
  ```
- **Caveats:** <anything the organizer needs to know at config time>

#### If new-format

- **Implementation request:** `formats/requests/request-<slug>.md`
- **Estimated complexity:** <S | M | L> — <one sentence why>
- **Closest reference format:** <existing slug> — <what differs>
- **Hard requirements that block reuse:** <list>

---

## Open questions / parking lot

- <Things the conversation surfaced but didn't resolve>
- <Things to revisit post-implementation>

---

## Approval

| Reviewer   | Date         | Outcome   |
| ---------- | ------------ | --------- | ------- | --------- |
| <username> | <YYYY-MM-DD> | <approved | revised | rejected> |
