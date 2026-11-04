import { Address, beginCell, Cell } from '@ton/core';
import { sha256_sync, sign, signVerify } from '@ton/crypto';

/**
 * Sum-Merkle tree, the same as contracts/contracts/merkle.tolk. H(x) is the hash of the cell holding x
 * (what the TVM instruction HASHBU returns):
 *
 *   leaf = H(0x00 | ownerHash:256 | cumulative:128)
 *   node = H(0x01 | leftHash:256 | leftSum:128 | rightHash:256 | rightSum:128)
 *   root = H(0x02 | treeRoot:256 | total:128)       <- stored on-chain by the minter
 *
 * Every node commits to the sum of the leaves below it, so the root commits to the total promised.
 */

export interface Leaf {
  owner: Address;
  cumulative: bigint;
}

const TAG_LEAF = 0, TAG_NODE = 1, TAG_ROOT = 2;
const MAX_DEPTH = 64;

const H = (tag: number, build: (b: ReturnType<typeof beginCell>) => void): Buffer => {
  const b = beginCell().storeUint(tag, 8);
  build(b);
  return b.endCell().hash(); // = HASHBU in the contract (representation hash of the built cell)
};

export const leafHash = (owner: Address, cumulative: bigint): Buffer => {
  if (owner.workChain !== 0) throw new Error('only basechain owners are supported');
  return H(TAG_LEAF, (b) => b.storeBuffer(owner.hash, 32).storeUint(cumulative, 128));
};

export const nodeHash = (lh: Buffer, ls: bigint, rh: Buffer, rs: bigint): Buffer =>
  H(TAG_NODE, (b) => b.storeBuffer(lh, 32).storeUint(ls, 128).storeBuffer(rh, 32).storeUint(rs, 128));

export const rootCommitment = (treeRoot: Buffer, total: bigint): Buffer =>
  H(TAG_ROOT, (b) => b.storeBuffer(treeRoot, 32).storeUint(total, 128));

export interface ProofStep {
  siblingHash: Buffer;
  siblingSum: bigint;
  siblingOnRight: boolean;
}

/** Proof layout (two steps per cell, chained by a ref): hasNext:1 count:2 (hash:256 sum:128 onRight:1)*count */
export function proofToCell(steps: ProofStep[]): Cell {
  if (steps.length > MAX_DEPTH) throw new Error('proof too deep');
  const chunks: ProofStep[][] = [];
  for (let i = 0; i < steps.length; i += 2) chunks.push(steps.slice(i, i + 2));
  if (chunks.length === 0) chunks.push([]);
  let next: Cell | null = null;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const b = beginCell().storeUint(next ? 1 : 0, 1).storeUint(chunks[i].length, 2);
    for (const s of chunks[i]) {
      b.storeBuffer(s.siblingHash, 32).storeUint(s.siblingSum, 128).storeUint(s.siblingOnRight ? 1 : 0, 1);
    }
    if (next) b.storeRef(next);
    next = b.endCell();
  }
  return next!;
}

export function cellToProof(cell: Cell): ProofStep[] {
  const steps: ProofStep[] = [];
  let s = cell.beginParse();
  for (;;) {
    const more = s.loadUint(1) === 1;
    const count = s.loadUint(2);
    for (let i = 0; i < count; i++) {
      steps.push({ siblingHash: s.loadBuffer(32), siblingSum: s.loadUintBig(128), siblingOnRight: s.loadUint(1) === 1 });
    }
    if (!more) return steps;
    s = s.loadRef().beginParse();
  }
}

/** Recomputes (treeRoot, total) from a leaf and its proof — the exact walk the minter performs. */
export function foldProof(owner: Address, cumulative: bigint, proof: Cell): { treeRoot: Buffer; total: bigint } {
  let hash = leafHash(owner, cumulative);
  let sum = cumulative;
  const steps = cellToProof(proof);
  if (steps.length > MAX_DEPTH) throw new Error('proof too deep');
  for (const s of steps) {
    hash = s.siblingOnRight ? nodeHash(hash, sum, s.siblingHash, s.siblingSum) : nodeHash(s.siblingHash, s.siblingSum, hash, sum);
    sum += s.siblingSum;
  }
  return { treeRoot: hash, total: sum };
}

/** True iff this proof opens to the commitment the minter stores for the epoch. */
export function verifyProof(owner: Address, cumulative: bigint, proof: Cell, commitment: Buffer): boolean {
  try {
    const { treeRoot, total } = foldProof(owner, cumulative, proof);
    return rootCommitment(treeRoot, total).equals(commitment);
  } catch {
    return false;
  }
}

export class EggTree {
  readonly leaves: Leaf[];
  readonly treeRoot: Buffer;
  readonly total: bigint;
  /** what the minter stores for this epoch */
  readonly commitment: Buffer;
  private readonly levels: { hash: Buffer; sum: bigint }[][];
  private readonly index = new Map<string, number>();

  constructor(leaves: Leaf[]) {
    const merged = new Map<string, Leaf>();
    for (const l of leaves) {
      if (l.cumulative <= 0n) continue;
      const k = l.owner.hash.toString('hex');
      const prev = merged.get(k);
      merged.set(k, { owner: l.owner, cumulative: (prev?.cumulative ?? 0n) + l.cumulative });
    }
    // deterministic order: anyone with the leaf set rebuilds the identical tree
    this.leaves = [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
    this.leaves.forEach((l, i) => this.index.set(l.owner.hash.toString('hex'), i));

    let level = this.leaves.map((l) => ({ hash: leafHash(l.owner, l.cumulative), sum: l.cumulative }));
    this.levels = [level];
    while (level.length > 1) {
      const next: typeof level = [];
      for (let i = 0; i < level.length; i += 2) {
        const l = level[i], r = level[i + 1];
        next.push(r ? { hash: nodeHash(l.hash, l.sum, r.hash, r.sum), sum: l.sum + r.sum } : l); // odd node is carried up
      }
      this.levels.push(next);
      level = next;
    }
    const top = level[0];
    this.treeRoot = top?.hash ?? sha256_sync(Buffer.alloc(0));
    this.total = top?.sum ?? 0n;
    this.commitment = rootCommitment(this.treeRoot, this.total);
  }

  get size() {
    return this.leaves.length;
  }

  cumulativeOf(owner: Address): bigint {
    const i = this.index.get(owner.hash.toString('hex'));
    return i === undefined ? 0n : this.leaves[i].cumulative;
  }

  steps(owner: Address): ProofStep[] | null {
    let i = this.index.get(owner.hash.toString('hex'));
    if (i === undefined) return null;
    const out: ProofStep[] = [];
    for (let lv = 0; lv < this.levels.length - 1; lv++) {
      const level = this.levels[lv];
      const sibIdx = i % 2 === 0 ? i + 1 : i - 1;
      if (sibIdx < level.length) {
        out.push({ siblingHash: level[sibIdx].hash, siblingSum: level[sibIdx].sum, siblingOnRight: sibIdx > i });
      }
      i = Math.floor(i / 2);
    }
    return out;
  }

  /** The cell to put in `AskToClaim.proof`. */
  proof(owner: Address): Cell | null {
    const s = this.steps(owner);
    return s ? proofToCell(s) : null;
  }

  /** Public, self-contained description of an epoch: anyone can rebuild the tree from it. */
  toJSON(epoch: number) {
    return {
      epoch,
      treeRoot: this.treeRoot.toString('hex'),
      total: this.total.toString(),
      commitment: this.commitment.toString('hex'),
      leaves: this.leaves.map((l) => ({ owner: l.owner.toRawString(), cumulative: l.cumulative.toString() })),
    };
  }

  static fromJSON(j: { leaves: { owner: string; cumulative: string }[] }) {
    return new EggTree(j.leaves.map((l) => ({ owner: Address.parseRaw(l.owner), cumulative: BigInt(l.cumulative) })));
  }
}

// ------------------------------------------------------------------ signed roots

const TAG_SIGNED_ROOT = 0x45474752; // "EGGR"

/**
 * What the publisher signs: it binds the minter's address, so a signature can not be replayed on another contract.
 * Identical to `signedRootDigest` in merkle.tolk.
 */
export const signedRootDigest = (minter: Address, treeRoot: Buffer, total: bigint, seq: bigint): Buffer =>
  beginCell().storeUint(TAG_SIGNED_ROOT, 32).storeBuffer(minter.hash, 32).storeBuffer(treeRoot, 32).storeCoins(total).storeUint(seq, 64).endCell().hash();

/** A root the publisher signed. Nothing is published on-chain: the player carries it into the claim. */
export interface SignedRoot {
  treeRoot: string; // hex
  total: string; // decimal, jetton units
  seq: string; // decimal
  signature: string; // hex, 64 bytes
}

export function signRoot(minter: Address, treeRoot: Buffer, total: bigint, seq: bigint, secretKey: Buffer): SignedRoot {
  const signature = sign(signedRootDigest(minter, treeRoot, total, seq), secretKey);
  return { treeRoot: treeRoot.toString('hex'), total: total.toString(), seq: seq.toString(), signature: signature.toString('hex') };
}

/** The cell the contract parses (`SignedRoot` in storage.tolk). */
export const signedRootCell = (r: SignedRoot): Cell =>
  beginCell().storeBuffer(Buffer.from(r.treeRoot, 'hex'), 32).storeCoins(BigInt(r.total)).storeUint(BigInt(r.seq), 64).storeBuffer(Buffer.from(r.signature, 'hex'), 64).endCell();

export function verifySignedRoot(minter: Address, r: SignedRoot, publisherKey: Buffer): boolean {
  try {
    return signVerify(signedRootDigest(minter, Buffer.from(r.treeRoot, 'hex'), BigInt(r.total), BigInt(r.seq)), Buffer.from(r.signature, 'hex'), publisherKey);
  } catch {
    return false;
  }
}
