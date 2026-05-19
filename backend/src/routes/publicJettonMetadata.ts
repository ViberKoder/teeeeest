import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { buildCustomPayloadApiUri } from '../jettonMaster';

/**
 * Serves TEP-64-compatible jetton metadata JSON so creators can point the master
 * `content` URL at `{PUBLIC_APP_URL}/jetton-metadata.json` without a separate host.
 *
 * Requires: PUBLIC_APP_URL, PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL.
 * TEP-64 `decimals` follows `PUBLIC_BALANCE_DISPLAY` (`integer` → `"0"`, `jetton_nano` → `"9"`).
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
    /** Wallets divide on-chain balance by 10^decimals. Use `0` so 1 DB / 1 chain unit = 1 shown token (see PUBLIC_BALANCE_DISPLAY=integer). */
    const decimals = config.PUBLIC_BALANCE_DISPLAY === 'integer' ? '0' : '9';
    const body: Record<string, string> = {
      name,
      symbol,
      description:
        config.PUBLIC_JETTON_DESCRIPTION.trim() ||
        `${symbol} — Rolling Mintless Jetton rewards.`,
      decimals,
    };
    const customPayloadApiUri = buildCustomPayloadApiUri(base);
    if (!customPayloadApiUri) {
      reply.code(503);
      return {
        error: 'jetton-master-not-configured',
        hint: 'Set JETTON_MASTER_ADDRESS on the backend so custom_payload_api_uri can be …/api/v1/jettons/{master}',
      };
    }
    body.custom_payload_api_uri = customPayloadApiUri;
    /** TonAPI may still index the pre-/jettons/{master} URI — keep routes alive (see wallet-display-audit). */
    body.legacy_custom_payload_api_uri = `${base}/api/v1/custom-payload`;
    if (image) body.image = image;

    reply.type('application/json; charset=utf-8');
    return body;
  });
}
