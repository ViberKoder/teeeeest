import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { global: 'globalThis' },
  resolve: { alias: { buffer: 'buffer/' } },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    // the wallet and the public explorer (hatch.tg) are two pages of one build
    rollupOptions: { input: { main: 'index.html', explorer: 'explorer/index.html' } },
  },
  server: { host: true, port: 5180 },
  test: { globals: true, environment: 'node', testTimeout: 60_000 },
});
