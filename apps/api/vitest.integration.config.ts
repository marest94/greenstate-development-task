import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'], exclude: ['test/health.test.ts', 'test/config.test.ts'], fileParallelism: false, hookTimeout: 30_000, testTimeout: 15_000 } });
