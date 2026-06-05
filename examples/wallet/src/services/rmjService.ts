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

export async function fetchRmjOffchainBalance(
  baseUrl: string,
  owner: string,
  jettonMaster: string,
): Promise<RmjOffchainBalance | null> {
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
    return null;
  }
}

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
  const rmj = getRmjClient(baseUrl, jettonMaster);
  const proof = await rmj.getCustomPayload(owner, jettonMaster);
  if (!proof) {
    throw new Error('Nothing to claim — balance not in Merkle tree or epoch pending.');
  }

  const jw = await rmj.getJettonWallet(owner);
  const transferPayload = buildJettonTransferPayloadBase64({
    jettonAmountNano: 0n,
    toOwner: owner,
    responseAddress: owner,
    forwardTonAmountNano: 1n,
    customPayload: proof,
  });

  return {
    jettonWallet: jw.jettonWallet,
    amount: DEFAULT_ATTACHED_TON_NANO.toString(),
    payload: transferPayload,
    stateInit: jw.walletStateInitBase64 ?? undefined,
  };
}

/**
 * Build a jetton transfer with mintless custom_payload attached (TEP-177 behavior).
 * Wallets like Tonkeeper do this automatically; we replicate it for RMJ sends.
 */
export async function buildMintlessJettonTransfer(
  baseUrl: string,
  owner: string,
  jettonMaster: string,
  params: {
    jettonAmountNano: bigint;
    toOwner: string;
    customPayloadApiUri?: string;
  },
): Promise<{ jettonWallet: string; amount: string; payload: string }> {
  const rmj = getRmjClient(baseUrl, jettonMaster);
  let customPayload: CustomPayloadInfo | null = null;
  try {
    customPayload = await rmj.getCustomPayload(owner, jettonMaster);
  } catch {
    customPayload = null;
  }

  const jw = await rmj.getJettonWallet(owner);
  const transferPayload = buildJettonTransferPayloadBase64({
    jettonAmountNano: params.jettonAmountNano,
    toOwner: params.toOwner,
    responseAddress: owner,
    forwardTonAmountNano: 1n,
    customPayload: customPayload?.customPayload ?? null,
  });

  return {
    jettonWallet: jw.jettonWallet,
    amount: DEFAULT_ATTACHED_TON_NANO.toString(),
    payload: transferPayload,
  };
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
