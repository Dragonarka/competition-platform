#!/usr/bin/env tsx
/**
 * CI gate (AC #2): fail when messages/en.json and messages/es.json have
 * divergent key structures. Runs as part of `pnpm exec turbo run lint`.
 *
 * Strategy: flatten both files to dot-notation key sets, diff both directions,
 * exit non-zero with a clear report if anything diverges.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = resolve(__dirname, '..', 'messages');

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

function flatten(obj: JsonObject, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of flatten(value as JsonObject, path)) keys.add(k);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

function loadJson(file: string): JsonObject {
  return JSON.parse(readFileSync(file, 'utf-8')) as JsonObject;
}

const enKeys = flatten(loadJson(resolve(MESSAGES_DIR, 'en.json')));
const esKeys = flatten(loadJson(resolve(MESSAGES_DIR, 'es.json')));

const onlyInEn = [...enKeys].filter((k) => !esKeys.has(k)).sort();
const onlyInEs = [...esKeys].filter((k) => !enKeys.has(k)).sort();

if (onlyInEn.length === 0 && onlyInEs.length === 0) {
  console.log(`✓ i18n parity OK (${enKeys.size} keys in en/es)`);
  process.exit(0);
}

console.error('✗ i18n key parity check failed');
if (onlyInEn.length > 0) {
  console.error(`\nKeys in en.json but missing from es.json (${onlyInEn.length}):`);
  for (const k of onlyInEn) console.error(`  - ${k}`);
}
if (onlyInEs.length > 0) {
  console.error(`\nKeys in es.json but missing from en.json (${onlyInEs.length}):`);
  for (const k of onlyInEs) console.error(`  - ${k}`);
}
console.error(
  '\nFix by adding the missing keys to the corresponding file. ' +
    'Spanish translations may stub English text with a // TODO comment; ' +
    'the parity check only cares about key structure.',
);
process.exit(1);
