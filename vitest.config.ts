import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Two kinds of test, deliberately separated.
//
// `.test.ts` — the pure logic modules, in Node. No DOM, no CRXJS, no React. This is the bulk of
// the suite and it stays that way: those modules are pure so that they can be tested without any
// of this machinery, and running them under jsdom would only make them slower.
//
// `.test.tsx` — component behaviour, in jsdom. There is exactly one of these and it earns its
// keep. Two release-blocking bugs (a pointer press never selecting a band; a focus-and-leave
// rewriting that band and spending the undo slot) lived in wiring that no pure function can
// reach, and the source-text assertions written to guard them were walked through by ten separate
// one-line mutations across two review rounds — a stray `!`, a dead store, a deleted ref
// assignment. Text cannot encode behaviour. Rendering the component can.
//
// Environment is chosen per file rather than globally, so the Node suite keeps its own default.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']]
  }
});
