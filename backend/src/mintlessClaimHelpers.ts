import { Address, beginCell, storeStateInit, toNano } from '@ton/core';
import { JettonMaster } from '@ton/ton';
import {
  RollingMintlessWallet,
  buildStandardMerkleClaimPayload,
  payloadToBase64,
} from '@rmj/contracts';
import type { AirdropState } from './state';
import type { VoucherSigner } from './signer';
import { configuredJettonMaster } from './jettonMaster';
import { createTonClient } from './tonClient';
import { logger } from './logger';
import {
  compareOwnerAddress,
  sortOwners,
  WALLET_BATCH_MAX,
  WALLET_BATCH_MIN,
} from './mintlessBatchUtils';
import { formatCompressedInfo, isWithinClaimWindow, type MintlessCompressedInfo } from './mintlessWalletFormat';

export {
  WALLET_BATCH_MIN,
  WALLET_BATCH_MAX,
  WALLET_BATCH_DEFAULT,
  WALLET_BATCH_ZERO,
  compareOwnerAddress,
  sortOwners,
  parseWalletBatchCount,
  parseWalletBatchNextFrom,
} from './mintlessBatchUtils';

/** TEP offchain-payloads / tonkeeper claim-api-go wallet response. */
export type MintlessWalletResponse = {
  owner: string;
  jetton_wallet: string;
  custom_payload: string;
  state_init: string | null;
  compressed_info: MintlessCompressedInfo;
  epoch?: number;
  root?: string;
  /** Hints for TEP-177 wallets / dApps building mintless transfers (claim + send in one tx). */
  transfer_hints?: {
    attach_ton: string;
    attach_ton_deploy: string;
    note: string;
  };
};

/** TEP-176 batch item (Tonkeeper claim-api-go /wallets). */
export type MintlessWalletBatchItem = {
  owner: string;
  compressed_info: MintlessCompressedInfo;
};

export { formatCompressedInfo, isWithinClaimWindow } from './mintlessWalletFormat';

async function resolveMasterSignerPubkey(
  master: Address,
  fallbackSignerPubkey: bigint,
): Promise<bigint> {
  try {
    const client = createTonClient();
    const res = await client.runMethod(master, 'get_signer_pubkey');
    return BigInt(res.stack.readBigNumber().toString());
  } catch (e) {
    logger.warn({ err: e, master: master.toString() }, 'mintless: could not read on-chain signer pubkey');
    return fallbackSignerPubkey;
  }
}

async function readOnChainAlreadyClaimed(owner: Address): Promise<bigint | null> {
  const master = configuredJettonMaster();
  if (!master) return null;
  try {
    const client = createTonClient();
    const masterContract = client.open(JettonMaster.create(master));
    const jettonWalletAddr = await masterContract.getWalletAddress(owner);
    const st = await client.getContractState(jettonWalletAddr);
    if (st.state !== 'active') {
      return 0n;
    }
    const jw = client.open(RollingMintlessWallet.createFromAddress(jettonWalletAddr));
    return await jw.getAlreadyClaimed();
  } catch (e) {
    logger.warn({ err: e, owner: owner.toString() }, 'mintless: could not read on-chain already_claimed');
    return null;
  }
}

async function resolveJettonWalletRaw(owner: Address, signerPubkey: bigint): Promise<string> {
  const master = configuredJettonMaster();
  if (!master) {
    throw new Error('JETTON_MASTER_ADDRESS not configured');
  }
  const resolvedSignerPubkey = await resolveMasterSignerPubkey(master, signerPubkey);
  try {
    const client = createTonClient();
    const masterContract = client.open(JettonMaster.create(master));
    return (await masterContract.getWalletAddress(owner)).toRawString();
  } catch (e) {
    logger.warn({ err: e, owner: owner.toString() }, 'mintless: RPC jetton wallet address failed, using local derive');
    const client = createTonClient();
    const masterContract = client.open(JettonMaster.create(master));
    const jd = await masterContract.getJettonData();
    const jw = RollingMintlessWallet.createFromConfig(
      { owner, master, walletCode: jd.walletCode, signerPubkey: resolvedSignerPubkey },
      jd.walletCode,
    );
    return jw.address.toRawString();
  }
}

async function maybeJettonWalletStateInitBase64(
  owner: Address,
  signerPubkey: bigint,
): Promise<string | null> {
  const master = configuredJettonMaster();
  if (!master) return null;
  const resolvedSignerPubkey = await resolveMasterSignerPubkey(master, signerPubkey);
  try {
    const client = createTonClient();
    const masterContract = client.open(JettonMaster.create(master));
    const jettonWalletAddr = await masterContract.getWalletAddress(owner);
    const st = await client.getContractState(jettonWalletAddr);
    if (st.state === 'active') {
      return null;
    }
    const jd = await masterContract.getJettonData();
    const walletCode = jd.walletCode;
    const jw = RollingMintlessWallet.createFromConfig(
      { owner, master, walletCode, signerPubkey: resolvedSignerPubkey },
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
        'mintless: derived StateInit address mismatch — check SIGNER_SEED_HEX vs on-chain master',
      );
      return null;
    }
    return si.toBoc().toString('base64');
  } catch (e) {
    logger.warn({ err: e, owner: owner.toString() }, 'mintless: could not build jetton wallet state_init');
    return null;
  }
}

export type MintlessClaimDeps = {
  state: AirdropState;
  signer: VoucherSigner;
};

/**
 * Build TEP-176 / Tonkeeper claim-api-go wallet claim for one owner.
 * `compressed_info.amount` is the Merkle leaf cumulative (claim-api style).
 * `custom_payload` uses TEP-177 `merkle_airdrop_claim` (`0x0df602d6`) when claimable.
 */
export async function buildMintlessWalletResponse(
  owner: Address,
  deps: MintlessClaimDeps,
  opts?: { includeRollingExtras?: boolean },
): Promise<MintlessWalletResponse | null> {
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

  const proof = deps.state.tree.generateProof(owner);
  const withinWindow = isWithinClaimWindow(leaf.startFrom, leaf.expiredAt);
  const customPayload = withinWindow
    ? payloadToBase64(buildStandardMerkleClaimPayload(proof))
    : '';
  const stateInit = await maybeJettonWalletStateInitBase64(owner, deps.signer.publicKeyBigint);
  const jettonWallet = await resolveJettonWalletRaw(owner, deps.signer.publicKeyBigint);

  const body: MintlessWalletResponse = {
    owner: owner.toRawString(),
    jetton_wallet: jettonWallet,
    custom_payload: customPayload,
    state_init: stateInit,
    compressed_info: formatCompressedInfo({
      amount: treeAmt,
      startFrom: leaf.startFrom,
      expiredAt: leaf.expiredAt,
    }),
    transfer_hints: {
      attach_ton: toNano('0.3').toString(),
      attach_ton_deploy: toNano('0.35').toString(),
      note: 'TEP-177 merkle_airdrop_claim (0x0df602d6): attach custom_payload on transfer; claim and send in one jetton-wallet tx',
    },
  };

  if (opts?.includeRollingExtras !== false) {
    body.epoch = deps.state.epoch;
    body.root = deps.state.rootHex();
  }

  return body;
}

/** TEP-176 GET /wallets?next_from=&count= — batch for Toncenter mintless_info indexing. */
export async function listWalletClaimBatch(
  deps: MintlessClaimDeps,
  nextFrom: Address,
  count: number,
): Promise<{ wallets: MintlessWalletBatchItem[]; next_from: string }> {
  const dict = deps.state.tree.inner();
  const owners = sortOwners(dict.keys());
  const limit = Math.min(Math.max(count, WALLET_BATCH_MIN), WALLET_BATCH_MAX);
  const startIdx = owners.findIndex((owner) => compareOwnerAddress(owner, nextFrom) >= 0);

  if (startIdx === -1) {
    return { wallets: [], next_from: '' };
  }

  const batchOwners = owners.slice(startIdx, startIdx + limit);
  const wallets: MintlessWalletBatchItem[] = batchOwners.map((owner) => {
    const leaf = deps.state.tree.get(owner)!;
    return {
      owner: owner.toRawString(),
      compressed_info: formatCompressedInfo({
        amount: leaf.cumulativeAmount,
        startFrom: leaf.startFrom,
        expiredAt: leaf.expiredAt,
      }),
    };
  });

  const nextIdx = startIdx + limit;
  const next_from = nextIdx < owners.length ? owners[nextIdx]!.toRawString() : '';

  return { wallets, next_from };
}
