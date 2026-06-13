import { formatCompressedInfo } from './mintlessWalletFormat';

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
