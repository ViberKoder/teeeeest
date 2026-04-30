import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { tonconnectManifestPlugin } from './tonconnect-manifest.plugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');

  return {
    plugins: [react(), tonconnectManifestPlugin(env)],
    server: { port: 5180 },
    envPrefix: 'VITE_',
    resolve: {
      alias: {
        buffer: 'buffer',
      },
    },
    define: {
      global: 'globalThis',
    },
  };
});
