import { Address } from '@ton/core';
import { SignedRoot, verifySignedRoot } from '@egg/sdk';
import { runGetter, tonapiFetch } from '../chain/tonapi';
import { cfg } from '../config';

/** What the token contract itself says (read through TonAPI, nothing from our bot). */
export interface Chain {
  supply: bigint;
  holders: number;
  maxSupply: bigint;
  maxTotal: bigint;
  maxGrowth: bigint;
  periodSeconds: number;
  windowGrowth: bigint;
  walletDaily: bigint;
  frozen: boolean;
  publisherKey: Buffer;
}

const minter = () => Address.parse(cfg.master);

export async function readChain(): Promise<Chain> {
  const raw = minter().toRawString();
  const [jetton, limits, key, max] = await Promise.all([
    tonapiFetch(`/v2/jettons/${raw}`).then((r) => r.json() as Promise<{ total_supply?: string; holders_count?: number }>),
    runGetter(raw, 'get_limits'),
    runGetter(raw, 'get_publisher_key'),
    runGetter(raw, 'get_max_supply'),
  ]);
  const l = limits ?? [];
  return {
    supply: BigInt(jetton.total_supply ?? '0'),
    holders: jetton.holders_count ?? 0,
    maxSupply: max?.[0] ?? 0n,
    maxGrowth: l[0] ?? 0n,
    periodSeconds: Number(l[1] ?? 0n),
    windowGrowth: l[3] ?? 0n,
    maxTotal: l[4] ?? 0n,
    walletDaily: l[5] ?? 0n,
    frozen: (l[8] ?? 0n) !== 0n,
    publisherKey: Buffer.from((key?.[0] ?? 0n).toString(16).padStart(64, '0'), 'hex'),
  };
}

/** Claims seen by the minter (each is one player proving their share against a signed root). */
export interface ClaimTx { t: number; hash: string; wallet: string; ok: boolean }
export async function recentClaims(): Promise<ClaimTx[]> {
  const r = await tonapiFetch(`/v2/blockchain/accounts/${minter().toRawString()}/transactions?limit=30`);
  if (!r.ok) return [];
  const j = (await r.json()) as { transactions: { utime: number; hash: string; success: boolean; in_msg?: { op_code?: string; source?: { address: string } } }[] };
  return j.transactions
    .filter((t) => t.in_msg?.op_code === '0x87a42c7c')
    .map((t) => ({ t: t.utime, hash: t.hash, wallet: t.in_msg?.source?.address ?? '', ok: t.success }));
}

/** The public stats beacon: comments the bot's own wallet writes to itself. Only that wallet's key can write them. */
export interface Beacon {
  /** the active token contract (raw) when the beacon was written */
  mn?: string;
  t: number; u: number; w: number; p: string; e: number; po: number; vi: number; eg: number; re?: number;
  /** newest channel post: [hatches, views, reactions, published at, channel username, channel title] */
  tp?: [number, number, number, number, string, string] | null;
  r: [number, string, string, string] | null;
  tx: string;
}
export async function readBeacons(): Promise<Beacon[]> {
  if (!cfg.vault) return [];
  const vault = Address.parse(cfg.vault).toRawString();
  const r = await tonapiFetch(`/v2/accounts/${vault}/events?limit=100`);
  if (!r.ok) return [];
  const j = (await r.json()) as { events: { event_id: string; actions: { type: string; TonTransfer?: { sender: { address: string }; recipient: { address: string }; comment?: string } }[] }[] };
  const out: Beacon[] = [];
  for (const ev of j.events) {
    for (const a of ev.actions) {
      const t = a.TonTransfer;
      if (a.type !== 'TonTransfer' || !t?.comment?.startsWith('egg-stats:v1 ')) continue;
      // written BY the bot's wallet (anyone can send a comment TO it; only the bot can send FROM it)
      if (Address.parseRaw(t.sender.address).toRawString() !== vault) continue;
      try {
        out.push({ ...(JSON.parse(t.comment.slice(13)) as Omit<Beacon, 'tx'>), tx: ev.event_id });
      } catch {
        /* not ours */
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export const rootFromTuple = (r: [number, string, string, string]): SignedRoot => ({ seq: String(r[0]), total: r[1], treeRoot: r[2], signature: r[3] });

/** A root is the publisher's only if the key stored in the token contract signed it. */
export const rootIsSigned = (root: SignedRoot, key: Buffer) => verifySignedRoot(minter(), root, key);

/** One wallet as the chain sees it: its EGG and how much it has claimed. */
export async function walletOnChain(owner: Address): Promise<{ balance: bigint; claimed: bigint }> {
  const r = await tonapiFetch(`/v2/accounts/${owner.toRawString()}/jettons/${minter().toRawString()}`);
  if (!r.ok) return { balance: 0n, claimed: 0n };
  const j = (await r.json()) as { balance?: string; wallet_address?: { address: string } };
  let claimed = 0n;
  if (j.wallet_address?.address) {
    const cs = await runGetter(j.wallet_address.address, 'get_claim_state').catch(() => null);
    claimed = cs?.[0] ?? 0n;
  }
  return { balance: BigInt(j.balance ?? '0'), claimed };
}

/** A post as the explorer draws it, from the bot (inside Telegram) or from the newest on-chain beacon. */
export interface PostView { title: string; username: string; messageId: number | null; hatches: number; views: number; reactions: number; at: number; caption: string }
export const DEFAULT_CAPTION = '';

export const postFromBeacon = (b: Beacon | undefined): PostView | null =>
  b?.tp ? { hatches: b.tp[0], views: b.tp[1], reactions: b.tp[2], at: b.tp[3], username: b.tp[4], title: b.tp[5] || b.tp[4] || 'Hatch', messageId: null, caption: DEFAULT_CAPTION } : null;

/** The biggest EGG holders, straight from TonAPI's index of the token contract. */
export interface Holder { owner: string; balance: bigint }
export async function readHolders(offset = 0, limit = 50): Promise<{ total: number; items: Holder[] }> {
  const r = await tonapiFetch(`/v2/jettons/${minter().toRawString()}/holders?limit=${limit}&offset=${offset}`);
  if (!r.ok) return { total: 0, items: [] };
  const j = (await r.json()) as { total?: number; addresses?: { address: string; owner?: { address: string }; balance: string }[] };
  return { total: j.total ?? 0, items: (j.addresses ?? []).map((a) => ({ owner: a.owner?.address ?? a.address, balance: BigInt(a.balance) })) };
}

/** EGG transfers of one wallet. */
export interface Move { t: number; hash: string; from: string; to: string; amount: bigint; comment?: string }
export async function walletHistory(owner: Address, limit = 30): Promise<Move[]> {
  const r = await tonapiFetch(`/v2/accounts/${owner.toRawString()}/jettons/${minter().toRawString()}/history?limit=${limit}`);
  if (!r.ok) return [];
  type Act = { type: string; JettonTransfer?: { sender?: { address: string }; recipient?: { address: string }; amount: string; comment?: string } };
  const j = (await r.json()) as { events?: { event_id: string; timestamp: number; actions: Act[] }[] };
  const out: Move[] = [];
  for (const ev of j.events ?? []) {
    for (const a of ev.actions) {
      if (a.type !== 'JettonTransfer' || !a.JettonTransfer) continue;
      out.push({ t: ev.timestamp, hash: ev.event_id, from: a.JettonTransfer.sender?.address ?? '', to: a.JettonTransfer.recipient?.address ?? '', amount: BigInt(a.JettonTransfer.amount), comment: a.JettonTransfer.comment });
    }
  }
  return out;
}

/** The token's own metadata, as the contract stores it. */
export async function readMeta(): Promise<{ name: string; symbol: string; decimals: number; admin: string | null }> {
  const r = await tonapiFetch(`/v2/jettons/${minter().toRawString()}`);
  const j = r.ok ? ((await r.json()) as { metadata?: { name?: string; symbol?: string; decimals?: string }; admin?: { address: string } }) : {};
  return { name: j.metadata?.name ?? 'Egg', symbol: j.metadata?.symbol ?? 'EGG', decimals: Number(j.metadata?.decimals ?? 9), admin: j.admin?.address ?? null };
}
