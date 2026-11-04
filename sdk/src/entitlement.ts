import { Address, Cell } from '@ton/core';
import { foldProof, SignedRoot, verifySignedRoot } from './tree';

/**
 * What a wallet, explorer or dApp needs to show "pending EGG" and to let the user claim it. It is served by the EGG bot, but nothing in
 * it has to be trusted: `verifyEntitlement` checks the publisher's signature (against the key stored in the minter contract) and that the
 * proof opens to the signed root — exactly what the minter will check again on-chain.
 */
export interface Entitlement {
  owner: string; // raw address
  /** decimal string, jetton units */
  cumulative: string;
  /** base64 BoC of the proof cell, ready for AskToClaim */
  proof: string;
  /** the root the proof opens to, signed by the publisher */
  root: SignedRoot;
}

/** `publisherKey` and `minter` must come from the chain (`get_publisher_key`), never from the API. */
export function verifyEntitlement(e: Entitlement, minter: Address, publisherKey: Buffer): boolean {
  try {
    if (!verifySignedRoot(minter, e.root, publisherKey)) return false;
    const { treeRoot, total } = foldProof(Address.parseRaw(e.owner), BigInt(e.cumulative), Cell.fromBase64(e.proof));
    return treeRoot.toString('hex') === e.root.treeRoot && total === BigInt(e.root.total);
  } catch {
    return false;
  }
}
