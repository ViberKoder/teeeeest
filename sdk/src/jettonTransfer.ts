import { Address, beginCell, Cell, toNano } from '@ton/core';
import type { CustomPayloadInfo, JettonWalletInfo, RMJClient } from './client';

const OP_JETTON_TRANSFER = 0x0f8a7ea5;

/** Standard jetton transfer after balance is already on-chain. */
export const DEFAULT_JETTON_TRANSFER_TON_NANO = toNano('0.05');

/** Mintless claim piggybacked on transfer (tests use ~0.3 TON). */
export const DEFAULT_MINTLESS_SEND_TON_NANO = toNano('0.3');

/** First deploy of sender jetton-wallet + claim + transfer (especially to a new recipient). */
export const DEFAULT_MINTLESS_DEPLOY_SEND_TON_NANO = toNano('0.35');

/** @deprecated Use {@link DEFAULT_MINTLESS_SEND_TON_NANO} — 0.1 TON is too low for claim+deploy. */
export const DEFAULT_ATTACHED_TON_NANO = DEFAULT_MINTLESS_SEND_TON_NANO;

export type MintlessTransferHints = {
  attach_ton: string;
  attach_ton_deploy: string;
  note: string;
};

export const DEFAULT_MINTLESS_TRANSFER_HINTS: MintlessTransferHints = {
  attach_ton: DEFAULT_MINTLESS_SEND_TON_NANO.toString(),
  attach_ton_deploy: DEFAULT_MINTLESS_DEPLOY_SEND_TON_NANO.toString(),
  note: 'TEP-177: wallets attach custom_payload on transfer; claim runs inside the same jetton-wallet tx',
};

/**
 * Estimate TON to attach to the jetton-wallet message (not the whole wallet balance).
 * Tonkeeper draws this from the user's TON balance when sending mintless jettons.
 */
export function estimateMintlessAttachTon(opts: {
  needsDeploy: boolean;
  hasCustomPayload: boolean;
  externalRecipient: boolean;
}): bigint {
  if (!opts.hasCustomPayload && !opts.needsDeploy) {
    return DEFAULT_JETTON_TRANSFER_TON_NANO;
  }
  if (opts.needsDeploy || opts.externalRecipient) {
    return DEFAULT_MINTLESS_DEPLOY_SEND_TON_NANO;
  }
  return DEFAULT_MINTLESS_SEND_TON_NANO;
}

/**
 * Construct the raw body cell of a TEP-74 `transfer` message that carries
 * a rolling-claim custom payload. The returned base64 string is suitable
 * as the `payload` field of a TON Connect `sendTransaction` message.
 */
export function buildJettonTransferBody(params: {
  queryId?: bigint;
  jettonAmountNano: bigint;
  toOwner: Address;
  responseAddress: Address | null;
  forwardTonAmountNano?: bigint;
  /** Custom payload returned by the Proof API (base64 BoC). */
  customPayloadBase64?: string | null;
}): Cell {
  const customPayload = params.customPayloadBase64
    ? Cell.fromBase64(params.customPayloadBase64)
    : null;

  return beginCell()
    .storeUint(OP_JETTON_TRANSFER, 32)
    .storeUint(params.queryId ?? BigInt(Math.floor(Date.now() / 1000)), 64)
    .storeCoins(params.jettonAmountNano)
    .storeAddress(params.toOwner)
    .storeAddress(params.responseAddress)
    .storeMaybeRef(customPayload)
    .storeCoins(params.forwardTonAmountNano ?? 1n)
    .storeMaybeRef(null)
    .endCell();
}

/**
 * Convenience: produce a base64-encoded BoC of the transfer body for
 * inclusion in TON Connect's `sendTransaction` payload.
 */
export function buildJettonTransferPayloadBase64(params: {
  queryId?: bigint;
  jettonAmountNano: bigint;
  toOwner: Address | string;
  responseAddress?: Address | string | null;
  forwardTonAmountNano?: bigint;
  customPayload?: CustomPayloadInfo | string | null;
}): string {
  const toOwner = typeof params.toOwner === 'string' ? Address.parse(params.toOwner) : params.toOwner;
  const responseAddress =
    params.responseAddress === undefined
      ? toOwner
      : params.responseAddress === null
        ? null
        : typeof params.responseAddress === 'string'
          ? Address.parse(params.responseAddress)
          : params.responseAddress;

  const cpBase64 =
    params.customPayload == null
      ? null
      : typeof params.customPayload === 'string'
        ? params.customPayload
        : params.customPayload.customPayload;

  const body = buildJettonTransferBody({
    queryId: params.queryId,
    jettonAmountNano: params.jettonAmountNano,
    toOwner,
    responseAddress,
    forwardTonAmountNano: params.forwardTonAmountNano,
    customPayloadBase64: cpBase64,
  });
  return body.toBoc().toString('base64');
}

export type PreparedMintlessTransfer = {
  jettonWallet: string;
  attachedTonNano: bigint;
  payloadBase64: string;
  stateInitBase64: string | null;
  customPayloadUsed: boolean;
  transferHints: MintlessTransferHints;
};

/**
 * TEP-177 mintless send in **one** jetton-wallet transaction:
 * optional claim via `custom_payload`, then TEP-74 transfer to `toOwner`.
 *
 * Use this from TMA / dApps when the host wallet does not auto-attach mintless proofs.
 * Tonkeeper / MyTonWallet should do the same internally when mintless_info is indexed.
 */
export async function prepareMintlessTransfer(
  rmj: RMJClient,
  params: {
    owner: string;
    toOwner: string;
    jettonAmountNano: bigint;
    responseAddress?: string | null;
    forwardTonAmountNano?: bigint;
    /** Attach claim payload even for 0-jetton self-sync. Default: true when proof exists. */
    includeClaimWhenAvailable?: boolean;
  },
): Promise<PreparedMintlessTransfer> {
  const owner = Address.parse(params.owner);
  const toOwner = Address.parse(params.toOwner);
  const externalRecipient = owner.toRawString() !== toOwner.toRawString();
  const includeClaim = params.includeClaimWhenAvailable !== false;

  const [claim, jw] = await Promise.all([
    includeClaim ? rmj.getCustomPayload(params.owner) : Promise.resolve(null),
    rmj.getJettonWallet(params.owner),
  ]);

  const needsClaim = jw.needsDeploy || claim !== null;
  if (needsClaim && !claim) {
    throw new Error(
      'Mintless proof unavailable — earn balance and wait for Merkle epoch, or try again shortly',
    );
  }

  const customPayloadUsed = claim !== null;
  const attachedTonNano = estimateMintlessAttachTon({
    needsDeploy: jw.needsDeploy,
    hasCustomPayload: customPayloadUsed,
    externalRecipient,
  });

  const payloadBase64 = buildJettonTransferPayloadBase64({
    jettonAmountNano: params.jettonAmountNano,
    toOwner: params.toOwner,
    responseAddress: params.responseAddress,
    forwardTonAmountNano: params.forwardTonAmountNano,
    customPayload: claim,
  });

  return {
    jettonWallet: jw.jettonWallet,
    attachedTonNano,
    payloadBase64,
    stateInitBase64: jw.walletStateInitBase64,
    customPayloadUsed,
    transferHints: DEFAULT_MINTLESS_TRANSFER_HINTS,
  };
}

/** TON Connect envelope for {@link prepareMintlessTransfer}. */
export function buildMintlessTonConnectMessage(
  prepared: PreparedMintlessTransfer,
  validUntilSec: number = Math.floor(Date.now() / 1000) + 600,
): {
  validUntil: number;
  messages: Array<{ address: string; amount: string; payload: string; stateInit?: string }>;
} {
  return {
    validUntil: validUntilSec,
    messages: [
      {
        address: prepared.jettonWallet,
        amount: prepared.attachedTonNano.toString(),
        payload: prepared.payloadBase64,
        stateInit: prepared.stateInitBase64 ?? undefined,
      },
    ],
  };
}
