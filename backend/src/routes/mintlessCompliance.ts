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
  metadataUriPathname,
} from '../toncenterIndexer';
import { epochMetadataUri, metadataUriEpoch } from '../metadataUriUtils';
import { configuredJettonMaster, parseJettonMasterParam } from '../jettonMaster';
import { buildJettonMetadataJson } from '../jettonMetadata';
import { loadJettonRegistry } from '../jettonRegistry';
import { jettonMasterFriendly } from '../jettonAddressPath';
import { logger } from '../logger';

/** Admin `change_content` attach value — keep ≤0.01 TON. */
const METADATA_BUMP_TON = toNano('0.008');

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
        nextMetadataEpoch: deps.state.epoch,
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
          rollingEpoch: deps.state.epoch,
          rollingRootHex: deps.state.rootHex(),
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
      const epochTargetUri = epochMetadataUri(baseUri, deps.state.epoch);
      const indexer = await getToncenterIndexerStatus({
        network: config.TON_NETWORK,
        onChainMaster: master,
        ourMetadataUri: baseUri,
        nextMetadataEpoch: deps.state.epoch,
        sampleOwnerAddress: req.query.owner ?? config.ADMIN_WALLET_ADDRESS ?? null,
      });
      const currentUri = indexer.onChainMetadataUri;
      const onChainEpoch = metadataUriEpoch(currentUri);
      const needsSync =
        !!currentUri && metadataUriPathname(currentUri) !== metadataUriPathname(baseUri);
      const needsBump =
        onChainEpoch !== deps.state.epoch ||
        (!!indexer.bumpTargetUri &&
          (!indexer.mintlessInfoIndexed || indexer.recommendedAction === 'bump_metadata_uri'));

      return {
        onChainMaster: master.toRawString(),
        currentUri,
        targetUri: epochTargetUri,
        onChainMetadataEpoch: onChainEpoch,
        targetMetadataEpoch: deps.state.epoch,
        needsSync,
        needsBump,
        bumpTargetUri: indexer.bumpTargetUri ?? epochTargetUri,
        toncenterCacheStale: indexer.cacheStale,
        mintlessInfoIndexed: indexer.mintlessInfoIndexed,
        rolling: {
          epoch: deps.state.epoch,
          merkle_root: deps.state.rootHex(),
          note:
            'RMJ rolling mint — rootUpdater auto change_content each epoch (?v=epoch + dump ?epoch=&root=)',
        },
        message: {
          address: jettonMasterFriendly(master),
          amount: METADATA_BUMP_TON.toString(),
          payload: buildChangeContentPayload(epochTargetUri),
        },
        bumpMessage: {
          address: jettonMasterFriendly(master),
          amount: METADATA_BUMP_TON.toString(),
          payload: buildChangeContentPayload(indexer.bumpTargetUri ?? epochTargetUri),
        },
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
      action === 'bump'
        ? bumpMetadataUri(body.metadataUri ? String(body.metadataUri) : baseUri)
        : epochMetadataUri(baseUri, deps.state.epoch);

    return {
      targetUri,
      action,
      message: {
        address: jettonMasterFriendly(master),
        amount: METADATA_BUMP_TON.toString(),
        payload: buildChangeContentPayload(targetUri),
      },
    };
  });

  logger.info(
    'mintless compliance: GET /api/v1/jettons/:master/compliance, /indexer-status, /jetton.json, /sync-metadata',
  );
}
