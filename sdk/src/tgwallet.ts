import {
  Address, beginCell, Cell, contractAddress, external, internal, MessageRelaxed, SendMode, StateInit,
  storeMessage, storeMessageRelaxed,
} from '@ton/core';
import { sha256_sync, sign } from '@ton/crypto';
import { tgWalletCode } from './artifacts';

/**
 * Client for the Telegram wallet contract (WalletTg, https://github.com/ton-blockchain/tg-wallet-contract).
 *
 *   storage   0x00:uint8 (revision)  seqno:uint32  subwalletId:uint32  publicKey:uint256
 *   request   SignedRequest = signature:bits512 + request      (signature goes FIRST, unlike wallet v5)
 *   signature = ed25519( hash of the request cell )
 *   request   opcode:uint32  subwalletId:uint32  validUntil:uint32  seqno:uint32  ...payload
 *
 * "Internal" requests are for gasless relaying (anyone may deliver them and pay the gas); "external" requests are
 * the normal self-paid path. They differ only in opcode, so a request signed for one channel is useless on the other.
 */

export const SUBWALLET_ID = { mainnet: 0x7fff7f11, testnet: 0x7fff7ffd } as const;

const OP = {
  sendOneI: 0x63896e74,
  sendOneE: 0x63896e75,
  changeKeyI: 0xfbba99c7,
  changeKeyE: 0xfbba99c8,
} as const;

export type Channel = 'internal' | 'external';

export interface TgWalletConfig {
  publicKey: Buffer;
  subwalletId: number;
}

/** Initial data: revision 0, seqno 0. The address depends only on the key and the subwallet id. */
export function tgWalletInitData(c: TgWalletConfig): Cell {
  return beginCell().storeUint(0, 8).storeUint(0, 32).storeUint(c.subwalletId, 32).storeBuffer(c.publicKey, 32).endCell();
}

export function tgWalletStateInit(c: TgWalletConfig, code: Cell = tgWalletCode): { init: StateInit; address: Address } {
  const init: StateInit = { code, data: tgWalletInitData(c) };
  return { init, address: contractAddress(0, init) };
}

/** What the contract's `send` actions carry: a full internal message. */
export interface OutgoingMessage {
  to: Address;
  value: bigint;
  bounce: boolean;
  body?: Cell;
  init?: StateInit;
}

export const messageCell = (m: OutgoingMessage): Cell =>
  beginCell()
    .store(storeMessageRelaxed(internal({ to: m.to, value: m.value, bounce: m.bounce, body: m.body, init: m.init }) as MessageRelaxed))
    .endCell();

/** `SIGNATURE_FIRST` envelope: the signature covers exactly the cell that follows it. */
export function signedRequest(request: Cell, secretKey: Buffer): Cell {
  const signature = sign(request.hash(), secretKey);
  return beginCell().storeBuffer(signature, 64).storeSlice(request.beginParse()).endCell();
}

export interface Header {
  subwalletId: number;
  validUntil: number;
  seqno: number;
}

const header = (b: ReturnType<typeof beginCell>, h: Header) => b.storeUint(h.subwalletId, 32).storeUint(h.validUntil, 32).storeUint(h.seqno, 32);

/**
 * Sign "send this one message". External requests must carry IGNORE_ERRORS; PAY_GAS_SEPARATELY is the usual companion.
 */
export function sendOne(p: {
  channel: Channel;
  secretKey: Buffer;
  header: Header;
  message: OutgoingMessage;
  sendMode?: number;
}): Cell {
  const mode = p.sendMode ?? SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS;
  const request = header(beginCell().storeUint(p.channel === 'external' ? OP.sendOneE : OP.sendOneI, 32), p.header)
    .storeUint(mode, 8)
    .storeRef(messageCell(p.message))
    .endCell();
  return signedRequest(request, p.secretKey);
}

const ROTATION_TAG = BigInt('0x4B45595F524F544154494F4E'); // "KEY_ROTATION"

/**
 * Switch the wallet to a new key. Signed twice: by the current key (the envelope) and by the NEW key over
 * `KeyRotationProofPayload{wallet}`, so a key can never be set that its owner does not hold.
 * `encryptedOldSeed` lets the holder of the new key recompute the old one (for decrypting old data).
 */
export function changeKey(p: {
  channel: Channel;
  secretKey: Buffer;
  header: Header;
  wallet: Address;
  newSecretKey: Buffer;
  newPublicKey: Buffer;
}): Cell {
  const proof = beginCell().storeUint(ROTATION_TAG, 96).storeInt(p.wallet.workChain, 8).storeBuffer(p.wallet.hash, 32).endCell();
  const rotationSignature = sign(proof.hash(), p.newSecretKey);
  const oldSeed = p.secretKey.subarray(0, 32);
  const newSeed = p.newSecretKey.subarray(0, 32);
  const mask = sha256_sync(Buffer.concat([newSeed, Buffer.from('EGG:old-key')]));
  const encryptedOld = Buffer.from(oldSeed.map((b, i) => b ^ mask[i]));
  const request = header(beginCell().storeUint(p.channel === 'external' ? OP.changeKeyE : OP.changeKeyI, 32), p.header)
    .storeBuffer(p.newPublicKey, 32)
    .storeRef(beginCell().storeBuffer(rotationSignature, 64).endCell())
    .storeRef(beginCell().storeBuffer(encryptedOld, 32).endCell())
    .endCell();
  return signedRequest(request, p.secretKey);
}

/** The old seed, from the new seed and what the contract emitted (inverse of the XOR above). */
export function recoverOldSeed(newSeed: Buffer, encryptedOld: Buffer): Buffer {
  const mask = sha256_sync(Buffer.concat([newSeed, Buffer.from('EGG:old-key')]));
  return Buffer.from(encryptedOld.map((b, i) => b ^ mask[i]));
}

/** An external message to the wallet, as a BoC ready for `sendBoc` (attach `init` only while undeployed). */
export function externalBoc(wallet: Address, body: Cell, init?: StateInit): Buffer {
  return beginCell().store(storeMessage(external({ to: wallet, body, init }))).endCell().toBoc();
}

/**
 * The internal message a relayer sends to deliver a signed request (gasless): the relayer's `value` funds the wallet,
 * and the wallet ignores anything whose signature does not verify.
 */
export const relayMessage = (wallet: Address, body: Cell, value: bigint, init?: StateInit) =>
  internal({ to: wallet, value, bounce: false, body, init });

/** Storage-prefix-agnostic getter parsing helpers live with the callers; these are the getter names. */
export const TG_WALLET_GETTERS = { seqno: 'seqno', subwalletId: 'get_subwallet_id', publicKey: 'get_public_key', revision: 'revision' } as const;
