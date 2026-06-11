import { normalizeRootHex, rootsMatch, isZeroRoot } from './onChainMerkle';

describe('onChainMerkle', () => {
  test('rootsMatch compares hex and bigint', () => {
    const root = '0x0a63ed3d548a268aa203fff9ad0a02b306311ca0be96f2952dbbb2ad65f43477';
    expect(rootsMatch(root, BigInt(root))).toBe(true);
    expect(rootsMatch('0x0', '0x00')).toBe(true);
  });

  test('isZeroRoot detects empty commitment', () => {
    expect(isZeroRoot('0x0')).toBe(true);
    expect(isZeroRoot('0x00')).toBe(true);
    expect(isZeroRoot('0x1')).toBe(false);
  });

  test('normalizeRootHex pads to 32 bytes', () => {
    expect(normalizeRootHex('0x1')).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    );
  });
});
