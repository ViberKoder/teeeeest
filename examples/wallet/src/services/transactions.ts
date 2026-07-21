import { Address, beginCell, toNano } from '@ton/core';
import { buildJettonTransferPayloadBase64 } from '@rmj/sdk';

/** Simple TON transfer payload (comment optional). */
export function buildTonTransferPayload(comment?: string): string {
  if (!comment?.trim()) return '';
  const cell = beginCell()
    .storeUint(0, 32)
    .storeStringTail(comment.trim().slice(0, 120))
    .endCell();
  return cell.toBoc().toString('base64');
}

export function buildStandardJettonTransfer(params: {
  jettonAmountNano: bigint;
  toOwner: string;
  responseAddress: string;
}): string {
  return buildJettonTransferPayloadBase64({
    jettonAmountNano: params.jettonAmountNano,
    toOwner: params.toOwner,
    responseAddress: params.responseAddress,
    forwardTonAmountNano: 1n,
    customPayload: null,
  });
}

export function defaultJettonAttachedTon(): string {
  return toNano('0.05').toString();
}

export function defaultTonSendAmount(): string {
  return toNano('0.1').toString();
}

export function parseRecipient(input: string): string {
  return Address.parse(input.trim()).toString({ urlSafe: true, bounceable: true });
}
