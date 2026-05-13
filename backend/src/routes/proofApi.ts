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

export interface ProofApiDeps {
  state: AirdropState;
  gameServer: GameServer;
  signer: VoucherSigner;
}

type CustomPayloadBody = {
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

async function readOnChainAlreadyClaimed(owner: Address): Promise<bigint | null> {
  const masterRaw = config.JETTON_MASTER_ADDRESS?.trim();
  if (!masterRaw) return null;
  try {
    const client = createTonClient();
    const masterAddr = Address.parse(masterRaw);
    const master = client.open(JettonMaster.create(masterAddr));
    const jettonWalletAddr = await master.getWalletAddress(owner);
    const st = await client.getContractState(jettonWalletAddr);
    if (st.state !== 'active') {
      return 0n;
    }
    const jw = client.open(RollingMintlessWallet.createFromAddress(jettonWalletAddr));
    return await jw.getAlreadyClaimed();
  } catch (e) {
    logger.warn({ err: e, owner: owner.toString() }, 'custom-payload: could not read on-chain already_claimed');
    return null;
  }
}

async function maybeJettonWalletStateInitBase64(
  owner: Address,
  signerPubkey: bigint,
): Promise<string | null> {
  const masterRaw = config.JETTON_MASTER_ADDRESS?.trim();
  if (!masterRaw) return null;
  try {
    const client = createTonClient();
    const masterAddr = Address.parse(masterRaw);
    const master = client.open(JettonMaster.create(masterAddr));
    const jettonWalletAddr = await master.getWalletAddress(owner);
    const st = await client.getContractState(jettonWalletAddr);
    if (st.state === 'active') {
      return null;
    }
    const jd = await master.getJettonData();
    const walletCode = jd.walletCode;
    const jw = RollingMintlessWallet.createFromConfig(
      {
        owner,
        master: masterAddr,
        walletCode,
        signerPubkey,
      },
      walletCode,
    );
    if (!jw.init?.code || !jw.init?.data) {
      return null;
    }
    const si = beginCell().store(storeStateInit({ code: jw.init.code, data: jw.init.data })).endCell();
    const resolved = jw.address.toString({ bounceable: false, urlSafe: true });
    const expected = jettonWalletAddr.toString({ bounceable: false, urlSafe: true });
    if (resolved !== expected) {
      logger.error(
        { resolved, expected, owner: owner.toString() },
        'custom-payload: derived StateInit address mismatch — check SIGNER_SEED_HEX vs on-chain master',
      );
      return null;
    }
    return si.toBoc().toString('base64');
  } catch (e) {
    logger.warn({ err: e, owner: owner.toString() }, 'custom-payload: could not build jetton wallet state_init');
    return null;
  }
}

async function buildCustomPayloadBody(owner: Address, deps: ProofApiDeps): Promise<CustomPayloadBody | null> {
  if (!deps.state.tree.has(owner)) {
    return null;
  }
  const leaf = deps.state.tree.get(owner)!;
  const treeAmt = leaf.cumulativeAmount;

  const onChain = await readOnChainAlreadyClaimed(owner);
  const already = onChain ?? 0n;
  const delta = treeAmt > already ? treeAmt - already : 0n;

  if (delta === 0n) {
    return null;
  }

  const voucher = deps.signer.signRoot(deps.state.epoch, deps.state.rootBigint());
  const proof = deps.state.tree.generateProof(owner);
  const customPayload = buildRollingClaimPayload({ proof, voucher });

  const stateInit = await maybeJettonWalletStateInitBase64(owner, deps.signer.publicKeyBigint);

  return {
    custom_payload: payloadToBase64(customPayload),
    state_init: stateInit,
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
 * Public Proof API. Matches TEP-177 `custom_payload_api_uri` (`GET …/custom-payload/:owner`)
 * and ton-wallet / mintless `GET …/custom-payload/wallet/:owner`.
 *
 * `compressed_info.amount` is the unclaimed delta (tree cumulative minus on-chain
 * `already_claimed`) when `JETTON_MASTER_ADDRESS` is set and RPC succeeds; otherwise
 * on-chain is treated as 0 (undeployed jetton-wallet).
 */
export function registerProofApi(app: FastifyInstance, deps: ProofApiDeps): void {
  const serveCustomPayload = async (addressParam: string, reply: { code: (n: number) => void }) => {
    let owner: Address;
    try {
      owner = Address.parse(addressParam);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    const body = await buildCustomPayloadBody(owner, deps);
    if (!body) {
      const inTree = deps.state.tree.has(owner);
      logger.debug(
        {
          address: owner.toString({ urlSafe: true, bounceable: false }),
          epoch: deps.state.epoch,
          tree_users: deps.state.tree.size,
          in_tree: inTree,
        },
        'custom-payload: address not in tree or nothing to claim',
      );
      reply.code(404);
      return inTree ? { error: 'nothing-to-claim' } : { error: 'address-not-in-tree' };
    }

    return body;
  };

  app.get<{ Params: { address: string } }>(
    '/api/v1/custom-payload/wallet/:address',
    async (req, reply) => serveCustomPayload(req.params.address, reply),
  );

  app.get<{ Params: { address: string } }>(
    '/api/v1/custom-payload/:address',
    async (req, reply) => serveCustomPayload(req.params.address, reply),
  );

  /**
   * Lightweight "what do we know about this address" endpoint, used by TMAs
   * and bots to display a growing balance in their own UI.
   */
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

  /**
   * Health + state introspection for dashboards / monitoring.
   */
  app.get('/api/v1/status', async () => ({
    epoch: deps.state.epoch,
    root: deps.state.rootHex(),
    tree_size: deps.state.tree.size,
    signer: deps.signer.publicKeyHex,
    balance_display: config.PUBLIC_BALANCE_DISPLAY,
  }));

  logger.info(
    'proof api routes registered: GET /api/v1/custom-payload/:address, GET /api/v1/custom-payload/wallet/:address',
  );
}
