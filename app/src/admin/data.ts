import { Address } from '@ton/core';
import { ton } from '../chain/client';
import { tonapiFetch } from '../chain/tonapi';
import { cfg } from '../config';

export interface Overview {
  me: number; network: string; bot: string; minter: string; vault: string;
  health: { chain: boolean; vault: string | number };
  publisherKey: string;
  stats: { users: number; wallets: number; promised: string; events: number; posts: number; views: number; eggs: number; today: string; newUsersToday: number; hatchesLastHour: number; reactions: number };
  banned: number;
  roots: { seq: number; total: string; treeRoot: string; at: number }[];
  settings: { values: Record<string, string>; spec: Record<string, { label: string; unit: string; min: number; max: number; def: string; group: string; hint?: string; integer?: boolean }> };
  team: { id: number; root: boolean; by?: number; at?: number }[];
  chats: { chatId: number; title: string | null; username: string | null; kind: string | null; isAdmin: number }[];
  posts: { id: number; chatId: number; username: string | null; messageId: number; hatches: number; views: number; reactions: number; active: number; at: number }[];
  log: { who: number; action: string; detail: string; at: number }[];
}

export interface TokenInfo {
  address: Address;
  name: string; symbol: string; description: string; image: string; decimals: string;
  supply: bigint; holders: number;
  admin: Address | null; nextAdmin: Address | null;
  maxSupply: bigint; maxGrowth: bigint; periodSeconds: number; windowGrowth: bigint; maxTotal: bigint;
  walletDaily: bigint; walletBurst: bigint; frozen: boolean; publisherKey: string; legacyCap: bigint;
}

/** Everything the token contract says about itself (admin, limits, key, metadata): read from the chain, not from the bot. */
export async function readToken(minterRaw: string): Promise<TokenInfo> {
  const address = Address.parseRaw(minterRaw);
  const c = ton();
  const num = async (m: string) => (await c.runMethod(address, m)).stack;
  const [jetton, data, next, limits, key, legacy, max] = await Promise.all([
    tonapiFetch(`/v2/jettons/${minterRaw}`).then((r) => r.json() as Promise<{ metadata?: Record<string, string>; holders_count?: number; total_supply?: string }>),
    num('get_jetton_data'),
    num('get_next_admin_address'),
    num('get_limits'),
    num('get_publisher_key'),
    num('get_legacy_key'),
    num('get_max_supply'),
  ]);
  data.readBigNumber(); data.readBigNumber();
  const admin = data.readAddressOpt();
  const nextAdmin = next.readAddressOpt();
  const l = limits;
  const [maxGrowth, period, , windowGrowth, maxTotal, walletDaily, walletBurst] = [l.readBigNumber(), l.readBigNumber(), l.readBigNumber(), l.readBigNumber(), l.readBigNumber(), l.readBigNumber(), l.readBigNumber()];
  l.readBigNumber(); // launchAt
  const frozen = l.readBigNumber() !== 0n;
  const md = jetton.metadata ?? {};
  legacy.readBigNumber();
  return {
    address, name: md.name ?? '', symbol: md.symbol ?? '', description: md.description ?? '', image: md.image ?? '', decimals: md.decimals ?? '9',
    supply: BigInt(jetton.total_supply ?? '0'), holders: jetton.holders_count ?? 0, admin, nextAdmin,
    maxSupply: max.readBigNumber(), maxGrowth, periodSeconds: Number(period), windowGrowth, maxTotal, walletDaily, walletBurst, frozen,
    publisherKey: key.readBigNumber().toString(16).padStart(64, '0'), legacyCap: legacy.readBigNumber(),
  };
}

export const activeMinter = () => cfg.master;
