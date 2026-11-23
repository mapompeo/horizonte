import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginSvelte from 'eslint-plugin-svelte'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'e2e/**', 'e2e-out/**'] },
  tseslint.configs.recommended,
  eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{tsx,svelte}'],
    rules: {
      'svelte/no-unused-svelte-ignore': 'off'
    }
  },
  {
    // Modo compatível da página do navegador: JavaScript antigo (ES5), sem tipos, para rodar no Safari do iOS 9.
    files: ['src/renderer/public/**/*.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'script' },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  eslintConfigPrettier
)
