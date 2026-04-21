import { Address, beginCell, Cell, toNano } from '@ton/core';
import type { CustomPayloadInfo } from './client';

const OP_JETTON_TRANSFER = 0x0f8a7ea5;

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

/**
 * Sensible default of TON that should be attached to a rolling-claim
 * transfer: enough to cover sender-wallet gas + forward fees + recipient
 * wallet deploy if needed. ~0.1 TON is comfortable.
 */
export const DEFAULT_ATTACHED_TON_NANO = toNano('0.1');
