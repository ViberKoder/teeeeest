import type { Address } from '@ton/core';
import { verifyEntitlement } from '@egg/sdk';
import { api, entitlementCache, proofCell } from '../api/server';
import { onchainCommitment, readEgg, walletInit } from './egg';
import type { WalletProvider } from '../provider/types';

/**
 * The player's newest committed entitlement, checked against the commitment stored in the token contract before anything
 * is sent. Used by both "Hatch" and "Send" (which claims and sends in one request).
 */
export async function loadVerifiedEntitlement(provider: WalletProvider, master: Address, alreadyLinked: boolean) {
  const raw = provider.address.toRawString();
  if (!alreadyLinked) await provider.linkToAccount();
  const ent = await api.entitlement(raw).catch((e: unknown) => {
    const cached = entitlementCache.read(raw);
    if (cached) return cached; // the server is unreachable, but a verified proof is still good
    throw e;
  });
  const commitment = await onchainCommitment(master, ent.epoch);
  if (!commitment) throw new Error('epoch-not-on-chain');
  if (!verifyEntitlement(ent, commitment)) throw new Error('proof-mismatch');
  entitlementCache.write(ent);
  const [state, init] = await Promise.all([readEgg(master, provider.address), walletInit(master, provider.address)]);
  return { ent, cumulative: BigInt(ent.cumulative), proof: proofCell(ent), state, init };
}
