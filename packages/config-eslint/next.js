// @ts-check
const baseConfig = require('./base');

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...baseConfig,
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-img-element': 'error',
      'react/no-unescaped-entities': 'off',
    },
  },
];

module.exports = config;
