import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import { config } from '../config';
import { configuredJettonMaster, configuredMintlessJettonMaster } from '../jettonMaster';
import { buildJettonMetadataJson, parseMasterAddressParam } from '../jettonMetadata';
import { loadJettonRegistry } from '../jettonRegistry';
import {
  JETTON_METADATA_FILENAME,
  JETTON_METADATA_FILENAME_LEGACY,
  JETTON_METADATA_FILENAME_LEGACY2,
  MINTLESS_JETTON_METADATA_FILENAME,
} from '../jettonAddressPath';
import type { AppStore } from '../store/appStore';

export interface PublicJettonMetadataDeps {
  store: AppStore;
}

async function metadataForMaster(store: AppStore, master: Address) {
  const reg = await loadJettonRegistry(store, master);
  const base = config.PUBLIC_APP_URL.trim().replace(/\/$/, '');
  if (!base) return null;

  const kind = reg?.kind ?? 'rmj';

  if (reg) {
    return buildJettonMetadataJson(master, {
      publicAppUrl: base,
      name: reg.name,
      symbol: reg.symbol,
      description: reg.description,
      image: reg.image,
      decimals: reg.decimals,
      kind,
    });
  }

  const configuredRmj = configuredJettonMaster();
  if (configuredRmj?.equals(master)) {
    return buildJettonMetadataJson(master, { kind: 'rmj' });
  }

  const configuredMintless = configuredMintlessJettonMaster();
  if (configuredMintless?.equals(master)) {
    return buildJettonMetadataJson(master, { kind: 'mintless' });
  }

  return null;
}

async function serveFixedJettonMetadata(
  store: AppStore,
  master: Address | null,
  envVarName: string,
  reply: { code: (n: number) => void; header: (k: string, v: string) => void; type: (t: string) => void },
) {
  if (!master) {
    reply.code(503);
    return {
      error: 'jetton-master-not-configured',
      hint: `Set ${envVarName} on the backend to your deployed master (EQ… from minter step 4) BEFORE TonAPI/wallets fetch this URL.`,
    };
  }

  const body = await metadataForMaster(store, master);
  if (!body) {
    reply.code(503);
    return {
      error: 'jetton-metadata-not-configured',
      hint:
        'POST /api/v1/jettons/register from the minter after deploy, or set PUBLIC_APP_URL and jetton display env vars',
    };
  }

  reply.type('application/json; charset=utf-8');
  reply.header('cache-control', 'public, max-age=30');
  return body;
}

/**
 * On-chain TEP-64 content URLs (master address must NOT appear in the path):
 * - RMJ: `{PUBLIC_APP_URL}/jetton-metadata3.json` → `JETTON_MASTER_ADDRESS`
 * - TEP-177: `{PUBLIC_APP_URL}/mintless-jetton-metadata.json` → `MINTLESS_JETTON_MASTER_ADDRESS`
 */
export function registerPublicJettonMetadata(app: FastifyInstance, deps: PublicJettonMetadataDeps): void {
  app.get(`/${JETTON_METADATA_FILENAME}`, async (_req, reply) =>
    serveFixedJettonMetadata(deps.store, configuredJettonMaster(), 'JETTON_MASTER_ADDRESS', reply),
  );

  /** Legacy RMJ URLs — same JSON (TonAPI may cache stale master at old paths). */
  app.get(`/${JETTON_METADATA_FILENAME_LEGACY2}`, async (_req, reply) =>
    serveFixedJettonMetadata(deps.store, configuredJettonMaster(), 'JETTON_MASTER_ADDRESS', reply),
  );

  app.get(`/${JETTON_METADATA_FILENAME_LEGACY}`, async (_req, reply) =>
    serveFixedJettonMetadata(deps.store, configuredJettonMaster(), 'JETTON_MASTER_ADDRESS', reply),
  );

  app.get(`/${MINTLESS_JETTON_METADATA_FILENAME}`, async (_req, reply) =>
    serveFixedJettonMetadata(
      deps.store,
      configuredMintlessJettonMaster(),
      'MINTLESS_JETTON_MASTER_ADDRESS',
      reply,
    ),
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
          hint: 'POST /api/v1/jettons/register from the web minter after deploy, or set JETTON_MASTER_ADDRESS / MINTLESS_JETTON_MASTER_ADDRESS + PUBLIC_*',
        };
      }

      reply.type('application/json; charset=utf-8');
      reply.header('cache-control', 'public, max-age=30');
      return body;
    },
  );
}
