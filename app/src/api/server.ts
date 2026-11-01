import { Cell } from '@ton/core';
import { cfg } from '../config';
import { initData } from '../lib/tg';

export interface Me {
  tg_id: number;
  address: string | null;
  cumulative: string;
  claim_locked: boolean;
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
  async claim() {
    const r = await call<{ claim: string; cumulative: string; valid_until: number }>('/v1/claim', { method: 'POST' });
    return { claim: Cell.fromBase64(r.claim), cumulative: BigInt(r.cumulative), validUntil: r.valid_until };
  },
};

const messages: Record<string, string> = {
  'wallet-not-linked': 'Wallet is not linked yet',
  'nothing-to-claim': 'Nothing to move yet — go hatch some eggs',
  'address-locked': 'This Telegram account is already bound to another wallet',
  'address-taken': 'This wallet belongs to another Telegram account',
  banned: 'This account is restricted',
  'signer-certificate-expired': 'Claims are paused for maintenance — try again soon',
  unauthorized: 'Open the wallet from Telegram to sync EGG',
};
export const apiErrorText = (e: unknown) =>
  e instanceof ApiError ? messages[e.code] ?? 'Server is busy, try again' : 'Network error, try again';
