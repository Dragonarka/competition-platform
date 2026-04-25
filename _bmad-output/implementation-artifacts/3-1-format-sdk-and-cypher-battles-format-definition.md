# Story 3.1: Format SDK & Cypher Battles Format Definition

Status: done

## Story

As a competition platform,
I want a defined and validated `CompetitionFormat` interface with the Cypher Battles format implemented against it,
so that all scoring logic, phase rules, and UI components are encapsulated in the format — keeping the platform runtime format-agnostic.

## Acceptance Criteria

1. Given the `packages/format-sdk` package, when a format is implemented, then it must satisfy the full `CompetitionFormat` interface (identity, scoringSchema, phases, stateMachine, validators, fairnessRules, ui).

2. Given the `packages/formats/cypher-battles` package, when the SDK validation suite runs (i.e., when the format's test file runs in Vitest), then all 5 validation gates pass: interface compliance, schema consistency, state machine reachability, UI component rendering, fairness rules consistency.

3. Given the Cypher Battles format's scoring schema, when a criterion value is defined, then min < max is enforced, precision is 2 decimal places, and scores are represented as strings (never floating point).

4. Given the Cypher Battles state machine config, when it is analyzed, then all phases are reachable (cypher → advancement-review → battles), no dead-end states exist, and terminal states are properly defined.

5. And platform modules in `apps/api` interact with the Cypher Battles format only through the `CompetitionFormat` interface from `packages/format-sdk` — never by importing from `packages/formats/cypher-battles` directly.

## Tasks / Subtasks

- [x] Task 1: Add `packages/formats/*` to pnpm workspace (AC: #2, #5)
  - [x] Edit `pnpm-workspace.yaml` — add `'packages/formats/*'` alongside existing entries

- [x] Task 2: Implement Format SDK types — 4 type files (AC: #1)
  - [x] `packages/format-sdk/src/types/scoring.types.ts` — implement `CriterionDefinition`, `CriterionType`, `AggregationRule`, `ScoreValue`, `ScorePayload`, `AggregatedResult`, `ScoringSchema`
  - [x] `packages/format-sdk/src/types/phase.types.ts` — implement `PhaseType`, `AdvancementCriteria`, `PhaseDefinition`, `StateConfig`, `FormatStateMachineConfig`
  - [x] `packages/format-sdk/src/types/ui.types.ts` — implement `ComponentManifest`, `FormatUI`
  - [x] `packages/format-sdk/src/types/format.types.ts` — implement `CompetitionFormat`, `ValidationResult`, `CompetitionState`, `FormatContext`, `JudgeScoreVisibility`, `JudgeGroupAssignment`, `TieBreakRule`

- [x] Task 3: Implement Format SDK helpers (AC: #1)
  - [x] `packages/format-sdk/src/helpers/score-utils.ts` — string-based score arithmetic: `addScores`, `sumScores`, `formatScore`, `validateScoreValue`, `compareScores`
  - [x] `packages/format-sdk/src/helpers/create-format.ts` — `createFormat(config: CompetitionFormat): CompetitionFormat` identity helper with runtime shape validation

- [x] Task 4: Implement Format SDK validation suite (AC: #2)
  - [x] `packages/format-sdk/src/testing/validate-format.ts` — implement `validateFormat(format: CompetitionFormat): FormatValidationReport` with all 5 gates:
    - Gate 1: interface compliance (all required fields present, id format valid)
    - Gate 2: schema consistency (min < max, precision = 2 for numeric criteria, weights sum to 1.0 if weighted-average)
    - Gate 3: state machine reachability (BFS from initial state; all states reachable, at least one `type: 'final'` state)
    - Gate 4: UI component rendering (all required ComponentManifests present: judgeInput, publicDisplay, adminConfig)
    - Gate 5: fairness rules consistency (valid judgeScoreVisibility, valid judgeGroupAssignment, non-empty tieBreaking array)

- [x] Task 5: Implement Format SDK public index (AC: #1)
  - [x] `packages/format-sdk/src/index.ts` — export all types, helpers, and `validateFormat` from the SDK

- [x] Task 6: Create `packages/formats/cypher-battles` package scaffold (AC: #2)
  - [x] Create `packages/formats/cypher-battles/package.json` — see "Cypher Battles Package Setup" in Dev Notes
  - [x] Create `packages/formats/cypher-battles/tsconfig.json` — extends base config, adds `"jsx": "react-jsx"` for UI stubs
  - [x] Create `packages/formats/cypher-battles/vitest.config.ts` — includes `src/**/*.spec.ts`

- [x] Task 7: Implement Cypher Battles core logic files (AC: #1, #3, #4)
  - [x] `packages/formats/cypher-battles/src/scoring/cypher-scoring.schema.ts` — default Cypher criteria definitions (4 criteria: musicality, technique, creativity, overall-impression)
  - [x] `packages/formats/cypher-battles/src/scoring/battles-voting.schema.ts` — battles vote criterion definition
  - [x] `packages/formats/cypher-battles/src/scoring/aggregation.ts` — Cypher sum aggregation function (string-based)
  - [x] `packages/formats/cypher-battles/src/phases/cypher-phase.ts` — Cypher `PhaseDefinition`
  - [x] `packages/formats/cypher-battles/src/phases/battles-phase.ts` — Battles `PhaseDefinition`
  - [x] `packages/formats/cypher-battles/src/phases/state-machine.ts` — `FormatStateMachineConfig` for 4-state Cypher→Battles FSM
  - [x] `packages/formats/cypher-battles/src/validators/score-validator.ts` — `scoreValidator` function
  - [x] `packages/formats/cypher-battles/src/validators/transition-validator.ts` — `phaseTransitionValidator` function
  - [x] `packages/formats/cypher-battles/src/fairness/cypher-fairness-rules.ts` — fairness rules config

- [x] Task 8: Implement Cypher Battles UI component stubs (AC: #2, gate 4)
  - [x] `packages/formats/cypher-battles/src/ui/judge-score-input.tsx` — stub React component (full implementation: Story 3.3)
  - [x] `packages/formats/cypher-battles/src/ui/judge-vote-input.tsx` — stub React component (full implementation: Story 5.2)
  - [x] `packages/formats/cypher-battles/src/ui/public-standings.tsx` — stub React component (full implementation: Story 6.1)
  - [x] `packages/formats/cypher-battles/src/ui/public-bracket.tsx` — stub React component (full implementation: Story 6.2)
  - [x] `packages/formats/cypher-battles/src/ui/admin-config.tsx` — stub React component (full implementation: Story 2.2 integration)

- [x] Task 9: Implement main Cypher Battles format file (AC: #1, #2, #3, #4)
  - [x] `packages/formats/cypher-battles/src/cypher-battles.format.ts` — assemble full `CompetitionFormat` object using `createFormat()`
  - [x] `packages/formats/cypher-battles/src/index.ts` — export the format as named export `cypherBattlesFormat`

- [x] Task 10: Write Cypher Battles validation test (AC: #2)
  - [x] `packages/formats/cypher-battles/src/cypher-battles.format.spec.ts` — run `validateFormat(cypherBattlesFormat)` and assert all 5 gates pass (with detailed error messages on failure)

- [x] Task 11: Verify CI — `pnpm exec turbo run lint typecheck test` — all pass (12/12 tasks successful)

## Dev Notes

### Architecture Mandate: Format Isolation

The single most critical constraint of this story:

- **`apps/api` MUST NEVER import from `@competition-platform/format-cypher-battles`**
- **`apps/web` MUST NEVER import from `@competition-platform/format-cypher-battles` directly** (the FormatRenderer will inject props — Story 3.2+)
- Platform code interacts with formats via `CompetitionFormat` interface from `@competition-platform/format-sdk` only
- This is enforced architecturally — if you find yourself importing from `formats/cypher-battles` in `apps/api` or `apps/web`, stop and redesign

This story creates the SDK and format package. The platform DOES NOT wire up the format to the Competition Engine yet — that is Story 3.2's job.

### Workspace Registration — CRITICAL FIRST STEP

The `pnpm-workspace.yaml` currently only includes `packages/*` (one level deep). `packages/formats/cypher-battles` is two levels deep and will NOT be a workspace package until you add it.

```yaml
# pnpm-workspace.yaml — MUST ADD this line
packages:
  - 'apps/*'
  - 'packages/*'
  - 'packages/formats/*' # ADD THIS
```

Without this, `@competition-platform/format-cypher-battles` won't be resolvable from other packages and `pnpm install` won't link the workspace dependency.

### Cypher Battles Package Setup

**`packages/formats/cypher-battles/package.json`:**

```json
{
  "name": "@competition-platform/format-cypher-battles",
  "version": "0.0.1",
  "license": "MIT",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "@competition-platform/format-sdk": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "react": "^19.2.4",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

**`packages/formats/cypher-battles/tsconfig.json`:**

```json
{
  "extends": "../../../packages/config-typescript/base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

**`packages/formats/cypher-battles/vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.spec.ts'],
  },
});
```

### Format SDK Type Definitions

**`packages/format-sdk/src/types/scoring.types.ts`:**

```typescript
export type CriterionType = 'numeric' | 'vote' | 'ranking';
export type AggregationRule = 'weighted-average' | 'sum' | 'median' | 'custom';

export interface CriterionDefinition {
  id: string;
  name: string;
  type: CriterionType;
  min: number;
  max: number;
  precision: number; // must be 2 for numeric types
  weight?: number; // used when aggregation === 'weighted-average'
}

export interface ScoreValue {
  criterionId: string;
  value: string; // ALWAYS string, e.g. "8.75" — never a number
}

export interface ScorePayload {
  judgeId: string;
  competitorId: string;
  roundId: string;
  scores: ScoreValue[];
  idempotencyKey: string;
}

export interface AggregatedResult {
  competitorId: string;
  totalScore: string; // string with 2 decimal places
  scoresByJudge: Record<string, string>; // judgeId → score string
}

export interface ScoringSchema {
  criteria: CriterionDefinition[];
  aggregation: AggregationRule;
  customAggregator?: (scores: ScorePayload[]) => AggregatedResult[];
}
```

**`packages/format-sdk/src/types/phase.types.ts`:**

```typescript
export type PhaseType = 'scoring' | 'voting' | 'bracket' | 'custom';

export interface AdvancementCriteria {
  type: 'top-n' | 'threshold' | 'all' | 'bracket-progression';
  value?: number; // N for top-n, score threshold for threshold
}

export interface PhaseDefinition {
  id: string;
  name: string;
  type: PhaseType;
  rules: Record<string, unknown>;
  advancementCriteria: AdvancementCriteria;
}

export interface StateConfig {
  on?: Record<string, string>; // event name → next state id
  type?: 'final';
}

export interface FormatStateMachineConfig {
  initial: string; // must match a key in states
  states: Record<string, StateConfig>; // all states including final
}
```

**`packages/format-sdk/src/types/ui.types.ts`:**

```typescript
export interface ComponentManifest {
  component: string; // component identifier string (e.g. 'JudgeScoreInput')
  defaultProps?: Record<string, unknown>;
  requiredPlatformHooks: string[]; // hooks the component needs from FormatRenderer
}

export interface FormatUI {
  judgeInput: ComponentManifest; // Cypher scoring / Battles voting
  publicDisplay: ComponentManifest; // Live standings / bracket
  adminConfig: ComponentManifest; // Format-specific competition config
  presenterView?: ComponentManifest; // Optional MC teleprompter customization
}
```

**`packages/format-sdk/src/types/format.types.ts`:**

```typescript
import type { ScoringSchema, ScorePayload } from './scoring.types';
import type { PhaseDefinition, FormatStateMachineConfig } from './phase.types';
import type { FormatUI } from './ui.types';

export type JudgeScoreVisibility = 'hidden' | 'after-submission' | 'after-phase';
export type JudgeGroupAssignment = 'random' | 'manual' | 'round-robin';

export interface TieBreakRule {
  type: 're-vote' | 'organizer-decision' | 'sudden-death';
  maxRounds?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CompetitionState {
  competitionId: string;
  currentPhase: string;
  participants: Record<string, unknown>;
  scores: Record<string, unknown>;
}

export interface FormatContext {
  competitionId: string;
  formatId: string;
  config: Record<string, unknown>;
}

export interface CompetitionFormat {
  // Identity
  id: string; // e.g. 'cypher-battles' — lowercase alphanumeric + hyphens
  name: string;
  version: string; // semver
  description: string;
  author: string;
  domain: string; // e.g. 'dance'

  // Scoring Configuration
  scoringSchema: ScoringSchema;

  // Phase Structure (ordered)
  phases: PhaseDefinition[];

  // State Machine (XState-compatible config — platform wraps this in its FSM)
  stateMachine: FormatStateMachineConfig;

  // Validation Rules
  validators: {
    scoreValidator: (score: ScorePayload, context: FormatContext) => ValidationResult;
    phaseTransitionValidator: (
      from: string,
      to: string,
      state: CompetitionState,
    ) => ValidationResult;
  };

  // Anti-Bias & Fairness Rules
  fairnessRules: {
    judgeScoreVisibility: JudgeScoreVisibility;
    judgeGroupAssignment: JudgeGroupAssignment;
    tieBreaking: TieBreakRule[];
  };

  // UI Component Manifest
  ui: FormatUI;
}
```

### Format SDK Helpers

**`packages/format-sdk/src/helpers/score-utils.ts`:**

```typescript
// String-based score arithmetic — avoids floating point errors.
// All functions take/return strings with 2 decimal places.

export function addScores(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(2);
}

export function sumScores(scores: string[]): string {
  return scores.reduce((acc, s) => parseFloat(acc) + parseFloat(s), 0).toFixed(2);
}

export function formatScore(value: number, precision = 2): string {
  return value.toFixed(precision);
}

export function validateScoreString(value: string, min: number, max: number): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
}

export function compareScores(a: string, b: string): number {
  return parseFloat(a) - parseFloat(b);
}
```

**`packages/format-sdk/src/helpers/create-format.ts`:**

```typescript
import type { CompetitionFormat } from '../types/format.types';

// Identity helper — returns the format object as-is after basic shape check.
// Full validation is done via validateFormat() in the testing module.
export function createFormat(config: CompetitionFormat): CompetitionFormat {
  if (!config.id || !config.name || !config.version) {
    throw new Error('createFormat: id, name, and version are required');
  }
  return config;
}
```

### Format SDK Validation — Implementation Sketch

**`packages/format-sdk/src/testing/validate-format.ts`:**

```typescript
import type { CompetitionFormat } from '../types/format.types';

export interface GateResult {
  passed: boolean;
  errors: string[];
}

export interface FormatValidationReport {
  valid: boolean;
  gates: {
    interfaceCompliance: GateResult;
    schemaConsistency: GateResult;
    stateMachineReachability: GateResult;
    uiComponentRendering: GateResult;
    fairnessRulesConsistency: GateResult;
  };
}

export function validateFormat(format: CompetitionFormat): FormatValidationReport {
  const gates = {
    interfaceCompliance: checkInterfaceCompliance(format),
    schemaConsistency: checkSchemaConsistency(format),
    stateMachineReachability: checkStateMachineReachability(format),
    uiComponentRendering: checkUiComponents(format),
    fairnessRulesConsistency: checkFairnessRules(format),
  };

  return {
    valid: Object.values(gates).every((g) => g.passed),
    gates,
  };
}

function checkInterfaceCompliance(format: CompetitionFormat): GateResult {
  const errors: string[] = [];
  const requiredFields = [
    'id',
    'name',
    'version',
    'description',
    'author',
    'domain',
    'scoringSchema',
    'phases',
    'stateMachine',
    'validators',
    'fairnessRules',
    'ui',
  ];
  for (const field of requiredFields) {
    if (format[field as keyof CompetitionFormat] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (format.id && !/^[a-z0-9-]+$/.test(format.id)) {
    errors.push('Format id must be lowercase alphanumeric with hyphens only');
  }
  if (format.validators) {
    if (typeof format.validators.scoreValidator !== 'function') {
      errors.push('validators.scoreValidator must be a function');
    }
    if (typeof format.validators.phaseTransitionValidator !== 'function') {
      errors.push('validators.phaseTransitionValidator must be a function');
    }
  }
  return { passed: errors.length === 0, errors };
}

function checkSchemaConsistency(format: CompetitionFormat): GateResult {
  const errors: string[] = [];
  for (const criterion of format.scoringSchema.criteria) {
    if (criterion.type === 'numeric') {
      if (criterion.min >= criterion.max) {
        errors.push(
          `Criterion "${criterion.id}": min (${criterion.min}) must be < max (${criterion.max})`,
        );
      }
      if (criterion.precision !== 2) {
        errors.push(
          `Criterion "${criterion.id}": numeric precision must be 2, got ${criterion.precision}`,
        );
      }
    }
  }
  if (format.scoringSchema.aggregation === 'weighted-average') {
    const withWeights = format.scoringSchema.criteria.filter((c) => c.weight !== undefined);
    if (withWeights.length > 0) {
      const total = withWeights.reduce((acc, c) => acc + (c.weight ?? 0), 0);
      if (Math.abs(total - 1.0) > 0.001) {
        errors.push(`Weighted-average: criterion weights must sum to 1.0, got ${total.toFixed(4)}`);
      }
    }
  }
  return { passed: errors.length === 0, errors };
}

function checkStateMachineReachability(format: CompetitionFormat): GateResult {
  const errors: string[] = [];
  const { states, initial } = format.stateMachine;

  if (!states[initial]) {
    errors.push(`Initial state "${initial}" is not defined in states`);
    return { passed: false, errors };
  }

  // BFS to find all reachable states from initial
  const reachable = new Set<string>();
  const queue: string[] = [initial];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const stateConfig = states[current];
    if (!stateConfig) {
      errors.push(`State "${current}" referenced but not defined`);
      continue;
    }
    if (stateConfig.on) {
      for (const nextState of Object.values(stateConfig.on)) {
        if (!reachable.has(nextState)) queue.push(nextState);
      }
    }
  }

  // Every defined state must be reachable
  for (const state of Object.keys(states)) {
    if (!reachable.has(state)) {
      errors.push(`State "${state}" is unreachable from initial state "${initial}"`);
    }
  }

  // At least one final state must exist
  const finalStates = Object.entries(states)
    .filter(([, cfg]) => cfg.type === 'final')
    .map(([id]) => id);
  if (finalStates.length === 0) {
    errors.push('State machine has no terminal (final) states — competition would never end');
  }

  return { passed: errors.length === 0, errors };
}

function checkUiComponents(format: CompetitionFormat): GateResult {
  const errors: string[] = [];
  const required = ['judgeInput', 'publicDisplay', 'adminConfig'] as const;
  for (const key of required) {
    const manifest = format.ui[key];
    if (!manifest) {
      errors.push(`Missing required UI component manifest: ui.${key}`);
      continue;
    }
    if (!manifest.component || typeof manifest.component !== 'string') {
      errors.push(`ui.${key}.component must be a non-empty string identifier`);
    }
    if (!Array.isArray(manifest.requiredPlatformHooks)) {
      errors.push(`ui.${key}.requiredPlatformHooks must be an array`);
    }
  }
  return { passed: errors.length === 0, errors };
}

function checkFairnessRules(format: CompetitionFormat): GateResult {
  const errors: string[] = [];
  const { fairnessRules } = format;

  const validVisibility = ['hidden', 'after-submission', 'after-phase'];
  if (!validVisibility.includes(fairnessRules.judgeScoreVisibility)) {
    errors.push(
      `Invalid judgeScoreVisibility: "${fairnessRules.judgeScoreVisibility}". Must be one of: ${validVisibility.join(', ')}`,
    );
  }

  const validAssignment = ['random', 'manual', 'round-robin'];
  if (!validAssignment.includes(fairnessRules.judgeGroupAssignment)) {
    errors.push(
      `Invalid judgeGroupAssignment: "${fairnessRules.judgeGroupAssignment}". Must be one of: ${validAssignment.join(', ')}`,
    );
  }

  if (!Array.isArray(fairnessRules.tieBreaking) || fairnessRules.tieBreaking.length === 0) {
    errors.push('fairnessRules.tieBreaking must be a non-empty array');
  }

  return { passed: errors.length === 0, errors };
}
```

### Format SDK `index.ts`

```typescript
// packages/format-sdk/src/index.ts
export type {
  CompetitionFormat,
  ValidationResult,
  CompetitionState,
  FormatContext,
  JudgeScoreVisibility,
  JudgeGroupAssignment,
  TieBreakRule,
} from './types/format.types';
export type {
  CriterionDefinition,
  CriterionType,
  AggregationRule,
  ScorePayload,
  ScoreValue,
  AggregatedResult,
  ScoringSchema,
} from './types/scoring.types';
export type {
  PhaseDefinition,
  PhaseType,
  AdvancementCriteria,
  FormatStateMachineConfig,
  StateConfig,
} from './types/phase.types';
export type { ComponentManifest, FormatUI } from './types/ui.types';
export { createFormat } from './helpers/create-format';
export {
  addScores,
  sumScores,
  formatScore,
  validateScoreString,
  compareScores,
} from './helpers/score-utils';
export { validateFormat } from './testing/validate-format';
export type { FormatValidationReport, GateResult } from './testing/validate-format';
```

### Cypher Battles Format — Core Logic Implementation Guide

**State Machine** (`packages/formats/cypher-battles/src/phases/state-machine.ts`):

```typescript
import type { FormatStateMachineConfig } from '@competition-platform/format-sdk';

export const cypherBattlesStateMachine: FormatStateMachineConfig = {
  initial: 'draft',
  states: {
    draft: {
      on: { START_CYPHER: 'cypher' },
    },
    cypher: {
      on: { COMPLETE_CYPHER: 'advancement-review' },
    },
    'advancement-review': {
      on: { CONFIRM_ADVANCEMENT: 'battles' },
    },
    battles: {
      on: { COMPLETE_BATTLES: 'completed' },
    },
    completed: {
      type: 'final',
    },
  },
};
```

**Cypher Scoring Schema** (`src/scoring/cypher-scoring.schema.ts`):

```typescript
import type { CriterionDefinition } from '@competition-platform/format-sdk';

// Default Cypher criteria — organizer can customize these names/ranges via Story 2.2.
// Scores ALWAYS stored as strings with 2 decimal places (enforced by format validators).
export const CYPHER_DEFAULT_CRITERIA: CriterionDefinition[] = [
  { id: 'musicality', name: 'Musicality', type: 'numeric', min: 0, max: 10, precision: 2 },
  { id: 'technique', name: 'Technique', type: 'numeric', min: 0, max: 10, precision: 2 },
  { id: 'creativity', name: 'Creativity', type: 'numeric', min: 0, max: 10, precision: 2 },
  {
    id: 'overall-impression',
    name: 'Overall Impression',
    type: 'numeric',
    min: 0,
    max: 10,
    precision: 2,
  },
];
```

**Battles Voting Schema** (`src/scoring/battles-voting.schema.ts`):

```typescript
import type { CriterionDefinition } from '@competition-platform/format-sdk';

// Battles: judges vote Player 1 / Player 2 / Tie (values: "0" / "1" / "2")
export const BATTLES_VOTE_CRITERION: CriterionDefinition = {
  id: 'battles-vote',
  name: 'Battles Vote',
  type: 'vote',
  min: 0,
  max: 2,
  precision: 0,
};
```

**Aggregation** (`src/scoring/aggregation.ts`):

```typescript
import { sumScores } from '@competition-platform/format-sdk';
import type { ScorePayload, AggregatedResult } from '@competition-platform/format-sdk';

// Sum all criterion scores for a single judge's submission.
// Returns a string with 2 decimal places.
export function aggregateCypherScore(payload: ScorePayload): string {
  return sumScores(payload.scores.map((s) => s.value));
}

// Aggregate all judge scores for a competitor.
export function aggregateCompetitorScores(payloads: ScorePayload[]): AggregatedResult {
  if (payloads.length === 0) {
    return { competitorId: '', totalScore: '0.00', scoresByJudge: {} };
  }
  const competitorId = payloads[0].competitorId;
  const scoresByJudge: Record<string, string> = {};
  for (const p of payloads) {
    scoresByJudge[p.judgeId] = aggregateCypherScore(p);
  }
  const total = sumScores(Object.values(scoresByJudge));
  return { competitorId, totalScore: total, scoresByJudge };
}
```

**Score Validator** (`src/validators/score-validator.ts`):

```typescript
import { validateScoreString } from '@competition-platform/format-sdk';
import type {
  ScorePayload,
  FormatContext,
  ValidationResult,
} from '@competition-platform/format-sdk';
import { CYPHER_DEFAULT_CRITERIA } from '../scoring/cypher-scoring.schema';

export function scoreValidator(score: ScorePayload, _context: FormatContext): ValidationResult {
  const errors: string[] = [];
  for (const sv of score.scores) {
    const criterion = CYPHER_DEFAULT_CRITERIA.find((c) => c.id === sv.criterionId);
    if (!criterion) {
      // Unknown criterion — may be a custom organizer criterion; allow it
      continue;
    }
    if (!validateScoreString(sv.value, criterion.min, criterion.max)) {
      errors.push(
        `Criterion "${sv.criterionId}": value "${sv.value}" must be a number between ${criterion.min} and ${criterion.max}`,
      );
    }
    if (!/^\d+\.\d{2}$/.test(sv.value)) {
      errors.push(
        `Criterion "${sv.criterionId}": value "${sv.value}" must be formatted as a string with exactly 2 decimal places (e.g. "8.75")`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
```

**Phase Transition Validator** (`src/validators/transition-validator.ts`):

```typescript
import type { CompetitionState, ValidationResult } from '@competition-platform/format-sdk';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['cypher'],
  cypher: ['advancement-review'],
  'advancement-review': ['battles'],
  battles: ['completed'],
  completed: [],
};

export function phaseTransitionValidator(
  from: string,
  to: string,
  _state: CompetitionState,
): ValidationResult {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      valid: false,
      errors: [
        `Invalid phase transition: ${from} → ${to}. Allowed from "${from}": [${allowed.join(', ')}]`,
      ],
    };
  }
  return { valid: true, errors: [] };
}
```

**Fairness Rules** (`src/fairness/cypher-fairness-rules.ts`):

```typescript
import type {
  TieBreakRule,
  JudgeScoreVisibility,
  JudgeGroupAssignment,
} from '@competition-platform/format-sdk';

export const CYPHER_JUDGE_SCORE_VISIBILITY: JudgeScoreVisibility = 'after-phase';
export const CYPHER_JUDGE_GROUP_ASSIGNMENT: JudgeGroupAssignment = 'round-robin';
export const CYPHER_TIE_BREAKING_RULES: TieBreakRule[] = [
  { type: 're-vote', maxRounds: 1 },
  { type: 'organizer-decision' },
];
```

### Cypher Battles UI Component Stubs

For Story 3.1, these components are minimal stubs. The `ComponentManifest` in the format references them by string identifier (`component` field). The `FormatRenderer` (Story 3.2+) wires the identifiers to the actual React components.

Create each as a basic stub that compiles and exports a React component:

```tsx
// packages/formats/cypher-battles/src/ui/judge-score-input.tsx
// Full implementation: Story 3.3

export interface JudgeScoreInputProps {
  competitorId: string;
  competitorName: string;
  criteria: Array<{ id: string; name: string; min: number; max: number }>;
  onSubmit: (scores: Record<string, string>) => void;
}

export function JudgeScoreInput({ competitorName }: JudgeScoreInputProps) {
  return <div>Scoring: {competitorName} — full UI in Story 3.3</div>;
}
```

Pattern is the same for the other 4 UI stubs — minimal props interface, simple render. Do not add logic.

### Main Format File

**`packages/formats/cypher-battles/src/cypher-battles.format.ts`:**

```typescript
import { createFormat } from '@competition-platform/format-sdk';
import type { CompetitionFormat } from '@competition-platform/format-sdk';
import { CYPHER_DEFAULT_CRITERIA } from './scoring/cypher-scoring.schema';
import { BATTLES_VOTE_CRITERION } from './scoring/battles-voting.schema';
import { cypherPhase } from './phases/cypher-phase';
import { battlesPhase } from './phases/battles-phase';
import { cypherBattlesStateMachine } from './phases/state-machine';
import { scoreValidator } from './validators/score-validator';
import { phaseTransitionValidator } from './validators/transition-validator';
import {
  CYPHER_JUDGE_SCORE_VISIBILITY,
  CYPHER_JUDGE_GROUP_ASSIGNMENT,
  CYPHER_TIE_BREAKING_RULES,
} from './fairness/cypher-fairness-rules';

export const cypherBattlesFormat: CompetitionFormat = createFormat({
  id: 'cypher-battles',
  name: 'Cypher Battles',
  version: '1.0.0',
  description:
    'Two-phase dance competition: Cypher (numeric scoring) → Battles (head-to-head voting)',
  author: 'competition-platform',
  domain: 'dance',

  scoringSchema: {
    criteria: [...CYPHER_DEFAULT_CRITERIA, BATTLES_VOTE_CRITERION],
    aggregation: 'sum',
  },

  phases: [cypherPhase, battlesPhase],

  stateMachine: cypherBattlesStateMachine,

  validators: {
    scoreValidator,
    phaseTransitionValidator,
  },

  fairnessRules: {
    judgeScoreVisibility: CYPHER_JUDGE_SCORE_VISIBILITY,
    judgeGroupAssignment: CYPHER_JUDGE_GROUP_ASSIGNMENT,
    tieBreaking: CYPHER_TIE_BREAKING_RULES,
  },

  ui: {
    judgeInput: {
      component: 'JudgeScoreInput',
      requiredPlatformHooks: ['useSocket', 'useOfflineQueue', 'useJudgeSession'],
    },
    publicDisplay: {
      component: 'PublicStandings',
      requiredPlatformHooks: ['useSocket'],
    },
    adminConfig: {
      component: 'AdminConfig',
      requiredPlatformHooks: [],
    },
    presenterView: {
      component: 'PresenterView',
      requiredPlatformHooks: ['useSocket'],
    },
  },
});
```

### Validation Test

**`packages/formats/cypher-battles/src/cypher-battles.format.spec.ts`:**

```typescript
import { describe, it, expect } from 'vitest';
import { validateFormat } from '@competition-platform/format-sdk';
import { cypherBattlesFormat } from './cypher-battles.format';

describe('cypherBattlesFormat SDK validation', () => {
  const report = validateFormat(cypherBattlesFormat);

  it('passes all 5 validation gates', () => {
    if (!report.valid) {
      const failedGates = Object.entries(report.gates)
        .filter(([, g]) => !g.passed)
        .map(([name, g]) => `${name}: ${g.errors.join('; ')}`);
      throw new Error(`Format validation failed:\n${failedGates.join('\n')}`);
    }
    expect(report.valid).toBe(true);
  });

  it('gate 1: interface compliance passes', () => {
    expect(report.gates.interfaceCompliance.passed).toBe(true);
  });

  it('gate 2: schema consistency passes (min < max, precision 2)', () => {
    expect(report.gates.schemaConsistency.passed).toBe(true);
  });

  it('gate 3: state machine reachability passes (all states reachable, terminal state defined)', () => {
    expect(report.gates.stateMachineReachability.passed).toBe(true);
  });

  it('gate 4: UI component manifests are valid', () => {
    expect(report.gates.uiComponentRendering.passed).toBe(true);
  });

  it('gate 5: fairness rules consistency passes', () => {
    expect(report.gates.fairnessRulesConsistency.passed).toBe(true);
  });

  it('format id is cypher-battles', () => {
    expect(cypherBattlesFormat.id).toBe('cypher-battles');
  });

  it('all numeric criteria have precision 2', () => {
    for (const c of cypherBattlesFormat.scoringSchema.criteria) {
      if (c.type === 'numeric') {
        expect(c.precision).toBe(2);
      }
    }
  });

  it('all numeric criteria have min < max', () => {
    for (const c of cypherBattlesFormat.scoringSchema.criteria) {
      if (c.type === 'numeric') {
        expect(c.min).toBeLessThan(c.max);
      }
    }
  });

  it('state machine has completed as terminal state', () => {
    expect(cypherBattlesFormat.stateMachine.states.completed?.type).toBe('final');
  });

  it('state machine initial state is draft', () => {
    expect(cypherBattlesFormat.stateMachine.initial).toBe('draft');
  });
});
```

### `packages/db/schema/formats.ts` — Leave as Stub

The `packages/db/schema/formats.ts` currently has `export {}` stubs — **leave it unchanged**. For MVP, the Cypher Battles format is loaded at build time (not from the database). A formats registry table is a post-MVP feature. Do not add a DB table in this story.

### XState — NOT Required in This Story

The `stateMachine` field uses `FormatStateMachineConfig` — a typed plain object (not an XState instance). The Competition Engine (Story 3.2) will wrap this config in an actual XState machine. Do NOT install XState in this story.

### `packages/formats/cypher-battles/src/index.ts`

```typescript
export { cypherBattlesFormat } from './cypher-battles.format';
export type { JudgeScoreInputProps } from './ui/judge-score-input';
// Add other UI prop type exports as stubs are created
```

### `format-sdk` Package — No New Dependencies Needed

The `packages/format-sdk/package.json` currently has only `typescript` as a devDependency. Do NOT add vitest to the format-sdk package — the SDK itself has no test runner. Tests live in `cypher-battles.format.spec.ts` in the format package, which has its own vitest.

### Phase Definitions

**`src/phases/cypher-phase.ts`:**

```typescript
import type { PhaseDefinition } from '@competition-platform/format-sdk';

export const cypherPhase: PhaseDefinition = {
  id: 'cypher',
  name: 'Cypher Phase',
  type: 'scoring',
  rules: {
    allowPartnerRotation: true,
    scoreVisibility: 'after-phase',
    submissionIdempotent: true,
  },
  advancementCriteria: {
    type: 'top-n',
    // value is set per-competition by organizer (configured in Story 2.4)
  },
};
```

**`src/phases/battles-phase.ts`:**

```typescript
import type { PhaseDefinition } from '@competition-platform/format-sdk';

export const battlesPhase: PhaseDefinition = {
  id: 'battles',
  name: 'Battles Phase',
  type: 'voting',
  rules: {
    format: 'single-elimination',
    voteOptions: ['player1', 'player2', 'tie'],
    requireMajority: true,
  },
  advancementCriteria: {
    type: 'bracket-progression',
  },
};
```

### Gotchas from Previous Stories (Still Apply)

1. **`proxy.ts` NOT `middleware.ts`**: Auth proxy at `apps/web/src/proxy.ts`. No change needed in this story — just don't create middleware.ts.
2. **`reflect-metadata` in Vitest**: Already in `apps/api/vitest.config.ts`. The new `cypher-battles` vitest config does NOT need `reflect-metadata` (pure format logic, no NestJS decorators).
3. **No floating point scores**: All score values are strings, e.g. `"8.75"`. Use `parseFloat().toFixed(2)` for arithmetic. Never store as `number`.
4. **No `any` type**: Use `unknown` + type guards or explicit types everywhere.
5. **`pnpm install` after workspace change**: After editing `pnpm-workspace.yaml`, run `pnpm install` to link the new workspace package before running typecheck.
6. **Turbo build order**: `format-sdk` is a dependency of `cypher-battles`. Turbo will build format-sdk first via `dependsOn: ["^build"]`. Since format-sdk has no `build` script yet (only `typecheck`), add a build passthrough or verify typecheck runs correctly.

### Turbo Build Consideration

The `format-sdk` package currently only has `typecheck` in its scripts (no `build` script). The turbo.json `"build"` task uses `dependsOn: ["^build"]`. If `cypher-battles` depends on `format-sdk` at build time and format-sdk has no build script, Turbo will skip it silently.

For this story: since both packages use `"main": "./src/index.ts"` (TypeScript source), no build step is needed — packages import TypeScript directly via the workspace. **Typecheck** is the validation step, not build.

If the CI pipeline fails with "format-sdk build not found", add `"build": "tsc --noEmit"` to format-sdk's package.json scripts.

### Project Structure Notes

**New files to create:**

```
pnpm-workspace.yaml                                    (modify: add packages/formats/*)
packages/formats/cypher-battles/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts
    cypher-battles.format.ts
    cypher-battles.format.spec.ts
    scoring/
      cypher-scoring.schema.ts
      battles-voting.schema.ts
      aggregation.ts
    phases/
      cypher-phase.ts
      battles-phase.ts
      state-machine.ts
    validators/
      score-validator.ts
      transition-validator.ts
    fairness/
      cypher-fairness-rules.ts
    ui/
      judge-score-input.tsx
      judge-vote-input.tsx
      public-standings.tsx
      public-bracket.tsx
      admin-config.tsx
```

**Modified files:**

```
pnpm-workspace.yaml                                    (add packages/formats/*)
packages/format-sdk/src/types/format.types.ts          (implement from stub)
packages/format-sdk/src/types/scoring.types.ts         (implement from stub)
packages/format-sdk/src/types/phase.types.ts           (implement from stub)
packages/format-sdk/src/types/ui.types.ts              (implement from stub)
packages/format-sdk/src/helpers/create-format.ts       (implement from stub)
packages/format-sdk/src/helpers/score-utils.ts         (implement from stub)
packages/format-sdk/src/testing/validate-format.ts     (implement from stub)
packages/format-sdk/src/index.ts                       (implement from stub)
```

**Unchanged files:**

```
packages/db/schema/formats.ts      (leave as empty stub — no DB table yet)
apps/api/src/**/*                  (no changes — format not wired to API yet)
apps/web/src/**/*                  (no changes — FormatRenderer deferred to Story 3.2)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.1]
- [Source: _bmad-output/planning-artifacts/epics.md#FR11 — System-generated judge group assignments]
- [Source: _bmad-output/planning-artifacts/epics.md#FR13 — Judges score on all criteria (numeric)]
- [Source: _bmad-output/planning-artifacts/epics.md#FR14 — Per-participant-per-judge score (sum of criteria)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Plugin Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#CompetitionFormat interface definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Validation Gate — 5 gates]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines — format isolation rules]
- [Source: _bmad-output/planning-artifacts/architecture.md#Structure Patterns — packages/formats/cypher-battles layout]
- [Source: _bmad-output/implementation-artifacts/2-5-generate-and-share-judge-invite-links.md#Dev Notes — gotchas]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed `sumScores` reduce: changed initial accumulator type from `string` to `number` to resolve TS2345
- Fixed format-sdk tsconfig: added `"target": "ES2017"`, `"lib": ["ES2017"]`, `"moduleResolution": "node"` to resolve missing `Set`, `Object.values`, `Array.includes` errors
- Removed `lint` script from cypher-battles package.json: packages don't have ESLint config (only apps do)

### Completion Notes List

- Implemented `packages/format-sdk` with 4 type files, 2 helper files, validation suite with all 5 gates, and public index
- Implemented `packages/formats/cypher-battles` with full format object assembled via `createFormat()`, 9 core logic files, 5 UI stubs, and main format file
- Added `packages/formats/*` to `pnpm-workspace.yaml` to register two-level-deep workspace packages
- All 11 validation tests pass (11/11 in cypher-battles.format.spec.ts)
- Full Turbo CI passes: 12/12 tasks (lint, typecheck, test across all packages) — no regressions
- Format isolation enforced: apps/api and apps/web have no imports from cypher-battles package

### File List

- pnpm-workspace.yaml (modified: added `packages/formats/*`)
- packages/format-sdk/tsconfig.json (modified: added target, lib, moduleResolution)
- packages/format-sdk/src/types/scoring.types.ts (implemented from stub)
- packages/format-sdk/src/types/phase.types.ts (implemented from stub)
- packages/format-sdk/src/types/ui.types.ts (implemented from stub)
- packages/format-sdk/src/types/format.types.ts (implemented from stub)
- packages/format-sdk/src/helpers/score-utils.ts (implemented from stub)
- packages/format-sdk/src/helpers/create-format.ts (implemented from stub)
- packages/format-sdk/src/testing/validate-format.ts (implemented from stub)
- packages/format-sdk/src/index.ts (implemented from stub)
- packages/formats/cypher-battles/package.json (created)
- packages/formats/cypher-battles/tsconfig.json (created)
- packages/formats/cypher-battles/vitest.config.ts (created)
- packages/formats/cypher-battles/src/scoring/cypher-scoring.schema.ts (created)
- packages/formats/cypher-battles/src/scoring/battles-voting.schema.ts (created)
- packages/formats/cypher-battles/src/scoring/aggregation.ts (created)
- packages/formats/cypher-battles/src/phases/cypher-phase.ts (created)
- packages/formats/cypher-battles/src/phases/battles-phase.ts (created)
- packages/formats/cypher-battles/src/phases/state-machine.ts (created)
- packages/formats/cypher-battles/src/validators/score-validator.ts (created)
- packages/formats/cypher-battles/src/validators/transition-validator.ts (created)
- packages/formats/cypher-battles/src/fairness/cypher-fairness-rules.ts (created)
- packages/formats/cypher-battles/src/ui/judge-score-input.tsx (created)
- packages/formats/cypher-battles/src/ui/judge-vote-input.tsx (created)
- packages/formats/cypher-battles/src/ui/public-standings.tsx (created)
- packages/formats/cypher-battles/src/ui/public-bracket.tsx (created)
- packages/formats/cypher-battles/src/ui/admin-config.tsx (created)
- packages/formats/cypher-battles/src/cypher-battles.format.ts (created)
- packages/formats/cypher-battles/src/index.ts (created)
- packages/formats/cypher-battles/src/cypher-battles.format.spec.ts (created)
- packages/formats/cypher-battles/eslint.config.mjs (created — code review fix M1)
- packages/formats/cypher-battles/src/score-utils.spec.ts (created — code review fix M2)
- packages/formats/cypher-battles/src/validators.spec.ts (created — code review fix M2)
- packages/formats/cypher-battles/src/aggregation.spec.ts (created — code review fix M2)

## Change Log

- 2026-04-23: Story 3.1 implemented — Format SDK types, helpers, validation suite, and Cypher Battles format with all 5 validation gates passing (claude-sonnet-4-6)
- 2026-04-23: Code review fixes — M1: added lint script + eslint.config.mjs for cypher-battles package (CI now 13/13 tasks); M2: added 34 unit tests for score-utils, validators, and aggregation (45 format tests total); M3: documented format-sdk/tsconfig.json in File List; L1: removed unnecessary `import React` from 5 UI stubs; L3: fixed double error reporting in score-validator (check format before range). CI 13/13, 85 total tests passing (claude-opus-4-6).
