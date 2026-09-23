import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist']),
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
