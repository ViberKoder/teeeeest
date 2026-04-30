import { FastifyInstance } from 'fastify';
import { config } from '../config';

/**
 * Serves TEP-64-compatible jetton metadata JSON so creators can point the master
 * `content` URL at `{PUBLIC_APP_URL}/jetton-metadata.json` without a separate host.
 *
 * Requires: PUBLIC_APP_URL, PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL.
 */
export function registerPublicJettonMetadata(app: FastifyInstance): void {
  app.get('/jetton-metadata.json', async (_req, reply) => {
    const base = config.PUBLIC_APP_URL.trim().replace(/\/$/, '');
    const name = config.PUBLIC_JETTON_NAME.trim();
    const symbol = config.PUBLIC_JETTON_SYMBOL.trim();
    if (!base || !name || !symbol) {
      reply.code(404);
      return {
        error: 'jetton-metadata-not-configured',
        hint:
          'Set PUBLIC_APP_URL (https URL of this service), PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL — see docs/QUICKSTART_ONE_CLICK.md',
      };
    }

    const image = config.PUBLIC_JETTON_IMAGE_URL.trim();
    const body: Record<string, string> = {
      name,
      symbol,
      description:
        config.PUBLIC_JETTON_DESCRIPTION.trim() ||
        `${symbol} — Rolling Mintless Jetton rewards.`,
      decimals: '9',
      custom_payload_api_uri: `${base}/api/v1/custom-payload`,
    };
    if (image) body.image = image;

    reply.type('application/json; charset=utf-8');
    return body;
  });
}
