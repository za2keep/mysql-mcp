import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec,property}.ts'],
    hookTimeout: 30000, // 30 seconds for setup/teardown hooks
    testTimeout: 15000, // 15 seconds per test
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.property.ts'
      ]
    }
  }
});
