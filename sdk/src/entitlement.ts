import { Address, Cell } from '@ton/core';
import { verifyProof } from './tree';

/**
 * What a wallet, explorer or dApp needs to show "pending EGG" and to let the user claim it.
 * It is served publicly by the EGG server, but nothing in it has to be trusted: `verifyEntitlement`
 * checks it against the commitment stored in the minter contract.
 */
export interface Entitlement {
  owner: string; // raw address
  epoch: number;
  /** decimal string, jetton units */
  cumulative: string;
  /** base64 BoC of the proof cell, ready for AskToClaim */
  proof: string;
  /** hex of the on-chain commitment of this epoch (for convenience; always re-read it from the contract) */
  commitment: string;
}

export async function fetchEntitlement(apiBase: string, owner: Address, fetchImpl: typeof fetch = fetch): Promise<Entitlement | null> {
  const res = await fetchImpl(`${apiBase.replace(/\/$/, '')}/v1/entitlement/${encodeURIComponent(owner.toRawString())}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`entitlement API: ${res.status}`);
  return (await res.json()) as Entitlement;
}

/** `onChainCommitment` must be read from the minter (`get_root(epoch)`), never from the API. */
export function verifyEntitlement(e: Entitlement, onChainCommitment: Buffer): boolean {
  return verifyProof(Address.parseRaw(e.owner), BigInt(e.cumulative), Cell.fromBase64(e.proof), onChainCommitment);
}
