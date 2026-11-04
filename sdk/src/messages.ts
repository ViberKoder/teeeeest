import { Address, beginCell, Cell, StateInit, storeStateInit, toNano } from '@ton/core';
import { Op } from './ops';

/** TON the user attaches; whatever is not used comes back as excess. */
export const Attach = {
  transfer: toNano('0.1'),
  claim: toNano('0.08'),
  /** claim + pass on in one request: the claim round trip and the transfer; what is not used comes back */
  claimAndSend: toNano('0.2'),
  burn: toNano('0.1'),
} as const;

/** TEP-74 forward_payload:(Either Cell ^Cell) */
function eitherPayload(payload?: Cell | null) {
  const b = beginCell();
  if (payload) b.storeBit(1).storeRef(payload);
  else b.storeBit(0);
  return b;
}

/** Text comment payload understood by every TON wallet. */
export const commentPayload = (text: string): Cell => beginCell().storeUint(0, 32).storeStringTail(text).endCell();

// ----------------------------------------------------------------- wallet

export function transferBody(p: {
  queryId?: bigint;
  amount: bigint;
  to: Address;
  responseTo: Address;
  forwardTon?: bigint;
  forwardPayload?: Cell | null;
}): Cell {
  return beginCell()
    .storeUint(Op.transfer, 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.amount)
    .storeAddress(p.to)
    .storeAddress(p.responseTo)
    .storeMaybeRef(null) // custom_payload — not used: claims have their own message
    .storeCoins(p.forwardTon ?? 0n)
    .storeBuilder(eitherPayload(p.forwardPayload))
    .endCell();
}

export function burnBody(p: { queryId?: bigint; amount: bigint; responseTo: Address }): Cell {
  return beginCell()
    .storeUint(Op.burn, 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.amount)
    .storeAddress(p.responseTo)
    .storeMaybeRef(null)
    .endCell();
}

/**
 * Ask your own jetton-wallet to claim `cumulative`. `root` is the publisher-signed root the proof opens to
 * (see `signedRootCell`); the minter checks the signature and the proof itself.
 */
export function askToClaimBody(p: { queryId?: bigint; cumulative: bigint; proof: Cell; root: Cell; next?: Cell | null }): Cell {
  return beginCell()
    .storeUint(Op.askToClaim, 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.cumulative)
    .storeRef(p.proof)
    .storeRef(p.root)
    .storeMaybeRef(p.next ?? null)
    .endCell();
}

/**
 * "Claim and send": what the player's jetton wallet should pass on the moment the claim is credited, in the same flow.
 * Best effort on the contract side — if the balance or the attached TON does not cover it, the claim is still credited.
 */
export function transferIntent(p: { amount: bigint; to: Address; excessesTo?: Address | null; forwardTon?: bigint; comment?: string }): Cell {
  const payload = p.comment
    ? beginCell().storeBit(1).storeRef(beginCell().storeUint(0, 32).storeStringTail(p.comment).endCell())
    : beginCell().storeBit(0);
  return beginCell()
    .storeCoins(p.amount)
    .storeAddress(p.to)
    .storeAddress(p.excessesTo ?? null)
    .storeCoins(p.forwardTon ?? 0n)
    .storeBuilder(payload)
    .endCell();
}

export const topUpBody = (): Cell => beginCell().storeUint(Op.topUp, 32).endCell();

// ----------------------------------------------------------------- minter

export const changePublisherKeyBody = (newKey: Buffer): Cell =>
  beginCell().storeUint(Op.changePublisherKey, 32).storeUint(0, 64).storeBuffer(newKey, 32).endCell();

export const setLimitsBody = (p: { maxGrowth: bigint; periodSeconds: number; walletDaily: bigint; walletBurst: bigint }): Cell =>
  beginCell().storeUint(Op.setLimits, 32).storeUint(0, 64).storeCoins(p.maxGrowth).storeUint(p.periodSeconds, 32).storeCoins(p.walletDaily).storeCoins(p.walletBurst).endCell();

/**
 * Proof that the publisher key signed two roots an honest publisher never would (same seq / smaller later total / an owner's amount going
 * down). Anyone can send it; the minter checks it and freezes the key.
 */
export const proveFraudBody = (p: { a: Cell; b: Cell; owner?: Address | null; cumA?: bigint; cumB?: bigint; proofA?: Cell | null; proofB?: Cell | null }): Cell =>
  beginCell()
    .storeUint(Op.proveFraud, 32)
    .storeUint(0, 64)
    .storeRef(p.a)
    .storeRef(p.b)
    .storeAddress(p.owner ?? null)
    .storeCoins(p.cumA ?? 0n)
    .storeCoins(p.cumB ?? 0n)
    .storeMaybeRef(p.proofA ?? null)
    .storeMaybeRef(p.proofB ?? null)
    .endCell();

export const changeMetadataBody = (metadata: Cell): Cell =>
  beginCell().storeUint(Op.changeMetadata, 32).storeUint(0, 64).storeRef(metadata).endCell();

export const dropAdminBody = (): Cell => beginCell().storeUint(Op.dropAdmin, 32).storeUint(0, 64).endCell();

/** StateInit as base64 BoC (what TON Connect and most SDKs expect). */
export const stateInitBase64 = (init: StateInit): string =>
  beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64');
