import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5190 },
  envPrefix: 'VITE_',
  resolve: {
    alias: { buffer: 'buffer' },
  },
  define: { global: 'globalThis' },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
