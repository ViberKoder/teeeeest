import type { Address } from '@ton/core';
import { verifyEntitlement } from '@egg/sdk';
import { api, entitlementCache, proofCell, rootCell } from '../api/server';
import { publisherKey, readEgg, walletInit } from './egg';
import type { WalletProvider } from '../provider/types';

/**
 * The player's newest signed entitlement, checked locally before anything is sent: the publisher's signature (against the key stored
 * in the token contract) and the proof against the signed root — exactly what the contract will check again on-chain. A signed root
 * never expires, so one that was fetched earlier is as good as a new one.
 */
export async function loadVerifiedEntitlement(provider: WalletProvider, master: Address, alreadyLinked: boolean) {
  const raw = provider.address.toRawString();
  if (!alreadyLinked) await provider.linkToAccount();
  const ent = await api.entitlement(raw).catch((e: unknown) => {
    const cached = entitlementCache.read(raw);
    if (cached) return cached; // the bot is unreachable, but a signed root is still good
    throw e;
  });
  const key = await publisherKey(master);
  if (!verifyEntitlement(ent, master, key)) throw new Error('proof-mismatch');
  entitlementCache.write(ent);
  const [state, init] = await Promise.all([readEgg(master, provider.address), walletInit(master, provider.address)]);
  return { ent, cumulative: BigInt(ent.cumulative), proof: proofCell(ent), root: rootCell(ent), state, init };
}
