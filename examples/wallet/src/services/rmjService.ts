import {
  RMJClient,
  buildJettonTransferPayloadBase64,
  DEFAULT_ATTACHED_TON_NANO,
  formatBalanceDisplay,
  type CustomPayloadInfo,
} from '@rmj/sdk';
import { TON_NETWORK } from '../config';
import type { RmjOffchainBalance } from '../types';
import { masterFromCustomPayloadApi } from '../utils/rmjDetect';

const clientCache = new Map<string, RMJClient>();

const EMPTY_OFFCHAIN: RmjOffchainBalance = {
  cumulativeOffchain: '0',
  cumulativeInTree: '0',
  epoch: 0,
  balanceDisplay: 'integer',
  claimable: false,
};

function cacheKey(baseUrl: string, master?: string): string {
  return `${baseUrl}|${master ?? ''}|${TON_NETWORK}`;
}

export function getRmjClient(baseUrl: string, jettonMaster?: string): RMJClient {
  const key = cacheKey(baseUrl, jettonMaster);
  let client = clientCache.get(key);
  if (!client) {
    client = new RMJClient({
      baseUrl,
      jettonMasterAddress: jettonMaster,
      tonNetwork: TON_NETWORK,
    });
    clientCache.set(key, client);
  }
  return client;
}

/** Never null — zeros when backend has no row for this address yet. */
export async function fetchRmjOffchainBalance(
  baseUrl: string,
  owner: string,
  jettonMaster: string,
): Promise<RmjOffchainBalance> {
  const rmj = getRmjClient(baseUrl, jettonMaster);
  try {
    const b = await rmj.getBalance(owner);
    let claimable = false;
    try {
      const payload = await rmj.getCustomPayload(owner, jettonMaster);
      claimable = payload !== null;
    } catch {
      claimable = false;
    }

    return {
      cumulativeOffchain: b.cumulativeOffchain,
      cumulativeInTree: b.cumulativeInTree,
      epoch: b.epoch,
      balanceDisplay: b.balanceDisplay,
      claimable,
    };
  } catch {
    return { ...EMPTY_OFFCHAIN };
  }
}

/**
 * Build any RMJ jetton interaction (send / self-sync / claim).
 * TEP-177: Merkle proof (`custom_payload`) is fetched and attached whenever available.
 */
export async function buildRmjJettonInteraction(
  baseUrl: string,
  owner: string,
  jettonMaster: string,
  params: {
    jettonAmountNano: bigint;
    toOwner: string;
    /** When true, fail if proof is missing but user has in-tree balance (first claim expected). */
    requireProof?: boolean;
  },
): Promise<{
  jettonWallet: string;
  amount: string;
  payload: string;
  stateInit?: string;
  proofAttached: boolean;
}> {
  const rmj = getRmjClient(baseUrl, jettonMaster);

  let proof: CustomPayloadInfo | null = null;
  try {
    proof = await rmj.getCustomPayload(owner, jettonMaster);
  } catch {
    proof = null;
  }

  if (params.requireProof && !proof) {
    throw new Error(
      'Merkle proof ещё недоступен — баланс не в дереве текущей эпохи или ждите обновления root.',
    );
  }

  const jw = await rmj.getJettonWallet(owner);
  const transferPayload = buildJettonTransferPayloadBase64({
    jettonAmountNano: params.jettonAmountNano,
    toOwner: params.toOwner,
    responseAddress: owner,
    forwardTonAmountNano: 1n,
    customPayload: proof?.customPayload ?? null,
  });

  return {
    jettonWallet: jw.jettonWallet,
    amount: DEFAULT_ATTACHED_TON_NANO.toString(),
    payload: transferPayload,
    stateInit: jw.walletStateInitBase64 ?? undefined,
    proofAttached: proof !== null,
  };
}

/** Zero jetton self-transfer + Merkle proof — materializes unclaimed RMJ on-chain. */
export async function buildRmjClaimTransaction(
  baseUrl: string,
  owner: string,
  jettonMaster: string,
): Promise<{
  jettonWallet: string;
  amount: string;
  payload: string;
  stateInit?: string;
}> {
  const tx = await buildRmjJettonInteraction(baseUrl, owner, jettonMaster, {
    jettonAmountNano: 0n,
    toOwner: owner,
    requireProof: true,
  });
  return {
    jettonWallet: tx.jettonWallet,
    amount: tx.amount,
    payload: tx.payload,
    stateInit: tx.stateInit,
  };
}

/** Send RMJ jettons — always tries to attach Merkle proof (piggy-back claim). */
export async function buildMintlessJettonTransfer(
  baseUrl: string,
  owner: string,
  jettonMaster: string,
  params: {
    jettonAmountNano: bigint;
    toOwner: string;
  },
): Promise<{ jettonWallet: string; amount: string; payload: string; stateInit?: string; proofAttached: boolean }> {
  return buildRmjJettonInteraction(baseUrl, owner, jettonMaster, {
    jettonAmountNano: params.jettonAmountNano,
    toOwner: params.toOwner,
    requireProof: false,
  });
}

export function formatRmjAmount(amount: string, mode: RmjOffchainBalance['balanceDisplay']): string {
  return formatBalanceDisplay(amount, mode);
}

export function resolveMasterForMintless(
  jettonMaster: string,
  customPayloadApiUri?: string,
): string {
  const fromApi = customPayloadApiUri ? masterFromCustomPayloadApi(customPayloadApiUri) : null;
  return fromApi ?? jettonMaster;
}
