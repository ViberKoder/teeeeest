// The sum-Merkle tree — a port of sdk/src/tree.ts and contracts/contracts/merkle.tolk (tests keep all three identical).
import { fromHex } from './bytes.js';
import { Builder } from './cell.js';

const TAG_LEAF = 0, TAG_NODE = 1, TAG_ROOT = 2;
const ownerHash = (raw) => fromHex(raw.split(':')[1]);

export const leafHash = async (owner, cumulative) => new Builder().uint(TAG_LEAF, 8).bytes(ownerHash(owner)).uint(cumulative, 128).build().hash();
export const nodeHash = async (lh, ls, rh, rs) => new Builder().uint(TAG_NODE, 8).bytes(lh).uint(ls, 128).bytes(rh).uint(rs, 128).build().hash();
export const rootCommitment = async (treeRoot, total) => new Builder().uint(TAG_ROOT, 8).bytes(treeRoot).uint(total, 128).build().hash();

/** leaves: [{ owner: "0:hex", cumulative: bigint }] */
export async function buildTree(leaves) {
  const merged = new Map();
  for (const l of leaves) {
    if (l.cumulative <= 0n) continue;
    const k = l.owner.split(':')[1];
    merged.set(k, { owner: l.owner, cumulative: (merged.get(k)?.cumulative ?? 0n) + l.cumulative });
  }
  const sorted = [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
  let level = [];
  for (const l of sorted) level.push({ hash: await leafHash(l.owner, l.cumulative), sum: l.cumulative });
  const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i], r = level[i + 1];
      next.push(r ? { hash: await nodeHash(l.hash, l.sum, r.hash, r.sum), sum: l.sum + r.sum } : l);
    }
    levels.push(next);
    level = next;
  }
  const top = level[0];
  if (!top) return { leaves: sorted, total: 0n, treeRoot: null, commitment: null, levels, index: new Map() };
  return {
    leaves: sorted, levels, total: top.sum, treeRoot: top.hash,
    commitment: await rootCommitment(top.hash, top.sum),
    index: new Map(sorted.map((l, i) => [l.owner.split(':')[1], i])),
  };
}

/** the proof for one owner, as a cell chain (two steps per cell) identical to `proofToCell` in the SDK */
export function proofCell(tree, owner) {
  let i = tree.index.get(owner.split(':')[1]);
  if (i === undefined) return null;
  const steps = [];
  for (let lv = 0; lv < tree.levels.length - 1; lv++) {
    const level = tree.levels[lv];
    const sib = i % 2 === 0 ? i + 1 : i - 1;
    if (sib < level.length) steps.push({ hash: level[sib].hash, sum: level[sib].sum, right: sib > i });
    i = Math.floor(i / 2);
  }
  const chunks = [];
  for (let k = 0; k < steps.length; k += 2) chunks.push(steps.slice(k, k + 2));
  if (!chunks.length) chunks.push([]);
  let next = null;
  for (let k = chunks.length - 1; k >= 0; k--) {
    const b = new Builder().uint(next ? 1 : 0, 1).uint(chunks[k].length, 2);
    for (const s of chunks[k]) b.bytes(s.hash).uint(s.sum, 128).uint(s.right ? 1 : 0, 1);
    if (next) b.ref(next);
    next = b.build();
  }
  return next;
}

const TAG_SIGNED_ROOT = 0x45474752; // "EGGR"

/** What the publisher signs; binds the minter's address (same as `signedRootDigest` in the contract and the SDK). */
export const signedRootDigest = (minter, treeRoot, total, seq) =>
  new Builder().uint(TAG_SIGNED_ROOT, 32).bytes(fromHex(minter.split(':')[1])).bytes(treeRoot).coins(total).uint(seq, 64).build().hash();
