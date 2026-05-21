import { FastifyInstance } from 'fastify';
import { Address, beginCell, storeStateInit } from '@ton/core';
import { JettonMaster } from '@ton/ton';
import {
  RollingMintlessWallet,
  buildRollingClaimPayload,
  payloadToBase64,
} from '@rmj/contracts';
import { AirdropState } from '../state';
import { GameServer } from '../gameServer';
import { VoucherSigner } from '../signer';
import { logger } from '../logger';
import { config } from '../config';
import { createTonClient } from '../tonClient';
import { configuredJettonMaster, jettonMasterUrlSegment, parseJettonMasterParam } from '../jettonMaster';

export interface ProofApiDeps {
  state: AirdropState;
  gameServer: GameServer;
  signer: VoucherSigner;
}

/** TEP offchain-payloads / ton-community mintless-jetton wallet response (required fields + RMJ extras). */
type MintlessWalletResponse = {
  owner: string;
  jetton_wallet: string;
  custom_payload: string;
  state_init: string | null;
  compressed_info: {
    amount: string;
    start_from: number;
    expired_at: number;
  };
  epoch: number;
  root: string;
};

type OnChainData = {
  jettonWalletRaw: string;
  already: bigint;
  stateInit: string | null;
};

/**
 * Single RPC round-trip: resolves jetton-wallet address, already_claimed, and
 * (when wallet is undeployed) the StateInit needed for the first transfer.
 * Replaces three separate async helpers that each re-fetched the wallet address.
 */
async function resolveOnChainData(owner: Address, signerPubkey: bigint): Promise<OnChainData> {
  const master = configuredJettonMaster();
  if (!master) throw new Error('JETTON_MASTER_ADDRESS not configured');

  const client = createTonClient();
  const masterContract = client.open(JettonMaster.create(master));
  const jettonWalletAddr = await masterContract.getWalletAddress(owner);
  const jettonWalletRaw = jettonWalletAddr.toRawString();
  const st = await client.getContractState(jettonWalletAddr);

  if (st.state === 'active') {
    let already = 0n;
    try {
      const jw = client.open(RollingMintlessWallet.createFromAddress(jettonWalletAddr));
      already = await jw.getAlreadyClaimed();
    } catch (e) {
      logger.warn({ err: e, owner: owner.toString() }, 'mintless: could not read already_claimed, defaulting to 0');
    }
    return { jettonWalletRaw, already, stateInit: null };
  }

  // Wallet not yet deployed — build StateInit for first-transfer deploy.
  const jd = await masterContract.getJettonData();
  const walletCode = jd.walletCode;
  const jw = RollingMintlessWallet.createFromConfig({ owner, master, walletCode, signerPubkey }, walletCode);

  let stateInit: string | null = null;
  if (jw.init?.code && jw.init?.data) {
    const resolved = jw.address.toString({ bounceable: false, urlSafe: true });
    const expected = jettonWalletAddr.toString({ bounceable: false, urlSafe: true });
    if (resolved === expected) {
      const si = beginCell().store(storeStateInit({ code: jw.init.code, data: jw.init.data })).endCell();
      stateInit = si.toBoc().toString('base64');
    } else {
      logger.error(
        { resolved, expected, owner: owner.toString() },
        'mintless: derived StateInit address mismatch — check SIGNER_SEED_HEX vs on-chain master',
      );
    }
  }
  return { jettonWalletRaw, already: 0n, stateInit };
}

async function buildMintlessWalletResponse(
  owner: Address,
  deps: ProofApiDeps,
): Promise<MintlessWalletResponse | null> {
  if (!deps.state.tree.has(owner)) {
    return null;
  }
  const leaf = deps.state.tree.get(owner)!;
  const treeAmt = leaf.cumulativeAmount;

  let onChain: OnChainData;
  try {
    onChain = await resolveOnChainData(owner, deps.signer.publicKeyBigint);
  } catch (e) {
    logger.warn({ err: e, owner: owner.toString() }, 'mintless: on-chain data unavailable, skipping response');
    return null;
  }

  const delta = treeAmt > onChain.already ? treeAmt - onChain.already : 0n;
  if (delta === 0n) {
    return null;
  }

  const voucher = deps.signer.signRoot(deps.state.epoch, deps.state.rootBigint());
  const proof = deps.state.tree.generateProof(owner);
  const customPayload = buildRollingClaimPayload({ proof, voucher });

  return {
    owner: owner.toRawString(),
    jetton_wallet: onChain.jettonWalletRaw,
    custom_payload: payloadToBase64(customPayload),
    state_init: onChain.stateInit,
    compressed_info: {
      amount: delta.toString(),
      start_from: leaf.startFrom,
      expired_at: leaf.expiredAt,
    },
    epoch: deps.state.epoch,
    root: deps.state.rootHex(),
  };
}

/**
 * Mintless proof API (Tonkeeper TEP offchain-payloads, HMSTR / tonapi style).
 *
 * Metadata `custom_payload_api_uri` MUST be the final root, e.g.
 * `https://backend/api/v1/jettons/EQ…master` (no trailing slash).
 * Wallets request `GET {custom_payload_api_uri}/wallet/{owner_raw}`.
 */
export function registerProofApi(app: FastifyInstance, deps: ProofApiDeps): void {
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
      owner = Address.parse(ownerParam);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    // Reject banned users immediately so they cannot claim even if still in the tree.
    const ownerStr = owner.toString({ urlSafe: true, bounceable: false });
    const userRow = await deps.gameServer.store.getUserRow(ownerStr);
    if (userRow?.is_banned) {
      reply.code(403);
      return { error: 'user-banned' };
    }

    const body = await buildMintlessWalletResponse(owner, deps);
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

    return body;
  };

  app.get<{ Params: { master: string; owner: string } }>(
    '/api/v1/jettons/:master/wallet/:owner',
    async (req, reply) => serveMintlessWallet(req.params.master, req.params.owner, reply),
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
    async (req, reply) => serveLegacyMintlessWallet(req.params.owner, reply),
  );

  app.get<{ Params: { owner: string } }>(
    '/api/v1/custom-payload/:owner',
    async (req, reply) => serveLegacyMintlessWallet(req.params.owner, reply),
  );

  app.get<{ Params: { master: string } }>('/api/v1/jettons/:master/state', async (req, reply) => {
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
    };
  });

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
    'mintless api: GET /api/v1/jettons/:master/wallet/:owner, legacy GET /api/v1/custom-payload/wallet/:owner',
  );
}
