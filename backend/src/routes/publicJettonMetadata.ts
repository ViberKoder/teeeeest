import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { buildCustomPayloadApiUri } from '../jettonMaster';

/**
 * Serves TEP-64-compatible jetton metadata JSON so creators can point the master
 * `content` URL at `{PUBLIC_APP_URL}/jetton-metadata.json` without a separate host.
 *
 * Requires: PUBLIC_APP_URL, PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL.
 * Decimals come from PUBLIC_JETTON_DECIMALS (default 0 = one on-chain unit displays as one token).
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
      decimals: config.PUBLIC_JETTON_DECIMALS,
    };
    const customPayloadApiUri = buildCustomPayloadApiUri(base);
    if (!customPayloadApiUri) {
      reply.code(503);
      return {
        error: 'jetton-master-not-configured',
        hint: 'Set JETTON_MASTER_ADDRESS so custom_payload_api_uri can be …/api/v1/jettons/{master}',
      };
    }
    body.custom_payload_api_uri = customPayloadApiUri;
    /** TonAPI / older clients still call this path — keep in JSON for transition */
    body.legacy_custom_payload_api_uri = `${base}/api/v1/custom-payload`;
    if (image) body.image = image;

    reply.type('application/json; charset=utf-8');
    return body;
  });
}
