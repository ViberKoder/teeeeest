import { Cell } from '@ton/core';
import { formatCompressedInfo, isWithinClaimWindow } from './mintlessWalletFormat';
import { buildMintlessCustomPayloadBase64 } from './walletClaimPayload';

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

describe('RMJ rolling_claim via Proof API builder', () => {
  it('walletClaimPayload uses rolling_claim opcode', () => {
    const proof = new Cell();
    const b64 = buildMintlessCustomPayloadBase64(proof, {
      state: { epoch: 1, rootBigint: () => 1n } as never,
      signer: {
        signRoot: () => ({ newEpoch: 1, newRoot: 1n, signature: Buffer.alloc(64) }),
      } as never,
    });
    expect(Cell.fromBase64(b64).beginParse().loadUint(32)).toBe(0xc9e56df3);
  });
});
