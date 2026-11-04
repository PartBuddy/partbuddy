import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out', 'dist', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Two programs: Node (main, preload, tests) and DOM (renderer); shared code is in both.
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dockview-enterprise', message: 'Proprietary licence; use dockview-react (MIT).' }],
          patterns: [{ group: ['**/prototypes/**', '@partbuddy/clickdummy'], message: 'Product code never imports a prototype (ADR 0003).' }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Use design tokens (CSS variables) instead of literal colours.',
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'test/**/*.ts', 'e2e/**/*.ts', '*.config.ts', '*.config.mts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // The renderer reaches the main process only through the platform adapter (ADR 0002).
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: 'Use the platform adapter (src/renderer/src/platform.ts).' }],
          patterns: [{ group: ['**/main/**', '**/preload/**'], message: 'The renderer must not import main or preload code.' }],
        },
      ],
    },
  },
  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
