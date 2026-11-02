import { Cell } from '@ton/core';
import { Entitlement } from '@egg/sdk';
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
  /** sponsored (gasless) requests this account can still use */
  sponsored_left: number;
}

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
  /** nudges the publisher in the bot's runtime; fire and forget */
  kick: () => call<{ status: string }>('/v1/kick').catch(() => undefined),
  /** Links the wallet to the Telegram account; the signature proves the caller holds the wallet's key. */
  link: (address: string, publicKey: string, signature: string, replace = false) =>
    call<{ ok: true }>('/v1/link', { method: 'POST', body: JSON.stringify({ address, public_key: publicKey, signature, replace }) }),
  /** public: the same answer any wallet or explorer would get */
  relay: (request: string, publicKey: string) =>
    call<{ ok: true; remaining: number }>('/v1/relay', { method: 'POST', body: JSON.stringify({ request, public_key: publicKey }) }),
  entitlement: (rawAddress: string) => call<Entitlement>(`/v1/entitlement/${encodeURIComponent(rawAddress)}`),
};

export const proofCell = (e: Entitlement) => Cell.fromBase64(e.proof);

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
