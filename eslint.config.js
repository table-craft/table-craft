// Correctness rules only — formatting is left to the authors (see .editorconfig).
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const GAME_MODULES = ['examples/**/game.js', 'packages/create-tablecraft/templates/**/game.js'];

export default [
  { ignores: ['dist/', 'site/dist/', 'node_modules/', '**/node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    ignores: GAME_MODULES,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-new-func': 'error',
    },
  },
  // Game modules: CommonJS scripts with the sandbox globals.
  {
    files: GAME_MODULES,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.es2024, module: 'writable', T: 'readonly', clone: 'readonly' } },
    rules: { 'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }] },
  },
];
