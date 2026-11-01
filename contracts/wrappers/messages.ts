import { Address, beginCell, Cell, contractAddress, toNano } from '@ton/core';
import { Op } from './OpCodes';

/**
 * Pure message builders (only @ton/core), shared by the contract tests, the
 * server tests and the wallet app so nobody re-implements a layout.
 */

/** TON the sender attaches; whatever is not spent comes back as excess. */
export const Attach = {
  transfer: toNano('0.1'),
  transferWithClaim: toNano('0.15'),
  claim: toNano('0.1'),
} as const;

/** TEP-74 forward_payload:(Either Cell ^Cell) */
export function eitherPayload(payload?: Cell | null) {
  const b = beginCell();
  if (payload) b.storeBit(1).storeRef(payload);
  else b.storeBit(0);
  return b;
}

/** Text comment payload (op 0 + utf8) understood by every TON wallet. */
export function commentPayload(text: string): Cell {
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell();
}

export function jettonTransferBody(p: {
  queryId?: bigint;
  amount: bigint;
  to: Address;
  responseTo: Address;
  /** claim cell (custom_payload): credits what the project owes before moving tokens */
  claim?: Cell | null;
  forwardTon?: bigint;
  forwardPayload?: Cell | null;
}): Cell {
  return beginCell()
    .storeUint(Op.transfer, 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.amount)
    .storeAddress(p.to)
    .storeAddress(p.responseTo)
    .storeMaybeRef(p.claim ?? null)
    .storeCoins(p.forwardTon ?? 0n)
    .storeBuilder(eitherPayload(p.forwardPayload))
    .endCell();
}

/** Body of `op::claim`: apply a claim without moving tokens. */
export function claimBody(claim: Cell, queryId = 0n): Cell {
  return beginCell().storeUint(Op.claim, 32).storeUint(queryId, 64).storeSlice(claim.beginParse()).endCell();
}

export interface EggWalletConfig {
  owner: Address;
  master: Address;
  walletCode: Cell;
  authority: bigint;
}

/** Initial data of a fresh jetton-wallet — must mirror pack_wallet_data(). */
export function eggWalletInitData(c: EggWalletConfig): Cell {
  return beginCell()
    .storeCoins(0)
    .storeAddress(c.owner)
    .storeAddress(c.master)
    .storeRef(c.walletCode)
    .storeRef(beginCell().storeUint(c.authority, 256).storeCoins(0).storeUint(0, 32).endCell())
    .endCell();
}

export function eggWalletStateInit(c: EggWalletConfig) {
  const init = { code: c.walletCode, data: eggWalletInitData(c) };
  return { init, address: contractAddress(0, init) };
}
