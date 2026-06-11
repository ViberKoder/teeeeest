import { Address } from '@ton/core';
import { AirdropTree, itemFromBigint } from '@rmj/contracts';
import {
  compareOwnerAddress,
  parseWalletBatchCount,
  parseWalletBatchNextFrom,
  sortOwners,
  WALLET_BATCH_ZERO,
} from './mintlessBatchUtils';

describe('mintlessWalletBatch helpers', () => {
  const a = Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111');
  const b = Address.parse('0:2222222222222222222222222222222222222222222222222222222222222222');

  test('sortOwners orders by raw string', () => {
    const sorted = sortOwners([b, a]);
    expect(sorted[0]!.equals(a)).toBe(true);
    expect(sorted[1]!.equals(b)).toBe(true);
    expect(compareOwnerAddress(a, b)).toBeLessThan(0);
  });

  test('parseWalletBatchCount clamps to max', () => {
    expect(parseWalletBatchCount(undefined)).toBe(100);
    expect(parseWalletBatchCount('5')).toBe(5);
    expect(parseWalletBatchCount('999')).toBe(100);
    expect(parseWalletBatchCount('0')).toBe(100);
  });

  test('parseWalletBatchNextFrom defaults to zero address', () => {
    expect(parseWalletBatchNextFrom(undefined).toRawString()).toBe(WALLET_BATCH_ZERO);
  });

  test('AirdropTree keys are iterable for batch', () => {
    const tree = new AirdropTree();
    tree.set(a, itemFromBigint(10n));
    tree.set(b, itemFromBigint(20n));
    expect(tree.inner().keys().length).toBe(2);
  });
});
