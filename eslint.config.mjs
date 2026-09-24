import {defineConfig, includeIgnoreFile} from 'eslint/config';
import {fileURLToPath} from 'node:url'
import tseslint from 'typescript-eslint'

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url))

export default defineConfig([
  includeIgnoreFile(gitignorePath, {gitignoreResolution: true}),
  {
    extends: tseslint.configs.recommended,
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_(\\d)*$',
          varsIgnorePattern: '^_(\\d)*$',
        },
      ],
      '@typescript-eslint/no-use-before-define': ['error', {
        functions: false,
      }],
      camelcase: ['warn', {
        properties: 'never',
      }],
      indent: ['error', 2, {
        SwitchCase: 1,
        MemberExpression: 1,
      }],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
])
