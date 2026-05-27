import type { RMJClient, CustomPayloadInfo, JettonWalletInfo } from './client';
import {
  buildJettonTransferPayloadBase64,
  DEFAULT_ATTACHED_TON_NANO,
} from './jettonTransfer';

export interface RollingClaimTonConnectMessage {
  address: string;
  amount: string;
  payload: string;
  stateInit?: string;
}

export interface PrepareRollingClaimResult {
  tonConnectMessage: RollingClaimTonConnectMessage;
  claim: CustomPayloadInfo;
  jettonWallet: JettonWalletInfo;
}

export interface PrepareRollingClaimOptions {
  /** Jetton amount in the transfer (default 0 = sync-only claim). */
  jettonAmountNano?: bigint;
  /** Recipient owner address (default: same as `ownerAddress`). */
  toOwner?: string;
  /** TON attached to jetton-wallet message (default ~0.1 TON). */
  attachedTonNano?: bigint;
}

/**
 * Build a TON Connect message that runs rolling_claim via TEP-74 self-transfer.
 * Returns null when Proof API has nothing to claim (404 / zero delta).
 */
export async function prepareRollingClaimSync(
  client: RMJClient,
  ownerAddress: string,
  options: PrepareRollingClaimOptions = {},
): Promise<PrepareRollingClaimResult | null> {
  const claim = await client.getCustomPayload(ownerAddress);
  if (!claim) {
    return null;
  }

  const jettonWallet = await client.getJettonWallet(ownerAddress);
  const toOwner = options.toOwner ?? ownerAddress;
  const jettonAmountNano = options.jettonAmountNano ?? 0n;
  const attached = options.attachedTonNano ?? DEFAULT_ATTACHED_TON_NANO;

  const payload = buildJettonTransferPayloadBase64({
    jettonAmountNano,
    toOwner,
    responseAddress: ownerAddress,
    forwardTonAmountNano: 1n,
    customPayload: claim,
  });

  const stateInit =
    jettonWallet.walletStateInitBase64 ?? claim.stateInit ?? undefined;

  return {
    tonConnectMessage: {
      address: jettonWallet.jettonWallet,
      amount: attached.toString(),
      payload,
      ...(stateInit ? { stateInit } : {}),
    },
    claim,
    jettonWallet,
  };
}
