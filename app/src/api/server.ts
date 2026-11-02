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
}

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(cfg.apiUrl + path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `tma ${initData()}`, ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(body.error ?? 'request-failed', res.status);
  return body;
}

export const api = {
  available: () => Boolean(cfg.apiUrl) && Boolean(initData()),
  me: () => call<Me>('/v1/me'),
  link: (address: string) => call<{ ok: true }>('/v1/link', { method: 'POST', body: JSON.stringify({ address }) }),
  /** public: the same answer any wallet or explorer would get */
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
};
export const apiErrorText = (e: unknown) =>
  e instanceof ApiError ? messages[e.code] ?? 'Server is busy, try again' : 'Network error, try again';
