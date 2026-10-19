import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // shadcn ui files export variants and hooks next to their components (kept as generated); the lib/vic hook modules
    // (useActions, useQuick, useConfirm, notices) render their dialog bodies inline. A dev edit there reloads the page.
    files: ['src/components/ui/**/*.tsx', 'src/lib/vic/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
