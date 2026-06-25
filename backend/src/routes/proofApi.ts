import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import { AirdropState } from '../state';
import { GameServer } from '../gameServer';
import { VoucherSigner } from '../signer';
import { logger } from '../logger';
import { config } from '../config';
import { jettonMasterUrlSegment, parseJettonMasterParam } from '../jettonMaster';
import {
  listWalletClaimBatch,
  buildMintlessWalletResponse,
  parseWalletBatchCount,
  parseWalletBatchNextFrom,
} from '../mintlessClaimHelpers';
import { serializeMintlessWalletResponse } from '../mintlessWalletFormat';

export interface ProofApiDeps {
  state: AirdropState;
  gameServer: GameServer;
  signer: VoucherSigner;
}

const MINTLESS_CORS = {
  'access-control-allow-origin': '*',
};

const WALLET_RESPONSE_HEADERS = {
  ...MINTLESS_CORS,
  'cache-control': 'no-store, no-cache, must-revalidate',
};

/** Wallets poll Proof API on every transfer draft — avoid shared-proxy rate-limit false negatives. */
const PROOF_ROUTE_OPTS = { config: { rateLimit: false } };

function parseOwnerParam(ownerParam: string): Address {
  const raw = decodeURIComponent(ownerParam.trim());
  return Address.parse(raw);
}

/**
 * Mintless proof API (Tonkeeper TEP offchain-payloads, HMSTR / tonapi style).
 *
 * Metadata `custom_payload_api_uri` MUST be the final root, e.g.
 * `https://backend/api/v1/jettons/EQ…master` (no trailing slash).
 * Wallets request `GET {custom_payload_api_uri}/wallet/{owner_raw}`.
 */
export function registerProofApi(app: FastifyInstance, deps: ProofApiDeps): void {
  const claimDeps = { state: deps.state, signer: deps.signer };

  const serveMerkleDump = async (masterParam: string, reply: { code: (n: number) => void; header: (k: string, v: string) => void }) => {
    const master = parseJettonMasterParam(masterParam);
    if (!master) {
      reply.code(404);
      return { error: 'unknown-jetton-master' };
    }
    const boc = deps.state.tree.toCell().toBoc();
    reply.header('content-type', 'application/octet-stream');
    reply.header('cache-control', 'public, max-age=60');
    reply.header('access-control-allow-origin', '*');
    return Buffer.from(boc);
  };

  const serveMintlessWallet = async (
    masterParam: string,
    ownerParam: string,
    reply: { code: (n: number) => void },
  ) => {
    if (!parseJettonMasterParam(masterParam)) {
      reply.code(404);
      return { error: 'unknown-jetton-master' };
    }

    let owner: Address;
    try {
      owner = parseOwnerParam(ownerParam);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    try {
      const body = await buildMintlessWalletResponse(owner, claimDeps);
      if (!body) {
        const inTree = deps.state.tree.has(owner);
        logger.debug(
          {
            address: owner.toString({ urlSafe: true, bounceable: false }),
            epoch: deps.state.epoch,
            tree_users: deps.state.tree.size,
            in_tree: inTree,
          },
          'mintless: address not in tree or nothing to claim',
        );
        reply.code(404);
        return inTree ? { error: 'nothing-to-claim' } : { error: 'address-not-in-tree' };
      }

      return serializeMintlessWalletResponse(body);
    } catch (e) {
      logger.error({ err: e, owner: owner.toString() }, 'mintless: wallet response build failed');
      reply.code(503);
      return { error: 'proof-api-unavailable', hint: 'retry shortly — wallet may show InsufficientBalance until this succeeds' };
    }
  };

  app.get<{ Params: { master: string; owner: string } }>(
    '/api/v1/jettons/:master/wallet/:owner',
    PROOF_ROUTE_OPTS,
    async (req, reply) => {
      reply.headers(WALLET_RESPONSE_HEADERS);
      return serveMintlessWallet(req.params.master, req.params.owner, reply);
    },
  );

  /** v2 alias — bust MyTonWallet proxy cache after payload format changes. */
  app.get<{ Params: { master: string; owner: string } }>(
    '/api/v2/jettons/:master/wallet/:owner',
    PROOF_ROUTE_OPTS,
    async (req, reply) => {
      reply.headers(WALLET_RESPONSE_HEADERS);
      return serveMintlessWallet(req.params.master, req.params.owner, reply);
    },
  );

  /** Legacy URI still returned by TonAPI cache for some jettons */
  const serveLegacyMintlessWallet = async (
    ownerParam: string,
    reply: { code: (n: number) => void },
  ) => {
    const seg = jettonMasterUrlSegment();
    if (!seg) {
      reply.code(503);
      return { error: 'jetton-master-not-configured' };
    }
    return serveMintlessWallet(seg, ownerParam, reply);
  };

  app.get<{ Params: { owner: string } }>(
    '/api/v1/custom-payload/wallet/:owner',
    PROOF_ROUTE_OPTS,
    async (req, reply) => {
      reply.headers(MINTLESS_CORS);
      return serveLegacyMintlessWallet(req.params.owner, reply);
    },
  );

  app.get<{ Params: { owner: string } }>(
    '/api/v1/custom-payload/:owner',
    PROOF_ROUTE_OPTS,
    async (req, reply) => {
      reply.headers(MINTLESS_CORS);
      return serveLegacyMintlessWallet(req.params.owner, reply);
    },
  );

  /** TEP-176 batch (Tonkeeper claim-api-go: owner + compressed_info, count 5–10000). */
  app.get<{
    Params: { master: string };
    Querystring: { next_from?: string; count?: string };
  }>('/api/v1/jettons/:master/wallets', PROOF_ROUTE_OPTS, async (req, reply) => {
    reply.headers(MINTLESS_CORS);
    const master = parseJettonMasterParam(req.params.master);
    if (!master) {
      reply.code(404);
      return { error: 'unknown-jetton-master' };
    }

    let nextFrom: Address;
    try {
      nextFrom = parseWalletBatchNextFrom(req.query.next_from);
    } catch {
      reply.code(400);
      return { error: 'invalid-next_from', hint: 'Use raw 0:… address' };
    }

    const count = parseWalletBatchCount(req.query.count);
    return listWalletClaimBatch(claimDeps, nextFrom, count);
  });

  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/merkle-dump.boc',
    PROOF_ROUTE_OPTS,
    async (req, reply) => serveMerkleDump(req.params.master, reply),
  );

  /** Alias without `.boc` suffix (mintless-jetton-test / Toncenter compatibility). */
  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/merkle-dump',
    PROOF_ROUTE_OPTS,
    async (req, reply) => serveMerkleDump(req.params.master, reply),
  );

  /** claim-api-go GET / — wallets discover TEP offchain-payloads docs. */
  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master',
    PROOF_ROUTE_OPTS,
    async (req, reply) => {
      reply.headers(MINTLESS_CORS);
      const master = parseJettonMasterParam(req.params.master);
      if (!master) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }
      reply.header('content-type', 'text/plain; charset=utf-8');
      return `RMJ mintless Proof API for ${master.toString({ urlSafe: true, bounceable: false })}\n\nTEP offchain-payloads:\n  GET /wallet/{owner_raw}\n  GET /wallets?next_from=&count=\n  GET /state\n  GET /merkle-dump.boc\n`;
    },
  );

  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/state',
    PROOF_ROUTE_OPTS,
    async (req, reply) => {
      reply.headers(MINTLESS_CORS);
      const master = parseJettonMasterParam(req.params.master);
      if (!master) {
        reply.code(404);
        return { error: 'unknown-jetton-master' };
      }
      return {
        total_wallets: deps.state.tree.size,
        master_address: master.toRawString(),
        /** TEP offchain-payloads `/state` — same master as in metadata `custom_payload_api_uri`. */
        address: master.toRawString(),
        /** RMJ rolling extension — current Merkle epoch (root updates on-chain). */
        epoch: deps.state.epoch,
        merkle_root: deps.state.rootHex(),
      };
    },
  );

  app.get<{ Params: { address: string } }>('/api/v1/balance/:address', async (req, reply) => {
    let addr: Address;
    try {
      addr = Address.parse(req.params.address);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }
    const cumulative = await deps.gameServer.getCumulative(addr);
    const leaf = deps.state.tree.get(addr);
    return {
      address: addr.toString({ urlSafe: true, bounceable: false }),
      cumulative_offchain: cumulative.toString(),
      cumulative_in_tree: leaf?.cumulativeAmount.toString() ?? '0',
      epoch: deps.state.epoch,
      balance_display: config.PUBLIC_BALANCE_DISPLAY,
    };
  });

  app.get('/api/v1/status', async () => ({
    epoch: deps.state.epoch,
    root: deps.state.rootHex(),
    tree_size: deps.state.tree.size,
    signer: deps.signer.publicKeyHex,
    balance_display: config.PUBLIC_BALANCE_DISPLAY,
  }));

  logger.info(
    'mintless api: GET /api/v1|v2/jettons/:master/wallet/:owner, /wallets, /merkle-dump[.boc], legacy /api/v1/custom-payload/wallet/:owner',
  );
}
