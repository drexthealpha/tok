import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'server/test/**/*.test.ts', 'web/test/**/*.test.ts', 'web/test/**/*.test.tsx', 'tests/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
  },
});
