import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // __APP_VERSION__ / __APP_VERSION_CODE__ sont injectés au build par
      // `define` (vite.config.js).
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly',
        __APP_VERSION_CODE__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { react },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // `no-undef` ne voit PAS un composant JSX non importé : il ne crée pas de
      // référence pour un JSXIdentifier. Un `<Fragment>` dont on a retiré
      // l'import passait donc le lint ET le build, pour s'écraser à l'ouverture
      // de l'écran. C'est arrivé une fois ; cette règle ferme le trou.
      'react/jsx-no-undef': 'error',
    },
  },
])
