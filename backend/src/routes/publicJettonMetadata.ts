import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { configuredJettonMaster } from '../jettonMaster';
import { buildJettonMetadataJson, parseMasterAddressParam } from '../jettonMetadata';

/**
 * On-chain TEP-64 content URL: `{PUBLIC_APP_URL}/jetton-metadata.json` only.
 * Master address must NOT appear in that URL (it would change the contract address).
 * `custom_payload_api_uri` uses friendly EQ… from `JETTON_MASTER_ADDRESS`.
 */
export function registerPublicJettonMetadata(app: FastifyInstance): void {
  app.get('/jetton-metadata.json', async (_req, reply) => {
    const master = configuredJettonMaster();
    if (!master) {
      reply.code(503);
      return {
        error: 'jetton-master-not-configured',
        hint:
          'Set JETTON_MASTER_ADDRESS on the backend to your deployed master (EQ… from minter step 2) BEFORE TonAPI/wallets fetch this URL.',
      };
    }

    const body = buildJettonMetadataJson(master);
    if (!body) {
      reply.code(503);
      return {
        error: 'jetton-metadata-not-configured',
        hint: 'Set PUBLIC_APP_URL, PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL',
      };
    }

    reply.type('application/json; charset=utf-8');
    return body;
  });

  /** Same JSON as /jetton-metadata.json when master in path matches env. */
  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/metadata.json',
    async (req, reply) => {
      const fromPath = parseMasterAddressParam(req.params.master);
      const configured = configuredJettonMaster();
      if (!fromPath || !configured || !fromPath.equals(configured)) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }

      const body = buildJettonMetadataJson(configured);
      if (!body) {
        reply.code(503);
        return { error: 'jetton-metadata-not-configured' };
      }

      reply.type('application/json; charset=utf-8');
      return body;
    },
  );
}
