/**
 * Read-only TON RPC + indexer access via Toncenter v2 (RPC) and TonAPI v2
 * (jetton metadata + balances).
 *
 * No API key is required for low-volume usage on mainnet; users can set
 * `VITE_TONCENTER_API_KEY` and `VITE_TONAPI_TOKEN` to lift rate limits.
 */

import { Address, Cell } from '@ton/core';
import { TonClient } from '@ton/ton';

const TONAPI_BASE_MAINNET = 'https://tonapi.io';
const TONAPI_BASE_TESTNET = 'https://testnet.tonapi.io';
const TONCENTER_MAINNET = 'https://toncenter.com/api/v2/jsonRPC';
const TONCENTER_TESTNET = 'https://testnet.toncenter.com/api/v2/jsonRPC';

export type Network = 'mainnet' | 'testnet';

export function getTonApiBase(net: Network): string {
  const override = import.meta.env.VITE_TONAPI_BASE?.trim();
  if (override) return override.replace(/\/+$/, '');
  return net === 'testnet' ? TONAPI_BASE_TESTNET : TONAPI_BASE_MAINNET;
}

export function getTonClient(net: Network): TonClient {
  const endpoint = net === 'testnet' ? TONCENTER_TESTNET : TONCENTER_MAINNET;
  return new TonClient({
    endpoint,
    apiKey: import.meta.env.VITE_TONCENTER_API_KEY?.trim() || undefined,
  });
}

export interface TonAccountInfo {
  /** Nano-TON balance, decimal string. */
  balance: string;
  /** "active" | "uninit" | "frozen". */
  status: string;
  /** Last on-chain seqno of the wallet contract (0 if uninit). */
  lastSeqno: number | null;
}

function tonapiHeaders(): HeadersInit {
  const t = import.meta.env.VITE_TONAPI_TOKEN?.trim();
  return t ? { authorization: `Bearer ${t}` } : {};
}

export async function getAccountInfo(net: Network, address: string): Promise<TonAccountInfo> {
  const a = Address.parse(address).toRawString();
  const res = await fetch(`${getTonApiBase(net)}/v2/accounts/${a}`, { headers: tonapiHeaders() });
  if (!res.ok) throw new Error(`tonapi /accounts: ${res.status}`);
  const j = (await res.json()) as { balance: number | string; status: string };
  return {
    balance: String(j.balance ?? '0'),
    status: j.status ?? 'uninit',
    lastSeqno: null,
  };
}

export interface JettonBalanceRaw {
  /** Nano-jetton balance on-chain (smallest unit; respects metadata.decimals). */
  balance: string;
  /** Jetton-wallet address (raw form). */
  walletAddress: string;
  /** Jetton master metadata as returned by TonAPI. */
  jetton: {
    address: string;
    name?: string;
    symbol?: string;
    decimals?: number;
    image?: string;
    description?: string;
    /** TonAPI surfaces this when the master metadata advertises mintless/RMJ. */
    custom_payload_api_uri?: string;
    verification?: string;
  };
}

export async function listJettons(net: Network, owner: string): Promise<JettonBalanceRaw[]> {
  const a = Address.parse(owner).toRawString();
  const res = await fetch(
    `${getTonApiBase(net)}/v2/accounts/${a}/jettons?currencies=ton&supported_extensions=custom_payload`,
    { headers: tonapiHeaders() },
  );
  if (!res.ok) throw new Error(`tonapi /jettons: ${res.status}`);
  const j = (await res.json()) as { balances?: any[] };
  return (j.balances ?? []).map((b: any) => ({
    balance: String(b.balance ?? '0'),
    walletAddress: b.wallet_address?.address ?? '',
    jetton: {
      address: b.jetton?.address ?? '',
      name: b.jetton?.name,
      symbol: b.jetton?.symbol,
      decimals: b.jetton?.decimals ?? 9,
      image: b.jetton?.image,
      description: b.jetton?.description,
      custom_payload_api_uri: b.jetton?.custom_payload_api_uri,
      verification: b.jetton?.verification,
    },
  }));
}

export interface JettonMasterInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals: number;
  image?: string;
  description?: string;
  customPayloadApiUri?: string;
  totalSupply?: string;
}

export async function getJettonInfo(net: Network, master: string): Promise<JettonMasterInfo> {
  const m = Address.parse(master).toRawString();
  const res = await fetch(`${getTonApiBase(net)}/v2/jettons/${m}`, { headers: tonapiHeaders() });
  if (!res.ok) throw new Error(`tonapi /jettons/{master}: ${res.status}`);
  const j = (await res.json()) as any;
  return {
    address: j.metadata?.address ?? master,
    name: j.metadata?.name,
    symbol: j.metadata?.symbol,
    decimals: Number(j.metadata?.decimals ?? 9),
    image: j.metadata?.image,
    description: j.metadata?.description,
    customPayloadApiUri: j.metadata?.custom_payload_api_uri,
    totalSupply: j.total_supply ? String(j.total_supply) : undefined,
  };
}

/** Wallet-contract derived address for a given jetton master + owner (TEP-74 get-method via Toncenter). */
export async function getJettonWalletAddress(
  net: Network,
  master: string,
  owner: string,
): Promise<Address> {
  const client = getTonClient(net);
  const { stack } = await client.runMethod(Address.parse(master), 'get_wallet_address', [
    { type: 'slice', cell: beginAddressCell(owner) },
  ]);
  return stack.readAddress();
}

import { beginCell } from '@ton/core';
function beginAddressCell(addr: string): Cell {
  return beginCell().storeAddress(Address.parse(addr)).endCell();
}

export async function sendBoc(net: Network, bocBase64: string): Promise<void> {
  const endpoint = net === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2/sendBoc'
    : 'https://toncenter.com/api/v2/sendBoc';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const k = import.meta.env.VITE_TONCENTER_API_KEY?.trim();
  if (k) headers['x-api-key'] = k;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ boc: bocBase64 }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sendBoc ${res.status}: ${text}`);
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    /* tolerate non-JSON */
  }
  if (payload && payload.ok === false) {
    throw new Error(`sendBoc rejected: ${payload.error ?? text}`);
  }
}
