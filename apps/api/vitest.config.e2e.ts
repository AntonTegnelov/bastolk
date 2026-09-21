import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // These run against a real database and load the embedding model, which
    // is a download on a cold cache. The default five seconds is a unit-test
    // budget, not an end-to-end one.
    testTimeout: 180_000,
    hookTimeout: 300_000,
    // One database, so the suites must not interleave their writes.
    fileParallelism: false,
  },
});
