import { Address } from '@ton/core';
import { TONAPI_BASE, TONAPI_KEY } from '../config';
import type { JettonBalance, NftItem, TonAccountInfo } from '../types';

function tonapiHeaders(): HeadersInit {
  const h: Record<string, string> = { accept: 'application/json' };
  if (TONAPI_KEY) h.Authorization = `Bearer ${TONAPI_KEY}`;
  return h;
}

async function tonapiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${TONAPI_BASE}${path}`, { headers: tonapiHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TonAPI ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function friendly(addr: string): string {
  return Address.parse(addr).toString({ urlSafe: true, bounceable: false });
}

export async function fetchAccount(address: string): Promise<TonAccountInfo> {
  const raw = Address.parse(address).toRawString();
  const data = await tonapiGet<{
    address: string;
    balance: number;
    status: TonAccountInfo['status'];
  }>(`/v2/accounts/${encodeURIComponent(raw)}`);

  return {
    address: friendly(data.address),
    balanceNano: BigInt(data.balance),
    status: data.status,
  };
}

interface TonApiJettonRow {
  balance: string;
  wallet_address: { address: string };
  jetton: {
    address: string;
    name?: string;
    symbol?: string;
    decimals?: number;
    image?: string;
    custom_payload_api_uri?: string;
  };
}

export async function fetchJettonBalances(address: string): Promise<JettonBalance[]> {
  const raw = Address.parse(address).toRawString();
  const data = await tonapiGet<{ balances: TonApiJettonRow[] }>(
    `/v2/accounts/${encodeURIComponent(raw)}/jettons`,
  );

  return (data.balances ?? []).map((row) => ({
    jettonMaster: friendly(row.jetton.address),
    jettonWallet: friendly(row.wallet_address.address),
    balanceNano: BigInt(row.balance),
    name: row.jetton.name?.trim() || 'Unknown jetton',
    symbol: row.jetton.symbol?.trim() || 'JETTON',
    decimals: row.jetton.decimals ?? 9,
    image: row.jetton.image,
    customPayloadApiUri: row.jetton.custom_payload_api_uri,
  }));
}

interface TonApiNftRow {
  address: string;
  index: string;
  metadata?: { name?: string; description?: string; image?: string };
  collection?: { address: string; name?: string };
  previews?: Array<{ resolution: string; url: string }>;
}

export async function fetchNfts(address: string, limit = 100): Promise<NftItem[]> {
  const raw = Address.parse(address).toRawString();
  const data = await tonapiGet<{ nft_items: TonApiNftRow[] }>(
    `/v2/accounts/${encodeURIComponent(raw)}/nfts?limit=${limit}`,
  );

  return (data.nft_items ?? []).map((nft) => {
    const preview =
      nft.previews?.find((p) => p.resolution === '500x500')?.url ??
      nft.previews?.[0]?.url ??
      nft.metadata?.image;

    return {
      address: friendly(nft.address),
      collection: nft.collection
        ? { address: friendly(nft.collection.address), name: nft.collection.name ?? 'Collection' }
        : undefined,
      name: nft.metadata?.name?.trim() || `NFT #${nft.index}`,
      description: nft.metadata?.description,
      image: preview,
      index: nft.index,
    };
  });
}

/** Fetch jetton metadata when not included in balance list (e.g. custom_payload_api_uri). */
export async function fetchJettonMetadata(master: string): Promise<{
  customPayloadApiUri?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  image?: string;
}> {
  const raw = Address.parse(master).toRawString();
  try {
    const data = await tonapiGet<{
      metadata?: Record<string, string>;
      preview?: string;
    }>(`/v2/jettons/${encodeURIComponent(raw)}`);

    const md = data.metadata ?? {};
    return {
      customPayloadApiUri: md.custom_payload_api_uri,
      name: md.name,
      symbol: md.symbol,
      decimals: md.decimals ? Number(md.decimals) : undefined,
      image: md.image ?? data.preview,
    };
  } catch {
    return {};
  }
}
