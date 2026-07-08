import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/', '**/coverage/', '**/node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/playground/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': react },
    rules: react.configs.recommended.rules,
  },
);
