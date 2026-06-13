import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import { config } from '../config';
import { configuredJettonMaster, masterForHostedMintlessMetadata } from '../jettonMaster';
import { buildJettonMetadataJson, parseMasterAddressParam } from '../jettonMetadata';
import { loadJettonRegistry } from '../jettonRegistry';
import {
  JETTON_METADATA_FILENAME,
  JETTON_METADATA_FILENAME_LEGACY,
  JETTON_METADATA_FILENAME_LEGACY2,
  JETTON_METADATA_FILENAME_LEGACY3,
  MINTLESS_JETTON_METADATA_FILENAME,
} from '../jettonAddressPath';
import type { AppStore } from '../store/appStore';
import type { AirdropState } from '../state';

export interface PublicJettonMetadataDeps {
  store: AppStore;
  state: AirdropState;
}

function parseRollingEpochFromQuery(v: unknown, fallbackEpoch: number): number {
  if (v == null || v === '') return fallbackEpoch;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallbackEpoch;
}

async function metadataForMaster(
  store: AppStore,
  state: AirdropState,
  master: Address,
  rollingEpoch?: number,
) {
  const reg = await loadJettonRegistry(store, master);
  const base = config.PUBLIC_APP_URL.trim().replace(/\/$/, '');
  if (!base) return null;

  const kind = reg?.kind ?? 'rmj';
  const epoch = rollingEpoch ?? state.epoch;
  const rollingOpts =
    kind === 'rmj' && epoch > 0
      ? { rollingEpoch: epoch, rollingRootHex: state.rootHex() }
      : {};

  if (reg) {
    return buildJettonMetadataJson(master, {
      publicAppUrl: base,
      name: reg.name,
      symbol: reg.symbol,
      description: reg.description,
      image: reg.image,
      decimals: reg.decimals,
      kind,
      ...rollingOpts,
    });
  }

  const configuredRmj = configuredJettonMaster();
  if (configuredRmj?.equals(master)) {
    return buildJettonMetadataJson(master, { kind: 'rmj', ...rollingOpts });
  }

  const configuredMintless = configuredMintlessJettonMaster();
  if (configuredMintless?.equals(master)) {
    return buildJettonMetadataJson(master, { kind: 'mintless' });
  }

  return null;
}

async function serveFixedJettonMetadata(
  store: AppStore,
  state: AirdropState,
  master: Address | null,
  envVarName: string,
  query: { v?: string },
  reply: { code: (n: number) => void; header: (k: string, v: string) => void; type: (t: string) => void },
) {
  if (!master) {
    reply.code(503);
    return {
      error: 'jetton-master-not-configured',
      hint: `Set ${envVarName} on the backend to your deployed master (EQ… from minter step 4) BEFORE TonAPI/wallets fetch this URL.`,
    };
  }

  const rollingEpoch = parseRollingEpochFromQuery(query.v, state.epoch);
  const body = await metadataForMaster(store, state, master, rollingEpoch);
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
 * - RMJ: `{PUBLIC_APP_URL}/jetton-metadata4.json?v={epoch}` → `JETTON_MASTER_ADDRESS`
 * - TEP-177: `{PUBLIC_APP_URL}/mintless-jetton-metadata.json` → `MINTLESS_JETTON_MASTER_ADDRESS`
 *
 * Query `?v=` matches on-chain epoch cache-bust; JSON includes
 * `mintless_merkle_dump_uri?epoch=&root=` for TonAPI dump re-fetch.
 */
export function registerPublicJettonMetadata(app: FastifyInstance, deps: PublicJettonMetadataDeps): void {
  app.get<{ Querystring: { v?: string } }>(`/${JETTON_METADATA_FILENAME}`, async (req, reply) =>
    serveFixedJettonMetadata(
      deps.store,
      deps.state,
      configuredJettonMaster(),
      'JETTON_MASTER_ADDRESS',
      req.query,
      reply,
    ),
  );

  /** Legacy RMJ URLs — same JSON (TonAPI may cache stale master at old paths). */
  app.get<{ Querystring: { v?: string } }>(`/${JETTON_METADATA_FILENAME_LEGACY3}`, async (req, reply) =>
    serveFixedJettonMetadata(
      deps.store,
      deps.state,
      configuredJettonMaster(),
      'JETTON_MASTER_ADDRESS',
      req.query,
      reply,
    ),
  );

  app.get<{ Querystring: { v?: string } }>(`/${JETTON_METADATA_FILENAME_LEGACY2}`, async (req, reply) =>
    serveFixedJettonMetadata(
      deps.store,
      deps.state,
      configuredJettonMaster(),
      'JETTON_MASTER_ADDRESS',
      req.query,
      reply,
    ),
  );

  app.get<{ Querystring: { v?: string } }>(`/${JETTON_METADATA_FILENAME_LEGACY}`, async (req, reply) =>
    serveFixedJettonMetadata(
      deps.store,
      deps.state,
      configuredJettonMaster(),
      'JETTON_MASTER_ADDRESS',
      req.query,
      reply,
    ),
  );

  app.get<{ Querystring: { v?: string } }>(`/${MINTLESS_JETTON_METADATA_FILENAME}`, async (req, reply) =>
    serveFixedJettonMetadata(
      deps.store,
      deps.state,
      masterForHostedMintlessMetadata(),
      'JETTON_MASTER_ADDRESS',
      req.query,
      reply,
    ),
  );

  app.get<{ Params: { master: string }; Querystring: { v?: string } }>(
    '/api/v1/jettons/:master/metadata.json',
    async (req, reply) => {
      const fromPath = parseMasterAddressParam(req.params.master);
      if (!fromPath) {
        reply.code(400);
        return { error: 'invalid-master-address' };
      }

      const rollingEpoch = parseRollingEpochFromQuery(req.query.v, deps.state.epoch);
      const body = await metadataForMaster(deps.store, deps.state, fromPath, rollingEpoch);
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
