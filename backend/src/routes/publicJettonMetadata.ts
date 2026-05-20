import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { configuredJettonMaster } from '../jettonMaster';
import {
  buildJettonMetadataJson,
  jettonMetadataHostedUrl,
  parseMasterAddressParam,
} from '../jettonMetadata';

/**
 * TEP-64 jetton metadata (off-chain JSON).
 *
 * **Canonical on-chain URL** (set at deploy time, before TonAPI indexes):
 * `{PUBLIC_APP_URL}/api/v1/jettons/{master}/metadata.json`
 *
 * Legacy `/jetton-metadata.json` only works when `JETTON_MASTER_ADDRESS` is set and
 * redirects to the canonical URL — never serves a master-less `custom_payload_api_uri`.
 */
export function registerPublicJettonMetadata(app: FastifyInstance): void {
  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/metadata.json',
    async (req, reply) => {
      const master = parseMasterAddressParam(req.params.master);
      if (!master) {
        reply.code(400);
        return { error: 'invalid-jetton-master' };
      }

      const body = buildJettonMetadataJson(master);
      if (!body) {
        reply.code(503);
        return {
          error: 'jetton-metadata-not-configured',
          hint:
            'Set PUBLIC_APP_URL, PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL on the backend (see docs/QUICKSTART_ONE_CLICK.md)',
        };
      }

      reply.type('application/json; charset=utf-8');
      return body;
    },
  );

  app.get('/jetton-metadata.json', async (_req, reply) => {
    const master = configuredJettonMaster();
    const base = config.PUBLIC_APP_URL.trim().replace(/\/$/, '');

    if (!master) {
      reply.code(503);
      return {
        error: 'jetton-master-not-configured',
        hint:
          'Point on-chain content at {PUBLIC_APP_URL}/api/v1/jettons/{master}/metadata.json (master known at deploy). Or set JETTON_MASTER_ADDRESS for this legacy path.',
      };
    }

    if (!base) {
      reply.code(404);
      return {
        error: 'jetton-metadata-not-configured',
        hint: 'Set PUBLIC_APP_URL (https URL of this service)',
      };
    }

    const canonical = jettonMetadataHostedUrl(base, master);
    reply.redirect(307, canonical);
  });
}
