import { Address, toNano } from '@ton/core';
import { FastifyInstance } from 'fastify';
import type { AppStore } from '../store/appStore';
import type { AirdropState } from '../state';
import { config } from '../config';
import { runCompliance } from '../compliance';
import {
  buildChangeContentPayload,
  bumpMetadataUri,
  fixedRmjMetadataUri,
  getToncenterIndexerStatus,
} from '../toncenterIndexer';
import { configuredJettonMaster, parseJettonMasterParam } from '../jettonMaster';
import { buildJettonMetadataJson } from '../jettonMetadata';
import { loadJettonRegistry } from '../jettonRegistry';
import { jettonMasterFriendly } from '../jettonAddressPath';
import { logger } from '../logger';

export interface MintlessComplianceDeps {
  store: AppStore;
  state: AirdropState;
}

const CORS = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

/**
 * Mintless API compatibility routes (parity with mintless-jetton-test):
 * - GET /api/v1/jettons/:master/compliance
 * - GET /api/v1/jettons/:master/indexer-status
 * - GET /api/v1/jettons/:master/sync-metadata
 * - GET /api/v1/jettons/:master/jetton.json
 */
export function registerMintlessCompliance(app: FastifyInstance, deps: MintlessComplianceDeps): void {
  app.get<{ Params: { master: string }; Querystring: { owner?: string } }>(
    '/api/v1/jettons/:master/compliance',
    async (req, reply) => {
      reply.headers(CORS);
      const master = parseJettonMasterParam(req.params.master);
      if (!master) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }

      const report = await runCompliance({
        state: deps.state,
        store: deps.store,
        sampleOwnerAddress: req.query.owner ?? null,
        publicAppUrl: config.PUBLIC_APP_URL,
      });
      return report;
    },
  );

  app.get<{ Params: { master: string }; Querystring: { owner?: string } }>(
    '/api/v1/jettons/:master/indexer-status',
    async (req, reply) => {
      reply.headers(CORS);
      const master = parseJettonMasterParam(req.params.master);
      if (!master) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }

      const status = await getToncenterIndexerStatus({
        network: config.TON_NETWORK,
        onChainMaster: master,
        ourMetadataUri: fixedRmjMetadataUri(),
        sampleOwnerAddress: req.query.owner ?? config.ADMIN_WALLET_ADDRESS ?? null,
      });
      return status;
    },
  );

  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/jetton.json',
    async (req, reply) => {
      const master = parseJettonMasterParam(req.params.master);
      if (!master) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }

      const reg = await loadJettonRegistry(deps.store, master);
      const body =
        buildJettonMetadataJson(master, {
          name: reg?.name,
          symbol: reg?.symbol,
          description: reg?.description,
          image: reg?.image,
          decimals: reg?.decimals,
          kind: 'rmj',
        }) ?? null;

      if (!body) {
        reply.code(503);
        return { error: 'jetton-metadata-not-configured' };
      }

      reply.headers({ ...CORS, 'cache-control': 'public, max-age=60' });
      return body;
    },
  );

  app.get<{ Params: { master: string }; Querystring: { owner?: string } }>(
    '/api/v1/jettons/:master/sync-metadata',
    async (req, reply) => {
      reply.headers(CORS);
      const master = parseJettonMasterParam(req.params.master);
      if (!master) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }

      const baseUri = fixedRmjMetadataUri();
      const indexer = await getToncenterIndexerStatus({
        network: config.TON_NETWORK,
        onChainMaster: master,
        ourMetadataUri: baseUri,
        sampleOwnerAddress: req.query.owner ?? config.ADMIN_WALLET_ADDRESS ?? null,
      });
      const currentUri = indexer.onChainMetadataUri;
      const targetUri = baseUri;
      const needsSync = currentUri !== targetUri;
      const needsBump = !needsSync && indexer.cacheStale && indexer.recommendedAction === 'bump_metadata_uri';

      return {
        onChainMaster: master.toRawString(),
        currentUri,
        targetUri,
        needsSync,
        needsBump,
        bumpTargetUri: indexer.bumpTargetUri,
        toncenterCacheStale: indexer.cacheStale,
        mintlessInfoIndexed: indexer.mintlessInfoIndexed,
        rolling: {
          epoch: deps.state.epoch,
          merkle_root: deps.state.rootHex(),
          note: 'RMJ rolling mint — merkle dump refreshes each epoch; re-index after root updates',
        },
        message: {
          address: jettonMasterFriendly(master),
          amount: toNano('0.05').toString(),
          payload: buildChangeContentPayload(targetUri),
        },
        bumpMessage: indexer.bumpTargetUri
          ? {
              address: jettonMasterFriendly(master),
              amount: toNano('0.05').toString(),
              payload: buildChangeContentPayload(indexer.bumpTargetUri),
            }
          : null,
      };
    },
  );

  app.post<{
    Params: { master: string };
    Body: { action?: string; metadataUri?: string; adminAddress?: string };
  }>('/api/v1/jettons/:master/sync-metadata', async (req, reply) => {
    reply.headers(CORS);
    const master = parseJettonMasterParam(req.params.master);
    if (!master) {
      reply.code(404);
      return { error: 'unknown-jetton-master' };
    }

    const body = (req.body ?? {}) as { action?: string; metadataUri?: string; adminAddress?: string };
    if (body.adminAddress && config.ADMIN_WALLET_ADDRESS?.trim()) {
      try {
        const admin = Address.parse(body.adminAddress);
        const expected = Address.parse(config.ADMIN_WALLET_ADDRESS.trim());
        if (!admin.equals(expected)) {
          reply.code(403);
          return { error: 'admin-mismatch' };
        }
      } catch {
        reply.code(400);
        return { error: 'invalid-admin-address' };
      }
    }

    const baseUri = fixedRmjMetadataUri();
    const action = body.action ?? 'sync';
    const targetUri =
      action === 'bump' ? bumpMetadataUri(body.metadataUri ? String(body.metadataUri) : baseUri) : baseUri;

    return {
      targetUri,
      action,
      message: {
        address: jettonMasterFriendly(master),
        amount: toNano('0.05').toString(),
        payload: buildChangeContentPayload(targetUri),
      },
    };
  });

  logger.info(
    'mintless compliance: GET /api/v1/jettons/:master/compliance, /indexer-status, /jetton.json, /sync-metadata',
  );
}
