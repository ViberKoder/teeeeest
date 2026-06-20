/**
 * Rolling-Mintless-Jetton-aware client used by the wallet.
 *
 * For every jetton master that advertises `custom_payload_api_uri` in its TEP-64
 * metadata, the wallet treats it as RMJ-compatible.  We can then:
 *
 *   1. Show a "pending off-chain" balance even when the user has never claimed
 *      anything (the on-chain jetton-wallet is `uninit`).
 *   2. Attach the Proof API's `custom_payload` (and `state_init` for first-time
 *      claims) to the user's first jetton transfer so the claim happens silently.
 *
 * The API surface follows Tonkeeper's "jetton offchain payloads" TEP and the
 * RMJ backend implementation in this repository:
 *
 *   GET {custom_payload_api_uri}/wallet/{owner_raw}
 *      -> 200 { owner, jetton_wallet, custom_payload, state_init,
 *               compressed_info: { amount, start_from, expired_at } (all strings, TEP-176),
 *               epoch?, root? (RMJ extras on /wallet only; /wallets batch is owner + compressed_info) }
 *      -> 404 nothing-to-claim / address-not-in-tree
 *
 *   GET {backendBase}/api/v1/balance/{owner}   (RMJ extension)
 *      -> { cumulative_offchain, cumulative_in_tree, epoch, balance_display }
 */

import { Address } from '@ton/core';

export interface RmjPending {
  /** Nano-jetton amount that will be credited at next transfer (delta against on-chain). */
  amount: string;
  /** Tonkeeper TEP fields. */
  startFrom: number;
  expiredAt: number;
  /** Jetton-wallet contract that should receive the transfer. */
  jettonWallet: string;
  /** Base64 BoC of `custom_payload` cell. */
  customPayload: string;
  /** Base64 BoC of jetton-wallet StateInit when contract is uninit, else null. */
  stateInit: string | null;
  /** Server-published epoch + root, surfaced in the UI for transparency. */
  epoch: number;
  root: string;
}

export interface RmjOffchainBalance {
  cumulativeOffchain: string;
  cumulativeInTree: string;
  epoch: number;
  balanceDisplay: 'integer' | 'jetton_nano';
}

function trim(u: string): string {
  return u.replace(/\/+$/, '');
}

export function parseCustomPayloadUri(uri: string): {
  /** Backend root, e.g. https://example.com */
  backend: string;
  /** API root including master, e.g. https://example.com/api/v1/jettons/EQ… */
  apiRoot: string;
} {
  const apiRoot = trim(uri);
  // Backend = everything before "/api/v1/" if present, else the URL origin.
  const m = apiRoot.match(/^(.*?)\/api\/v1\/jettons\/[^/]+$/);
  if (m) return { backend: m[1], apiRoot };
  const u = new URL(apiRoot);
  return { backend: `${u.protocol}//${u.host}`, apiRoot };
}

export async function fetchRmjPending(
  customPayloadApiUri: string,
  owner: string,
  opts?: { retries?: number },
): Promise<RmjPending | null> {
  const { apiRoot } = parseCustomPayloadUri(customPayloadApiUri);
  const ownerRaw = Address.parse(owner).toRawString();
  const url = `${apiRoot}/wallet/${encodeURIComponent(ownerRaw)}`;
  const attempts = Math.max(1, opts?.retries ?? 3);

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`mintless wallet API ${res.status}`);
      const j = (await res.json()) as {
        jetton_wallet: string;
        custom_payload: string;
        state_init?: string | null;
        compressed_info: { amount: string; start_from: string; expired_at: string };
        epoch?: number;
        root?: string;
      };
      return {
        amount: j.compressed_info.amount,
        startFrom: Number(j.compressed_info.start_from),
        expiredAt: Number(j.compressed_info.expired_at),
        jettonWallet: j.jetton_wallet,
        customPayload: j.custom_payload,
        stateInit: j.state_init ?? null,
        epoch: j.epoch ?? 0,
        root: j.root ?? '',
      };
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}

/**
 * Optional richer balance endpoint provided by RMJ backends — gives the full
 * lifetime cumulative even when the latest epoch hasn't been committed yet.
 * Returns null if the backend doesn't implement it (any non-200).
 */
export async function fetchRmjOffchainBalance(
  customPayloadApiUri: string,
  owner: string,
): Promise<RmjOffchainBalance | null> {
  const { backend } = parseCustomPayloadUri(customPayloadApiUri);
  const ownerSeg = Address.parse(owner).toRawString();
  try {
    const res = await fetch(`${backend}/api/v1/balance/${ownerSeg}`);
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    return {
      cumulativeOffchain: String(j.cumulative_offchain ?? '0'),
      cumulativeInTree: String(j.cumulative_in_tree ?? '0'),
      epoch: Number(j.epoch ?? 0),
      balanceDisplay: (j.balance_display as any) ?? 'integer',
    };
  } catch {
    return null;
  }
}

/**
 * Lookup a watched jetton master URL → custom_payload_api_uri.
 *
 * Wallets that *only* know the jetton master address (because the user added
 * it to their watch-list before any on-chain interaction) must read the
 * on-chain content URI from TonAPI's jetton metadata.  We expose this as a
 * thin helper so callers can decide cache/refresh policy.
 */
export async function discoverCustomPayloadUri(
  tonapiBase: string,
  master: string,
  authToken?: string,
): Promise<string | null> {
  const headers: HeadersInit = authToken ? { authorization: `Bearer ${authToken}` } : {};
  const m = Address.parse(master).toRawString();
  const res = await fetch(`${tonapiBase}/v2/jettons/${m}`, { headers });
  if (!res.ok) return null;
  const j = (await res.json()) as any;
  return j.metadata?.custom_payload_api_uri ?? null;
}
