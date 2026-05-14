# Format Design Workflow — Desire-Driven Competition Modeling

A conversational design workflow for adding new competition formats. An AI agent interviews you, probes your assumptions, surfaces tradeoffs you didn't see, and produces a structured `desire.md` you can act on.

> **Internal tool first, product feature second.** This lives in the repo today and powers our format library expansion. The conversation patterns and templates here are the seed for the eventual organizer-facing format wizard.

---

## When to use it

| Situation                                                                                       | Use the workflow?            |
| ----------------------------------------------------------------------------------------------- | ---------------------------- |
| You want to add a new competition type and aren't sure if one of our existing formats covers it | ✅ Yes                       |
| Organizer feedback describes a flow we don't support                                            | ✅ Yes                       |
| You have a vague idea like "make it like X but with Y"                                          | ✅ Yes — perfect for this    |
| You already know exactly which existing format + config you need                                | ❌ Skip — just configure it  |
| You want a cosmetic UI variant of an existing format                                            | ❌ Skip — that's a UI ticket |

---

## How to invoke

In Claude Code:

```
/desire-a-format
```

This loads the `desire-a-format` skill which:

1. Greets you and asks for a free-form description of what you want
2. Reads the [predefined catalog](./predefined/) before responding
3. Asks **critical** follow-up questions — challenges your assumptions, probes for fairness gaps, surfaces tradeoffs
4. Tries to match your desire to an existing format with config; if not, drafts a request to implement a new one
5. Writes the agreed model to `formats/desires/desire-<date>-<slug>.md`
6. (If new format) writes `formats/requests/request-<date>-<slug>.md` ready for BMAD story creation

You can always interrupt, override, or correct the agent. It is meant to be **a critical peer**, not a yes-machine.

---

## The agent's role — explicitly

The agent's prompt directs it to:

- **Question, don't accept.** "Fair" and "fast" and "simple" need definitions. Push for them.
- **Find the tradeoff.** Every design choice has a cost. Make the user aware of what they're paying.
- **Catch unfairness.** Game-theory fairness is the platform's foundation. If the user's scheme has an exploit, surface it.
- **Refuse vague work.** If the model isn't clear enough to implement, say so and ask more questions instead of guessing.
- **Match before invent.** Always check the predefined catalog first. New formats are expensive.
- **Be candid.** No corporate hedging. "This won't work because X" is the right tone.

---

## Directory layout

```
formats/
├── README.md              ← you are here
├── predefined/            ← catalog of formats (implemented + planned)
│   ├── cypher-battles.md
│   ├── jack-and-jill.md
│   ├── group-rounds-1v1.md
│   ├── couples.md
│   └── hybrid-multi-phase.md
├── templates/
│   ├── desire.template.md       ← skeleton the agent fills in
│   └── format-request.template.md  ← request for new impl
├── desires/               ← agent-written outputs (committed for history)
└── requests/              ← new-format implementation requests
```

---

## After the conversation

The output `.md` is the source of truth for the decision. Two paths:

### Path A — Use an existing format with config

The desire doc captures the config. No code change needed; the organizer plugs the values into the existing format at runtime. The doc lives in `formats/desires/` as historical context for future similar requests.

### Path B — Implement a new format

The agent writes both:

- `formats/desires/desire-<slug>.md` — the agreed model
- `formats/requests/request-<slug>.md` — the structured implementation ticket

The request is the input to a normal BMAD flow:

```
/bmad-bmm-create-story   # turn the request into a story
/bmad-bmm-dev-story      # implement it against the format-sdk
```

The new format ships as `packages/formats/<slug>/`.

---

## Adding to the predefined catalog

When a new format ships, add a one-page summary to `formats/predefined/<slug>.md` using the template. This makes it available to future desire-driven matching.

---

## Conventions

- **One desire per conversation.** Don't try to design two formats in one session.
- **Always commit the desire.md**, even if no new format is implemented — it's a record of why we chose what we chose.
- **Date + slug in filenames** for chronological ordering: `desire-2026-05-14-jazz-battles.md`.
- **Prefer existing formats with config over new implementations**. The format SDK is intentionally configurable.
