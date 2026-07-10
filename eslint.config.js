import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/', '**/coverage/', '**/node_modules/', '**/.next/', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression) > Literal[value=/^\\.{1,2}\\/.*\\.jsx?$/]',
          message:
            "Import the real TypeScript file (e.g. './foo.ts'), not '.js' — tsc rewrites the extension at emit; see docs/plugins.md.",
        },
      ],
    },
  },
  {
    files: ['apps/playground/**/*.{ts,tsx}', 'website/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': react },
    rules: react.configs.recommended.rules,
  },
);
