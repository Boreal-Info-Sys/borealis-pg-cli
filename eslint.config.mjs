import eslintConfigPrettier from 'eslint-config-prettier'
import {defineConfig, includeIgnoreFile} from 'eslint/config'
import {fileURLToPath} from 'node:url'
import tseslint from 'typescript-eslint'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
  includeIgnoreFile(gitignorePath, {gitignoreResolution: true}),
  {
    extends: [tseslint.configs.recommended, eslintConfigPrettier],
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_(\\d)*$',
          varsIgnorePattern: '^_(\\d)*$',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
])
