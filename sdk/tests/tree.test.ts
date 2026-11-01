import { Address } from '@ton/core';
import { describe, expect, it } from 'vitest';
import { cellToProof, EggTree, foldProof, proofToCell, rootCommitment, verifyProof } from '../src';

const addr = (i: number) => new Address(0, Buffer.from(i.toString(16).padStart(64, '0'), 'hex'));
const leaves = (n: number) => Array.from({ length: n }, (_, i) => ({ owner: addr(i + 1), cumulative: BigInt(i + 1) * 1_000_000_000n }));

describe('EggTree', () => {
  it('every leaf verifies against the commitment, for many tree shapes', () => {
    for (const n of [1, 2, 3, 4, 5, 7, 8, 13, 100, 257]) {
      const t = new EggTree(leaves(n));
      expect(t.total).toBe(leaves(n).reduce((s, l) => s + l.cumulative, 0n));
      for (const l of t.leaves) {
        const proof = t.proof(l.owner)!;
        expect(verifyProof(l.owner, l.cumulative, proof, t.commitment)).toBe(true);
        expect(foldProof(l.owner, l.cumulative, proof).total).toBe(t.total);
      }
    }
  });

  it('a proof binds owner, amount and total', () => {
    const t = new EggTree(leaves(10));
    const a = t.leaves[2];
    const b = t.leaves[3];
    const proof = t.proof(a.owner)!;
    expect(verifyProof(b.owner, a.cumulative, proof, t.commitment)).toBe(false); // other owner
    expect(verifyProof(a.owner, a.cumulative + 1n, proof, t.commitment)).toBe(false); // other amount
    // a commitment that declares another total can never be opened
    expect(verifyProof(a.owner, a.cumulative, proof, rootCommitment(t.treeRoot, t.total - 1n))).toBe(false);
    expect(verifyProof(a.owner, a.cumulative, proof, rootCommitment(t.treeRoot, t.total))).toBe(true);
  });

  it('is deterministic: the same leaves in any order give the same root', () => {
    const l = leaves(50);
    const shuffled = [...l].reverse();
    expect(new EggTree(shuffled).commitment.equals(new EggTree(l).commitment)).toBe(true);
    const round = EggTree.fromJSON(new EggTree(l).toJSON(3));
    expect(round.commitment.equals(new EggTree(l).commitment)).toBe(true);
  });

  it('merges duplicate owners and ignores zero balances', () => {
    const t = new EggTree([
      { owner: addr(1), cumulative: 5n },
      { owner: addr(1), cumulative: 7n },
      { owner: addr(2), cumulative: 0n },
    ]);
    expect(t.size).toBe(1);
    expect(t.cumulativeOf(addr(1))).toBe(12n);
    expect(t.proof(addr(2))).toBeNull();
  });

  it('proof cells round-trip, including chains longer than one cell', () => {
    const t = new EggTree(leaves(1000));
    const steps = t.steps(t.leaves[500].owner)!;
    expect(steps.length).toBeGreaterThanOrEqual(9);
    const back = cellToProof(proofToCell(steps));
    expect(back.length).toBe(steps.length);
    expect(back.every((s, i) => s.siblingHash.equals(steps[i].siblingHash) && s.siblingSum === steps[i].siblingSum && s.siblingOnRight === steps[i].siblingOnRight)).toBe(true);
  });
});
