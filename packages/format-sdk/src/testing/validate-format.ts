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
    valid: Object.values(gates).every((g: GateResult) => g.passed),
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

  for (const state of Object.keys(states)) {
    if (!reachable.has(state)) {
      errors.push(`State "${state}" is unreachable from initial state "${initial}"`);
    }
  }

  const finalStates = Object.entries(states)
    .filter(
      ([, cfg]: [string, { type?: string; on?: Record<string, string> }]) => cfg.type === 'final',
    )
    .map(([id]: [string, unknown]) => id);
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
