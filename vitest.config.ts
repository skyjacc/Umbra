import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Node-env unit tests for the pure logic modules (no CRXJS, no DOM).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
