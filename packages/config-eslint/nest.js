// @ts-check
const baseConfig = require('./base');

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...baseConfig,
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
];

module.exports = config;
