import { Cell } from '@ton/core';
import { Entitlement, signedRootCell } from '@egg/sdk';
import { cfg } from '../config';
import { initData } from '../lib/tg';

export interface Me {
  tg_id: number;
  address: string | null;
  /** everything the ledger owes this player (jetton units) */
  ledger: string;
  /** the part already committed on-chain and provable, or null */
  entitlement: Entitlement | null;
  address_locked: boolean;
  banned: boolean;
  is_admin?: boolean;
  /** sponsored (gasless) requests this account can still use */
  sponsored_left: number;
}

export interface Stats {
  t: number; users: number; wallets: number; newUsersToday: number; lastUserAt: number;
  promised: string; events: number; lastEventAt: number; today: string; eventsToday: number; hatchesLastHour: number;
  posts: number; views: number; postHatches: number; eggs: number; eggHatches: number; reactions: number;
  latestPost: { id: number; title: string; username: string | null; messageId: number; hatches: number; views: number; reactions: number; caption: string | null; at: number } | null;
  root: { seq: number; treeRoot: string; total: string; signature: string; at: number } | null;
}
export interface StatsReply {
  stats: Stats;
  recent: { kind: string; amount: string; t: number; who: string }[];
  days: { egg: { d: number; egg: string; n: number }[]; users: { d: number; n: number }[] } | null;
  top: { username: string | null; messageId: number; hatches: number; views: number; reactions: number; at: number }[];
  /** players per interface language: where the eggs travel */
  langs?: [string, number][];
  battle?: { week: number; endsAt: number; board: { rank: number; chatId: number; title: string; username: string | null; score: number; players: number }[] };
}
export interface LookupReply { found: boolean; address?: string | null; ledger?: string; since?: number; entitlement?: Entitlement | null }

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

/** Telegram's own serverless runtime: the Mini App talks to the bot's endpoints, no server of ours in between. */
interface Serverless {
  call(name: string, input: object, cb: (err: { message?: string; type?: string; parameters?: { code?: string } } | null, result?: unknown) => void): void;
}
const serverless = (): Serverless | null => (window as unknown as { Telegram?: { WebApp?: { Serverless?: Serverless } } }).Telegram?.WebApp?.Serverless ?? null;
const useServerless = () => !cfg.apiUrl && Boolean(serverless());

function viaServerless<T>(name: string, input: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new ApiError('timeout', 504)); } }, 9000);
    serverless()!.call(name, input, (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (!err) return resolve(result as T);
      const code = err.parameters?.code ?? err.message ?? 'request-failed';
      reject(new ApiError(code, code === 'no-entitlement' ? 404 : err.type === 'ENDPOINT_ERROR' ? 400 : 500));
    });
  });
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (useServerless()) {
    const name = path.replace(/^\/v1\//, '').split('/')[0];
    if (name === 'relay') throw new ApiError('relay-unavailable', 503);
    const input = init.body ? (JSON.parse(String(init.body)) as object) : {};
    return viaServerless<T>(name === 'entitlement' ? 'entitlement' : name, name === 'entitlement' ? { address: decodeURIComponent(path.split('/')[3] ?? '') } : input);
  }
  const res = await fetch(cfg.apiUrl + path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `tma ${initData()}`, ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(body.error ?? 'request-failed', res.status);
  return body;
}

export const api = {
  available: () => (Boolean(cfg.apiUrl) || Boolean(serverless())) && Boolean(initData()),
  me: () => call<Me>('/v1/me'),
  /** where to send EGG / TON for a @username: their own wallet, or the one prepared for them */
  walletFor: (username: string) => call<{ username: string; address: string; ready: boolean }>('/v1/walletFor', { method: 'POST', body: JSON.stringify({ username }) }),
  /** a wallet that somebody already sent money to, waiting for this account's first visit */
  prepared: () => call<{ address: string | null }>('/v1/prepared', { method: 'POST', body: '{}' }),
  /** hand that wallet over to a key generated on this device (poll until "done") */
  adopt: (publicKey: string, signature: string) =>
    call<{ status: 'funding' | 'sent' | 'done' | 'taken' | 'bad-proof' | 'none'; address?: string }>('/v1/adopt', { method: 'POST', body: JSON.stringify({ public_key: publicKey, signature }) }),
  /** Links the wallet to the Telegram account; the signature proves the caller holds the wallet's key. */
  link: (address: string, publicKey: string, signature: string, replace = false) =>
    call<{ ok: true }>('/v1/link', { method: 'POST', body: JSON.stringify({ address, public_key: publicKey, signature, replace }) }),
  /** admin panel (the bot checks the Telegram account is an admin) */
  admin: <T = unknown>(input: Record<string, unknown>) => call<T>('/v1/admin', { method: 'POST', body: JSON.stringify(input) }),
  /** which token contract is active */
  config: () => call<{ minter: string; network: string; bot: string }>('/v1/config', { method: 'POST', body: '{}' }),
  /** the bot pays a new player's first network fee (once per account) */
  gas: () => call<{ status: 'sent' | 'enough' }>('/v1/gas', { method: 'POST', body: '{}' }),
  /** live project numbers (explorer inside Telegram) */
  stats: (days = false) => call<StatsReply>('/v1/stats', { method: 'POST', body: JSON.stringify({ days }) }),
  /** internal data for a wallet or @username, to compare with the chain */
  lookup: (q: string) => call<LookupReply>('/v1/lookup', { method: 'POST', body: JSON.stringify({ q }) }),
  /** public: the same answer any wallet or explorer would get */
  relay: (request: string, publicKey: string) =>
    call<{ ok: true; remaining: number }>('/v1/relay', { method: 'POST', body: JSON.stringify({ request, public_key: publicKey }) }),
  entitlement: (rawAddress: string) => call<Entitlement>(`/v1/entitlement/${encodeURIComponent(rawAddress)}`),
};

export const proofCell = (e: Entitlement) => Cell.fromBase64(e.proof);
export const rootCell = (e: Entitlement) => signedRootCell(e.root);

/**
 * The last verified entitlement is kept on the device. A proof is self-contained and stays valid against the
 * on-chain root forever, so the user can still hatch if the API is gone — the contract, not the server, decides.
 */
const CACHE_KEY = 'egg.entitlement.v1';
export const entitlementCache = {
  read(owner: string): Entitlement | null {
    try {
      const e = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Entitlement | null;
      return e && e.owner === owner ? e : null;
    } catch {
      return null;
    }
  },
  write(e: Entitlement) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(e));
    } catch {
      /* private mode: fine, the API is still the normal path */
    }
  },
};

const messages: Record<string, string> = {
  'address-locked': 'This Telegram account is already bound to another wallet',
  'address-taken': 'This wallet belongs to another Telegram account',
  banned: 'This account is restricted',
  unauthorized: 'Open the wallet from Telegram to sync EGG',
  'no-entitlement': 'Nothing is committed on-chain for you yet',
  'sponsorship-used-up': 'Your free hatches are used up — add a little TON for fees',
  'pay-yourself': 'Your wallet can pay its own fee',
};
export const apiErrorText = (e: unknown) =>
  e instanceof ApiError ? messages[e.code] ?? 'Server is busy, try again' : 'Network error, try again';
