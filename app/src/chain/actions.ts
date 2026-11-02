import { Address, Cell, StateInit } from '@ton/core';
import { askToClaimBody, Attach, commentPayload, transferBody, transferIntent } from '@egg/sdk';
import { toNano } from '@ton/core';
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
  return [{ to: p.to.address, value: p.amount, bounce: p.to.bounceable, body: p.comment ? commentPayload(p.comment) : undefined }];
}

export function eggTransfer(p: { owner: Address; state: EggState; to: Address; amount: bigint; comment?: string; forwardTon?: bigint }): OutMessage[] {
  const hasComment = Boolean(p.comment);
  return [
    {
      to: p.state.jettonWallet,
      value: Attach.transfer + (p.forwardTon ?? 0n),
      bounce: true,
      body: transferBody({
        amount: p.amount,
        to: p.to,
        responseTo: p.owner,
        // a comment only reaches the recipient inside a transfer_notification
        forwardTon: p.forwardTon ?? (hasComment ? 1n : 0n),
        forwardPayload: hasComment ? commentPayload(p.comment!) : null,
      }),
    },
  ];
}

/** The claim: ask your own jetton-wallet to verify `proof` against the root the minter has published for `epoch`. */
export function eggClaim(p: {
  state: EggState;
  epoch: number;
  cumulative: bigint;
  proof: Cell;
  init?: StateInit;
  /** claim AND send in the same request: pass `amount` on to `to` as soon as the claim is credited */
  thenSend?: { owner: Address; to: Address; amount: bigint; comment?: string; forwardTon?: bigint };
}): OutMessage[] {
  const next = p.thenSend
    ? transferIntent({
        amount: p.thenSend.amount,
        to: p.thenSend.to,
        excessesTo: p.thenSend.owner,
        forwardTon: p.thenSend.forwardTon ?? (p.thenSend.comment ? 1n : 0n),
        comment: p.thenSend.comment,
      })
    : null;
  return [
    {
      to: p.state.jettonWallet,
      value: p.thenSend ? Attach.claimAndSend + (p.thenSend.forwardTon ?? 0n) : Attach.claim,
      bounce: true,
      sponsorable: true,
      init: p.state.deployed ? undefined : p.init,
      body: askToClaimBody({ epoch: p.epoch, cumulative: p.cumulative, proof: p.proof, next }),
    },
  ];
}

/** Keeps a little TON behind so the wallet can always pay for its next move. */
export const TON_FEE_RESERVE = toNano('0.02');

/** Sending to a @username (see docs/BOT.md) */
export const USERNAME_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
/** TON that travels with an EGG sent to a wallet prepared for someone who has not opened the wallet yet */
export const USERNAME_EGG_FORWARD = toNano('0.06');
