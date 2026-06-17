import { Address } from '@ton/core';

/** TEP-176 / Tonkeeper claim-api-go: minimum batch page size. */
export const WALLET_BATCH_MIN = 5;
/** TEP-176 / Tonkeeper claim-api-go: maximum batch page size. */
export const WALLET_BATCH_MAX = 10_000;
export const WALLET_BATCH_DEFAULT = 100;
export const WALLET_BATCH_ZERO =
  '0:0000000000000000000000000000000000000000000000000000000000000000';

export function compareOwnerAddress(a: Address, b: Address): number {
  return a.toRawString().localeCompare(b.toRawString());
}

export function sortOwners(owners: Iterable<Address>): Address[] {
  return [...owners].sort(compareOwnerAddress);
}

export function parseWalletBatchCount(raw: string | undefined): number {
  if (!raw) return WALLET_BATCH_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return WALLET_BATCH_DEFAULT;
  if (parsed < WALLET_BATCH_MIN) return WALLET_BATCH_MIN;
  return Math.min(parsed, WALLET_BATCH_MAX);
}

export function parseWalletBatchNextFrom(raw: string | undefined): Address {
  if (!raw) return Address.parse(WALLET_BATCH_ZERO);
  return Address.parse(raw);
}
