import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Two kinds of test, deliberately separated.
//
// `.test.ts` — pure logic and mocked worker tests in Node, without DOM or CRXJS.
//
// `.test.tsx` — component and hook behavior in jsdom. Real rendering covers interaction and
// persistence wiring that source-text assertions cannot validate.
//
// Environment is chosen per file rather than globally, so the Node suite keeps its own default.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] }
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.tsx'] }
      }
    ]
  }
});
