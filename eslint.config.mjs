import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 ships native flat configs, so they are spread in
 * directly instead of going through the FlatCompat bridge.
 *
 * ESLint is pinned to 9.x: the eslint-plugin-react bundled inside
 * eslint-config-next still calls `context.getFilename()`, which ESLint 10
 * removed, so linting crashes on 10 regardless of this file.
 */
const config = [
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'drizzle/migrations/**',
      'coverage/**',
      'public/sw.js',
      'next-env.d.ts',
      'cloudflare-env.d.ts',
      'tmp/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // console.warn / console.error are how the server reports problems it
      // cannot show the user; plain console.log is noise.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Scripts run in Node, outside the app runtime.
    files: ['scripts/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
