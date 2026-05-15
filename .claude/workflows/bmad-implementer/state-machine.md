# State machine — what `bmad-implementer` understands

Authoritative reference for the BMAD story lifecycle as orchestrated by this skill. The orchestrator-guide.md treats this as ground truth.

---

## Epic states

```
backlog ──first-story-created──> in-progress ──all-stories-done──> done
```

- `backlog` — Epic exists in `_bmad-output/planning-artifacts/epics.md` but no story file has been created.
- `in-progress` — At least one story has reached `ready-for-dev`. Auto-transition by `bmad-create-story`.
- `done` — All stories listed under this epic are `done`. **Manual transition** (the orchestrator marks it after the last story closes).

Epics with `epic-N-retrospective: optional` or `done` markers are tracked but don't gate the implementer's work.

---

## Story states

```
backlog ──create-story──> ready-for-dev ──dev-story──> in-progress ──dev-story-completes──> review
                                                                                              │
                                                                                              ├── code-review approves ──> done
                                                                                              │
                                                                                              └── code-review finds blockers ──> rework-N
                                                                                                                                  │
                                                                                                                                  └── dev-story (rework=true) ──> review
```

### State definitions

| State                                                                           | Meaning                                                 | Owned by                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `backlog`                                                                       | Story listed in epic doc, no story file exists yet      | scoping                                               |
| `ready-for-dev`                                                                 | Story file (`<id>.md`) created with AC + tech notes     | `bmad-create-story`                                   |
| `in-progress`                                                                   | Dev agent actively writing code                         | `bmad-dev-story` (transient)                          |
| `review`                                                                        | Code written + CI passing locally, awaiting code review | `bmad-dev-story` final → handed to `bmad-code-review` |
| `done`                                                                          | Code reviewed + approved + committed + pushed           | `bmad-code-review` final                              |
| `rework-N` (not stored in sprint-status, tracked in-session by the implementer) | Code review found blockers; dev needs another pass      | orchestrator counter                                  |

### Transitions driven by each skill

| Transition                    | Driver                         | Side effects                                                                                                     |
| ----------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `backlog → ready-for-dev`     | `bmad-create-story`            | Creates `<story-id>.md` in `_bmad-output/implementation-artifacts/`. Epic flips to `in-progress` if first story. |
| `ready-for-dev → in-progress` | `bmad-dev-story` (at start)    | Story file `Status: in-progress`                                                                                 |
| `in-progress → review`        | `bmad-dev-story` (at end)      | Tasks checked, File List filled, code committed (subagent locally — orchestrator pushes), Status: review         |
| `review → done`               | `bmad-code-review` (approve)   | Story file Code Review section appended; Status: done                                                            |
| `review → rework`             | `bmad-code-review` (blockers)  | Story file Code Review section lists blockers; Status stays at review                                            |
| `rework → review`             | `bmad-dev-story` (rework=true) | Fix-only changes; no new scope                                                                                   |

---

## HALT conditions

The dev-story skill HALTs on these. The orchestrator surfaces them, does **not** auto-resolve.

| Category         | Trigger                                                              | What the user must do                                           |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `new-deps`       | Story requires a new runtime dependency not pre-approved             | Approve the dep or rescope the story                            |
| `ambiguous-ac`   | Acceptance Criteria are ambiguous mid-implementation                 | Clarify the AC (edit story file, then re-invoke)                |
| `dev-failures`   | 3 consecutive subtask failures                                       | Diagnose root cause (often architecture mismatch)               |
| `ci-failures`    | `pnpm turbo run lint typecheck test build` fails after dev completes | Fix the underlying issue manually or via `/bmad-correct-course` |
| `missing-config` | Required env var or config file absent                               | Provide the missing config                                      |

Plus the orchestrator's own:

| Category             | Trigger                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `max-rework`         | Code review found new blockers after the configured rework cap                |
| `state-corruption`   | Subagent claimed a status that doesn't match sprint-status.yaml after re-read |
| `dirty-tree`         | `git status` not clean at session start                                       |
| `wrong-branch`       | Not on `main` (and no override flag)                                          |
| `bmad-not-installed` | `.claude/skills/bmad-create-story/SKILL.md` missing                           |

---

## Files the implementer reads

| Path                                                       | When                           | What it tells us                                              |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | start + after every transition | Current state of every epic + story                           |
| `_bmad-output/implementation-artifacts/<story-id>.md`      | per-story start                | AC, tech notes, prior code-review findings (if rework)        |
| `_bmad-output/planning-artifacts/epics.md`                 | per-epic start (if any)        | Epic scope + story list                                       |
| `_bmad/bmm/config.yaml`                                    | session start                  | Resolves `implementation_artifacts` and `output_folder` paths |
| `CLAUDE.md`                                                | session start                  | Project rules + CI gate command                               |
| `.claude/skills/bmad-create-story/SKILL.md`                | pre-flight                     | Sanity check the BMAD install                                 |

The implementer never reads project source code itself — the dev-story subagent handles that with its own fresh context.

---

## Files the implementer writes

| Path                                                           | What                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `.claude/workflows/bmad-implementer/sessions/session-<ISO>.md` | Session log (start, append per transition, finalize at end)                                     |
| `_bmad-output/implementation-artifacts/sprint-status.yaml`     | Defensive only — if a subagent's status update was lost. The subagent owns this file primarily. |

Git commits between stories: orchestrator's `git commit` + `git push` (per-story by default, batched if `--batch-commits`).

---

## What the implementer never touches

| Path                                                           | Why                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `_bmad/` (entire vendor dir)                                   | Touching this breaks `npx bmad-method install` on next upgrade. |
| Project source code (`apps/`, `packages/`)                     | That's the dev-story subagent's job, in its own context.        |
| `.claude/commands/`, `.claude/skills/` (besides its own files) | Other skills are sovereign.                                     |
| External services (Fly, Vercel, Neon, Upstash, Clerk)          | Production deploys are explicit human gates.                    |

---

## Cross-references

- `orchestrator-guide.md` — the persona + loop logic that uses this state machine
- BMAD-method docs — the underlying workflow definitions in `.claude/skills/bmad-*/SKILL.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — the live state
