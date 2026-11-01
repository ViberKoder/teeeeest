import { Address, Cell, toNano } from '@ton/core';
import { Attach, claimBody, commentPayload, jettonTransferBody } from '@egg/contracts/wrappers/messages';
import type { OutMessage } from '../provider/types';
import type { EggState } from './egg';

export interface ParsedAddress {
  address: Address;
  bounceable: boolean;
  testOnly: boolean;
}

/** Accepts friendly (EQ/UQ/kQ/0Q) and raw (0:…) forms. */
export function parseAddress(input: string): ParsedAddress | null {
  const s = input.trim();
  try {
    if (/^-?\d+:[0-9a-fA-F]{64}$/.test(s)) return { address: Address.parseRaw(s), bounceable: false, testOnly: false };
    const p = Address.parseFriendly(s);
    return { address: p.address, bounceable: p.isBounceable, testOnly: p.isTestOnly };
  } catch {
    return null;
  }
}

export function tonTransfer(p: { to: ParsedAddress; amount: bigint; comment?: string }): OutMessage[] {
  return [
    {
      to: p.to.address,
      value: p.amount,
      bounce: p.to.bounceable,
      body: p.comment ? commentPayload(p.comment) : undefined,
    },
  ];
}

/**
 * EGG transfer. When a `claim` is supplied it rides along in the same message,
 * so syncing the project's balance and sending cost one transaction.
 */
export function eggTransfer(p: {
  owner: Address;
  state: EggState;
  to: Address;
  amount: bigint;
  comment?: string;
  claim?: Cell;
  init?: { code: Cell; data: Cell };
}): OutMessage[] {
  const hasComment = Boolean(p.comment);
  return [
    {
      to: p.state.jettonWallet,
      value: p.claim ? Attach.transferWithClaim : Attach.transfer,
      bounce: true,
      init: p.state.deployed ? undefined : p.init,
      body: jettonTransferBody({
        amount: p.amount,
        to: p.to,
        responseTo: p.owner,
        claim: p.claim,
        // a comment only reaches the recipient inside a transfer_notification
        forwardTon: hasComment ? 1n : 0n,
        forwardPayload: hasComment ? commentPayload(p.comment!) : null,
      }),
    },
  ];
}

export function eggClaim(p: { state: EggState; claim: Cell; init?: { code: Cell; data: Cell } }): OutMessage[] {
  return [
    {
      to: p.state.jettonWallet,
      value: Attach.claim,
      bounce: true,
      init: p.state.deployed ? undefined : p.init,
      body: claimBody(p.claim),
    },
  ];
}

/** Keeps a little TON behind so the wallet can always pay for its next move. */
export const TON_FEE_RESERVE = toNano('0.02');
