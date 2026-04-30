import type { Plugin } from 'vite';

/**
 * Serves and emits Ton Connect manifest with `url` matching the deployed origin.
 *
 * Priority: `VITE_APP_ORIGIN` (custom domain / preview) → `VERCEL_URL` (Vercel build) → localhost.
 */
export function tonconnectManifestPlugin(env: Record<string, string>): Plugin {
  const iconUrl = 'https://ton.org/download/ton_symbol.png';
  const name = 'RMJ Minter';

  const resolveOrigin = (): string => {
    const explicit = (env.VITE_APP_ORIGIN ?? process.env.VITE_APP_ORIGIN ?? '').trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const vercel = (process.env.VERCEL_URL ?? '').trim();
    if (vercel) {
      const host = vercel.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return `https://${host}`;
    }

    return 'http://localhost:5180';
  };

  const manifestSource = (): string =>
    JSON.stringify(
      {
        url: resolveOrigin(),
        name,
        iconUrl,
      },
      null,
      2,
    );

  return {
    name: 'tonconnect-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = req.url?.split('?')[0];
        if (p === '/tonconnect-manifest.json') {
          const body = manifestSource();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'tonconnect-manifest.json',
        source: manifestSource(),
      });
    },
  };
}
