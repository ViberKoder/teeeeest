import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import { config } from '../config';
import { configuredJettonMaster } from '../jettonMaster';
import { buildJettonMetadataJson, parseMasterAddressParam } from '../jettonMetadata';
import { loadJettonRegistry } from '../jettonRegistry';
import {
  JETTON_METADATA_FILENAME,
  JETTON_METADATA_FILENAME_LEGACY,
} from '../jettonAddressPath';
import type { AppStore } from '../store/appStore';

export interface PublicJettonMetadataDeps {
  store: AppStore;
}

async function metadataForMaster(store: AppStore, master: Address) {
  const reg = await loadJettonRegistry(store, master);
  const base = config.PUBLIC_APP_URL.trim().replace(/\/$/, '');
  if (!base) return null;

  if (reg) {
    return buildJettonMetadataJson(master, {
      publicAppUrl: base,
      name: reg.name,
      symbol: reg.symbol,
      description: reg.description,
      image: reg.image,
      decimals: reg.decimals,
    });
  }

  const configured = configuredJettonMaster();
  if (configured?.equals(master)) {
    return buildJettonMetadataJson(master);
  }

  return null;
}

async function serveEnvJettonMetadata(store: AppStore, reply: { code: (n: number) => void; header: (k: string, v: string) => void; type: (t: string) => void }) {
  const master = configuredJettonMaster();
  if (!master) {
    reply.code(503);
    return {
      error: 'jetton-master-not-configured',
      hint:
        'Set JETTON_MASTER_ADDRESS on the backend to your deployed master (EQ… from minter step 4) BEFORE TonAPI/wallets fetch this URL.',
    };
  }

  const body = await metadataForMaster(store, master);
  if (!body) {
    reply.code(503);
    return {
      error: 'jetton-metadata-not-configured',
      hint:
        'POST /api/v1/jettons/register from the minter after deploy, or set PUBLIC_APP_URL, PUBLIC_JETTON_NAME, PUBLIC_JETTON_SYMBOL',
    };
  }

  reply.type('application/json; charset=utf-8');
  reply.header('cache-control', 'public, max-age=30');
  return body;
}

/**
 * On-chain TEP-64 content URL: `{PUBLIC_APP_URL}/jetton-metadata2.json`.
 * Master address must NOT appear in that URL (it would change the contract address).
 */
export function registerPublicJettonMetadata(app: FastifyInstance, deps: PublicJettonMetadataDeps): void {
  app.get(`/${JETTON_METADATA_FILENAME}`, async (_req, reply) =>
    serveEnvJettonMetadata(deps.store, reply),
  );

  /** Legacy URL — same JSON; use change_content to point on-chain URI at metadata2 for TonAPI cache bust. */
  app.get(`/${JETTON_METADATA_FILENAME_LEGACY}`, async (_req, reply) =>
    serveEnvJettonMetadata(deps.store, reply),
  );

  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/metadata.json',
    async (req, reply) => {
      const fromPath = parseMasterAddressParam(req.params.master);
      if (!fromPath) {
        reply.code(400);
        return { error: 'invalid-master-address' };
      }

      const body = await metadataForMaster(deps.store, fromPath);
      if (!body) {
        reply.code(404);
        return {
          error: 'unknown-jetton-master',
          hint: 'POST /api/v1/jettons/register from the web minter after deploy, or set JETTON_MASTER_ADDRESS + PUBLIC_JETTON_*',
        };
      }

      reply.type('application/json; charset=utf-8');
      reply.header('cache-control', 'public, max-age=30');
      return body;
    },
  );
}
