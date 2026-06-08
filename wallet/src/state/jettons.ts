/**
 * Unified jetton list shown on the wallet home screen.
 *
 * Sources merged in order of trust:
 *
 *   1. TonAPI `/v2/accounts/{owner}/jettons` — every jetton-wallet the indexer
 *      knows about, with on-chain `balance` and master metadata.
 *   2. User-added "watched" jetton masters — typically RMJ tokens that the
 *      user has off-chain rewards for but has never transferred.  Their on-
 *      chain jetton-wallet is still uninit.
 *   3. RMJ Proof API per master — supplies the pending (off-chain) balance
 *      and the BoCs needed for the next transfer.
 *
 * The resulting `JettonEntry` carries everything the UI needs to render the
 * "real + pending" balance and to build a fully RMJ-aware send transaction.
 */

import {
  fetchRmjOffchainBalance,
  fetchRmjPending,
  type RmjOffchainBalance,
  type RmjPending,
} from '../services/rmj';
import {
  getJettonInfo,
  getJettonWalletAddress,
  listJettons,
  type JettonBalanceRaw,
  type Network,
} from '../services/ton';
import { loadVault } from './vault';

export interface JettonEntry {
  master: string;
  /** Friendly master EQ…/UQ… for UI use. */
  masterFriendly: string;
  name: string;
  symbol: string;
  decimals: number;
  image?: string;
  description?: string;
  /** Raw address of the user's jetton-wallet (active or computed). */
  jettonWallet: string;
  /** True when the jetton-wallet contract is `active` on chain. */
  walletActive: boolean;
  /** On-chain balance in smallest unit, decimal string. */
  onchainBalanceNano: string;
  /** True when the master metadata advertises a custom_payload_api_uri. */
  isRmj: boolean;
  /** RMJ pending claim payload — null if nothing to claim or not RMJ. */
  rmjPending: RmjPending | null;
  /** Optional richer view of the off-chain cumulative (RMJ backend extension). */
  rmjOffchain: RmjOffchainBalance | null;
  customPayloadApiUri?: string;
}

function asFriendly(addr: string, net: Network): string {
  try {
    // We treat `addr` as raw or EQ…; Address.parse handles both.
    // We deliberately avoid importing Address here to keep this module light.
    if (addr.startsWith('0:') || addr.startsWith('-1:')) {
      // raw → friendly is best done where Address is already imported; defer.
    }
  } catch {
    /* ignore */
  }
  void net;
  return addr;
}

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function enrichRmj(
  master: string,
  customPayloadApiUri: string,
  owner: string,
): Promise<{ pending: RmjPending | null; offchain: RmjOffchainBalance | null }> {
  const [pending, offchain] = await Promise.all([
    safe(fetchRmjPending(customPayloadApiUri, owner)),
    safe(fetchRmjOffchainBalance(customPayloadApiUri, owner)),
  ]);
  void master;
  return { pending, offchain };
}

function fromIndexerEntry(b: JettonBalanceRaw, net: Network): JettonEntry {
  const isRmj = Boolean(b.jetton.custom_payload_api_uri);
  return {
    master: b.jetton.address,
    masterFriendly: asFriendly(b.jetton.address, net),
    name: b.jetton.name ?? 'Jetton',
    symbol: b.jetton.symbol ?? '',
    decimals: typeof b.jetton.decimals === 'number' ? b.jetton.decimals : 9,
    image: b.jetton.image,
    description: b.jetton.description,
    jettonWallet: b.walletAddress,
    walletActive: true,
    onchainBalanceNano: b.balance,
    isRmj,
    rmjPending: null,
    rmjOffchain: null,
    customPayloadApiUri: b.jetton.custom_payload_api_uri,
  };
}

export async function buildJettonList(
  net: Network,
  owner: string,
): Promise<JettonEntry[]> {
  const vault = loadVault();
  const watched = vault?.watchedJettons ?? [];

  const [indexed, watchedDetails] = await Promise.all([
    safe(listJettons(net, owner)).then((x) => x ?? []),
    Promise.all(watched.map(async (m) => {
      const info = await safe(getJettonInfo(net, m));
      if (!info) return null;
      const jwAddr = await safe(getJettonWalletAddress(net, m, owner));
      return { info, jw: jwAddr?.toRawString() ?? null };
    })),
  ]);

  const byMaster = new Map<string, JettonEntry>();

  for (const b of indexed) {
    if (!b.jetton.address) continue;
    byMaster.set(b.jetton.address, fromIndexerEntry(b, net));
  }

  for (const w of watchedDetails) {
    if (!w) continue;
    const masterKey = w.info.address;
    if (byMaster.has(masterKey)) continue;
    if (!w.jw) continue;
    byMaster.set(masterKey, {
      master: masterKey,
      masterFriendly: asFriendly(masterKey, net),
      name: w.info.name ?? 'Jetton',
      symbol: w.info.symbol ?? '',
      decimals: w.info.decimals ?? 9,
      image: w.info.image,
      description: w.info.description,
      jettonWallet: w.jw,
      walletActive: false,
      onchainBalanceNano: '0',
      isRmj: Boolean(w.info.customPayloadApiUri),
      rmjPending: null,
      rmjOffchain: null,
      customPayloadApiUri: w.info.customPayloadApiUri,
    });
  }

  const entries = [...byMaster.values()];

  await Promise.all(
    entries.map(async (e) => {
      if (!e.isRmj || !e.customPayloadApiUri) return;
      const { pending, offchain } = await enrichRmj(e.master, e.customPayloadApiUri, owner);
      e.rmjPending = pending;
      e.rmjOffchain = offchain;
    }),
  );

  /** Sort: RMJ-with-pending first, then by on-chain balance, then alphabetically. */
  entries.sort((a, b) => {
    const pendingA = a.rmjPending ? BigInt(a.rmjPending.amount) : 0n;
    const pendingB = b.rmjPending ? BigInt(b.rmjPending.amount) : 0n;
    if (pendingA !== pendingB) return pendingB > pendingA ? 1 : -1;
    const balA = BigInt(a.onchainBalanceNano);
    const balB = BigInt(b.onchainBalanceNano);
    if (balA !== balB) return balB > balA ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/** Total displayed nano-jetton amount = on-chain + pending RMJ delta. */
export function totalNano(entry: JettonEntry): bigint {
  const a = BigInt(entry.onchainBalanceNano);
  const b = entry.rmjPending ? BigInt(entry.rmjPending.amount) : 0n;
  return a + b;
}
