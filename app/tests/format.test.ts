import { formatUnits, parseUnits, shortAddr } from '../src/lib/format';

describe('units', () => {
  it('parses plain decimals and rejects junk', () => {
    expect(parseUnits('1', 9)).toBe(1_000_000_000n);
    expect(parseUnits('0.5', 9)).toBe(500_000_000n);
    expect(parseUnits('12,25', 9)).toBe(12_250_000_000n);
    expect(parseUnits('.5', 9)).toBe(500_000_000n);
    expect(parseUnits('0.0000000001', 9)).toBeNull();
    for (const bad of ['', '.', 'abc', '1e5', '-1', '1.2.3', '0x10']) expect(parseUnits(bad, 9)).toBeNull();
  });

  it('formats without float error, with grouping', () => {
    expect(formatUnits(12_480_500_000_000n, 9, 2)).toBe('12 480.5');
    expect(formatUnits(1n, 9, 9)).toBe('0.000000001');
    expect(formatUnits(0n, 9)).toBe('0');
    expect(formatUnits(1_999_999_999n, 9, 2)).toBe('1.99');
  });

  it('round-trips', () => {
    for (const s of ['0.1', '123.456789', '1000000']) {
      expect(formatUnits(parseUnits(s, 9)!, 9, 9).replace(/ /g, '')).toBe(s);
    }
  });

  it('shortens addresses', () => {
    expect(shortAddr('UQAbcdefghijklmnop', 4, 4)).toBe('UQAb…mnop');
  });
});
