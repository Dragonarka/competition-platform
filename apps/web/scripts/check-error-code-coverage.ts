#!/usr/bin/env tsx
/**
 * CI gate (AC #4): fail when packages/shared/errors/error-codes.ts has codes
 * with no corresponding `Errors.<CODE>` key in messages/en.json or messages/es.json.
 *
 * Prevents the "raw error code leaks to the user" class of bug.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorCodes } from '@competition-platform/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = resolve(__dirname, '..', 'messages');

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

function loadErrorKeys(file: string): Set<string> {
  const json = JSON.parse(readFileSync(file, 'utf-8')) as JsonObject;
  const errors = json.Errors;
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) {
    throw new Error(`${file} is missing the top-level "Errors" namespace`);
  }
  return new Set(Object.keys(errors as JsonObject));
}

const codes = Object.values(ErrorCodes) as string[];
const enErrorKeys = loadErrorKeys(resolve(MESSAGES_DIR, 'en.json'));
const esErrorKeys = loadErrorKeys(resolve(MESSAGES_DIR, 'es.json'));

const missingEn = codes.filter((c) => !enErrorKeys.has(c)).sort();
const missingEs = codes.filter((c) => !esErrorKeys.has(c)).sort();

if (missingEn.length === 0 && missingEs.length === 0) {
  console.log(`✓ error-code coverage OK (${codes.length} codes / en+es)`);
  process.exit(0);
}

console.error('✗ error-code i18n coverage check failed');
if (missingEn.length > 0) {
  console.error(`\nErrorCodes missing from en.json Errors namespace (${missingEn.length}):`);
  for (const c of missingEn) console.error(`  - ${c}`);
}
if (missingEs.length > 0) {
  console.error(`\nErrorCodes missing from es.json Errors namespace (${missingEs.length}):`);
  for (const c of missingEs) console.error(`  - ${c}`);
}
console.error('\nAdd a user-facing message under "Errors.<CODE>" for each missing code.');
process.exit(1);
