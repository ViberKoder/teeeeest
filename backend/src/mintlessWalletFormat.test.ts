import { Cell } from '@ton/core';
import { buildStandardMerkleClaimPayload, OpCodes } from '@rmj/contracts';
import { formatCompressedInfo, isWithinClaimWindow } from './mintlessWalletFormat';

describe('formatCompressedInfo (TEP-176)', () => {
  it('serializes amount, start_from, expired_at as decimal strings', () => {
    const info = formatCompressedInfo({
      amount: 1_000_000_000n,
      startFrom: 1767225600,
      expiredAt: 1893456000,
    });
    expect(info).toEqual({
      amount: '1000000000',
      start_from: '1767225600',
      expired_at: '1893456000',
    });
    expect(typeof info.start_from).toBe('string');
    expect(typeof info.expired_at).toBe('string');
  });

  it('stringifies zero start_from', () => {
    const info = formatCompressedInfo({ amount: 28n, startFrom: 0, expiredAt: 1812738569 });
    expect(info.start_from).toBe('0');
    expect(info.expired_at).toBe('1812738569');
  });
});

describe('isWithinClaimWindow (claim-api-go)', () => {
  it('returns true inside [start_from, expired_at]', () => {
    expect(isWithinClaimWindow(100, 200, 150)).toBe(true);
    expect(isWithinClaimWindow(100, 200, 100)).toBe(true);
    expect(isWithinClaimWindow(100, 200, 200)).toBe(true);
  });

  it('returns false outside the window', () => {
    expect(isWithinClaimWindow(100, 200, 99)).toBe(false);
    expect(isWithinClaimWindow(100, 200, 201)).toBe(false);
  });
});

describe('TEP-177 custom_payload opcode', () => {
  it('buildStandardMerkleClaimPayload uses merkle_airdrop_claim', () => {
    const proof = new Cell();
    const payload = buildStandardMerkleClaimPayload(proof);
    const op = payload.beginParse().loadUint(32);
    expect(op).toBe(OpCodes.merkleAirdropClaim);
    expect(op).toBe(0x0df602d6);
  });
});
