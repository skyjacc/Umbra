import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

// MV3 build via CRXJS. Output goes to dist/ — load that folder as an unpacked
// extension. Production build is CSP-safe (no eval, no remote code).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      // Keep chunk names stable-ish; CRXJS manages the manifest wiring.
      output: { chunkFileNames: 'assets/[name]-[hash].js' }
    }
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } }
});
