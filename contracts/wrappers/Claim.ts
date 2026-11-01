import { Address, beginCell, Cell } from '@ton/core';
import { sign } from '@ton/crypto';
import { Domain } from './OpCodes';

/**
 * Key hierarchy
 *   authority (cold)  --signs-->  KeyCert{signer, keyId, notAfter}
 *   signer    (hot)   --signs-->  claim{master, owner, cumulative, validUntil}
 * Both signatures travel inside the claim payload; the wallet checks both.
 */
export interface KeyCert {
  /** hot signer public key (32 bytes) */
  signer: Buffer;
  keyId: number;
  /** unix seconds */
  notAfter: number;
  /** 64 byte ed25519 signature by the authority key */
  signature: Buffer;
}

export function certDigest(master: Address, signer: Buffer, keyId: number, notAfter: number): Buffer {
  return beginCell()
    .storeUint(Domain.cert, 32)
    .storeAddress(master)
    .storeUint(BigInt('0x' + signer.toString('hex')), 256)
    .storeUint(keyId, 32)
    .storeUint(notAfter, 48)
    .endCell()
    .hash();
}

export function claimDigest(master: Address, owner: Address, cumulative: bigint, validUntil: number): Buffer {
  return beginCell()
    .storeUint(Domain.claim, 32)
    .storeAddress(master)
    .storeAddress(owner)
    .storeCoins(cumulative)
    .storeUint(validUntil, 48)
    .endCell()
    .hash();
}

/** Run offline with the authority secret key. */
export function signCert(
  authoritySecret: Buffer,
  master: Address,
  signerPublic: Buffer,
  keyId: number,
  notAfter: number,
): KeyCert {
  return {
    signer: signerPublic,
    keyId,
    notAfter,
    signature: sign(certDigest(master, signerPublic, keyId, notAfter), authoritySecret),
  };
}

export interface ClaimParams {
  master: Address;
  owner: Address;
  /** total the project owes this owner since forever (monotonic) */
  cumulative: bigint;
  /** unix seconds */
  validUntil: number;
  signerSecret: Buffer;
  cert: KeyCert;
}

/**
 * The claim cell. Use it as `custom_payload` of a jetton `transfer`, or wrap
 * it with `claimMessageBody` to send it on its own.
 */
export function buildClaim(p: ClaimParams): Cell {
  const claimSig = sign(claimDigest(p.master, p.owner, p.cumulative, p.validUntil), p.signerSecret);
  return beginCell()
    .storeCoins(p.cumulative)
    .storeUint(p.validUntil, 48)
    .storeUint(BigInt('0x' + p.cert.signer.toString('hex')), 256)
    .storeUint(p.cert.keyId, 32)
    .storeUint(p.cert.notAfter, 48)
    .storeRef(beginCell().storeBuffer(claimSig).endCell())
    .storeRef(beginCell().storeBuffer(p.cert.signature).endCell())
    .endCell();
}
