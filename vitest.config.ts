import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'server/test/**/*.test.ts', 'web/test/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'threads',
  },
});
