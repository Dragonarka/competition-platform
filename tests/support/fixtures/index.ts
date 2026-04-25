import { mergeTests } from '@playwright/test';
import { authTest } from './auth.fixture';

export const test = mergeTests(authTest);
export { expect } from '@playwright/test';
export * from './auth.fixture';
export * from './test-data.fixture';
