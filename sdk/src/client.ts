/**
 * Universal, runtime-agnostic client for a Rolling Mintless Jetton backend.
 *
 * Works in Node.js (v18+, native fetch), edge workers, browsers, Telegram
 * Mini Apps. Zero dependencies beyond optional @ton/core (peer) for typed
 * Address handling.
 *
 * Typical usage inside a bot:
 *
 *     import { RMJClient } from '@rmj/sdk';
 *
 *     const rmj = new RMJClient({
 *       baseUrl: 'https://rmj.example.com',
 *       actionSecret: process.env.RMJ_GAME_API_KEY, // optional
 *     });
 *
 *     await rmj.recordAction({
 *       address: userWalletAddress,
 *       source: 'telegram-inline',
 *     });
 *
 * Typical usage inside a TMA (user-facing):
 *
 *     const balance = await rmj.getBalance(userWalletAddress);
 *     const payload = await rmj.getCustomPayload(userWalletAddress);
 *     // Then use TON Connect to send a transfer with payload.custom_payload
 *     // as the `custom_payload` of the jetton transfer message.
 */

import type { BalanceDisplayMode } from './formatBalance';
import { Address } from '@ton/core';

/**
 * Raw owner segment for wallet-facing mintless URLs (`workchain:hex`, not UQ/EQ).
 */
export function addressToApiPathSegment(address: string): string {
  return Address.parse(address).toRawString();
}

/** Friendly EQ… path segment for `/api/v1/jettons/{master}/…`. */
export function jettonMasterPathSegment(
  master: string,
  tonNetwork: 'testnet' | 'mainnet' = 'mainnet',
): string {
  return Address.parse(master).toString({
    urlSafe: true,
    bounceable: true,
    testOnly: tonNetwork === 'testnet',
  });
}

export interface RMJClientOptions {
  /** Base URL of the backend (no trailing slash). */
  baseUrl: string;
  /**
   * Jetton master address (EQ… / UQ… / 0:…). Required for {@link RMJClient.getCustomPayload}
   * (mintless API is per-master: `/api/v1/jettons/{master}/wallet/{owner}`).
   */
  jettonMasterAddress?: string;
  /** Used when formatting the master segment in mintless URLs (default `mainnet`). */
  tonNetwork?: 'testnet' | 'mainnet';
  /**
   * Optional bearer token. When set the SDK passes it as
   * `Authorization: Bearer <secret>` on admin routes.
   */
  adminSecret?: string;
  /**
   * Optional static fetch implementation. Defaults to the global `fetch`
   * (Node 18+, edge runtimes, browsers).
   */
  fetch?: typeof fetch;
  /** Request timeout in milliseconds. Default 10 s. */
  timeoutMs?: number;
}

export interface ActionInput {
  /** TON address in any standard format (EQ…, UQ…, raw). */
  address: string;
  /** Where the action was triggered from. */
  source?: 'web' | 'telegram-inline' | 'tma' | 'api';
  /** Optional override of per-tap reward (same units as server `TAP_VALUE_NANO`, decimal string). */
  rewardNano?: string;
  /** Arbitrary metadata persisted in tap_events for anti-cheat forensics. */
  meta?: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  cumulative?: string;
  delta?: string;
  reason?: string;
  /** Present when `ok` — matches backend `PUBLIC_BALANCE_DISPLAY`. */
  balanceDisplay?: BalanceDisplayMode;
}

export interface BalanceInfo {
  address: string;
  cumulativeOffchain: string;
  cumulativeInTree: string;
  epoch: number;
  balanceDisplay: BalanceDisplayMode;
}

export interface CustomPayloadInfo {
  /** Base64-encoded BoC to attach as `custom_payload` in the transfer. */
  customPayload: string;
  /** Base64-encoded BoC or null. Non-null when the wallet is not yet deployed. */
  stateInit: string | null;
  amount: string;
  startFrom: number;
  expiredAt: number;
  epoch: number;
  root: string;
}

export interface BackendStatus {
  epoch: number;
  root: string;
  treeSize: number;
  signer: string;
  balanceDisplay: BalanceDisplayMode;
}

/** Resolved jetton-wallet contract for the configured RMJ master (+ deploy payload when needed). */
export interface JettonWalletInfo {
  jettonMaster: string;
  owner: string;
  jettonWallet: string;
  jettonWalletActive: boolean;
  needsDeploy: boolean;
  walletStateInitBase64: string | null;
}

export class RMJError extends Error {
  constructor(public readonly status: number, public readonly payload: unknown) {
    super(typeof payload === 'object' && payload && 'error' in (payload as any)
      ? String((payload as { error: unknown }).error)
      : `HTTP ${status}`);
    this.name = 'RMJError';
  }
}

export class RMJClient {
  private readonly baseUrl: string;
  private readonly jettonMasterAddress?: string;
  private readonly tonNetwork: 'testnet' | 'mainnet';
  private readonly adminSecret?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: RMJClientOptions) {
    if (!opts.baseUrl) throw new Error('RMJClient: baseUrl is required');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.jettonMasterAddress = opts.jettonMasterAddress?.trim() || undefined;
    this.tonNetwork = opts.tonNetwork ?? 'mainnet';
    this.adminSecret = opts.adminSecret;
    /**
     * Browser fetch must be invoked with the correct `this` (see DOM “Illegal invocation”).
     * Telegram WebView / some embedded browsers throw "'fetch' called on an object that does not implement interface Window"
     * if we keep a loose reference — always bind to `globalThis`.
     */
    const g = globalThis as typeof globalThis & { fetch?: typeof fetch };
    if (opts.fetch) {
      this.fetchImpl = opts.fetch;
    } else if (typeof g.fetch === 'function') {
      this.fetchImpl = g.fetch.bind(g);
    } else {
      throw new Error('RMJClient: no fetch implementation available (pass opts.fetch)');
    }
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { admin?: boolean } = {},
  ): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (!headers.has('content-type') && init.body) {
        headers.set('content-type', 'application/json');
      }
      if (init.admin) {
        if (!this.adminSecret) {
          throw new Error('RMJClient: admin call requires adminSecret to be set');
        }
        headers.set('authorization', `Bearer ${this.adminSecret}`);
      }
      const res = await this.fetchImpl(this.baseUrl + path, {
        ...init,
        headers,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        throw new RMJError(res.status, body);
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Record a single reward-earning action. Typical payloads:
   *
   *   await rmj.recordAction({ address: '<user address>', source: 'telegram-inline' });
   */
  async recordAction(input: ActionInput): Promise<ActionResult> {
    const body = JSON.stringify({
      address: input.address,
      source: input.source ?? 'api',
      reward: input.rewardNano,
      meta: input.meta,
    });
    const r = await this.request<
      | {
          ok: true;
          cumulative_offchain: string;
          delta_applied: string;
          balance_display?: BalanceDisplayMode;
        }
      | { error: string }
    >(`/api/v1/action`, { method: 'POST', body });
    if ('ok' in r && r.ok) {
      return {
        ok: true,
        cumulative: r.cumulative_offchain,
        delta: r.delta_applied,
        balanceDisplay: r.balance_display ?? 'integer',
      };
    }
    return { ok: false, reason: 'error' in r ? r.error : 'unknown' };
  }

  async recordActionsBulk(actions: ActionInput[]): Promise<ActionResult[]> {
    const body = JSON.stringify({
      actions: actions.map((a) => ({
        address: a.address,
        source: a.source ?? 'api',
        reward: a.rewardNano,
        meta: a.meta,
      })),
    });
    const r = await this.request<{ results: Array<any> }>(`/api/v1/action/bulk`, {
      method: 'POST',
      body,
    });
    return r.results.map((x) =>
      x.ok
        ? {
            ok: true,
            cumulative: x.cumulative,
            delta: x.delta,
            balanceDisplay: x.balance_display ?? 'integer',
          }
        : { ok: false, reason: x.reason },
    );
  }

  async getBalance(address: string): Promise<BalanceInfo> {
    const r = await this.request<{
      address: string;
      cumulative_offchain: string;
      cumulative_in_tree: string;
      epoch: number;
      balance_display?: BalanceDisplayMode;
    }>(`/api/v1/balance/${addressToApiPathSegment(address)}`);
    return {
      address: r.address,
      cumulativeOffchain: r.cumulative_offchain,
      cumulativeInTree: r.cumulative_in_tree,
      epoch: r.epoch,
      balanceDisplay: r.balance_display ?? 'integer',
    };
  }

  async getCustomPayload(address: string, jettonMasterAddress?: string): Promise<CustomPayloadInfo | null> {
    const master = jettonMasterAddress?.trim() || this.jettonMasterAddress;
    if (!master) {
      throw new Error(
        'RMJClient: jettonMasterAddress is required for getCustomPayload (constructor option or method argument)',
      );
    }
    const masterSeg = jettonMasterPathSegment(master, this.tonNetwork);
    try {
      const r = await this.request<{
        owner: string;
        jetton_wallet: string;
        custom_payload: string;
        state_init: string | null;
        compressed_info: { amount: string; start_from: string; expired_at: string };
        epoch?: number;
        root?: string;
      }>(`/api/v1/jettons/${masterSeg}/wallet/${addressToApiPathSegment(address)}`);
      return {
        customPayload: r.custom_payload,
        stateInit: r.state_init,
        amount: r.compressed_info.amount,
        startFrom: Number(r.compressed_info.start_from),
        expiredAt: Number(r.compressed_info.expired_at),
        epoch: r.epoch ?? 0,
        root: r.root ?? '',
      };
    } catch (e) {
      if (e instanceof RMJError && e.status === 404) return null;
      throw e;
    }
  }

  async getStatus(): Promise<BackendStatus> {
    const r = await this.request<{
      epoch: number;
      root: string;
      tree_size: number;
      signer: string;
      balance_display?: BalanceDisplayMode;
    }>(`/api/v1/status`);
    return {
      epoch: r.epoch,
      root: r.root,
      treeSize: r.tree_size,
      signer: r.signer,
      balanceDisplay: r.balance_display ?? 'integer',
    };
  }

  /**
   * Jetton-wallet address for this owner + optional StateInit (base64) when the wallet is not deployed yet.
   * Used with TON Connect to send a self-transfer with {@link getCustomPayload} attached.
   */
  async getJettonWallet(owner: string): Promise<JettonWalletInfo> {
    const r = await this.request<{
      jetton_master: string;
      owner: string;
      jetton_wallet: string;
      jetton_wallet_active: boolean;
      needs_deploy: boolean;
      wallet_state_init_base64: string | null;
    }>(`/api/v1/jetton-wallet/${addressToApiPathSegment(owner)}`);
    return {
      jettonMaster: r.jetton_master,
      owner: r.owner,
      jettonWallet: r.jetton_wallet,
      jettonWalletActive: r.jetton_wallet_active,
      needsDeploy: r.needs_deploy,
      walletStateInitBase64: r.wallet_state_init_base64,
    };
  }

  async advanceEpoch(): Promise<{ advanced: boolean; epoch: number; root: string }> {
    return this.request(`/api/v1/admin/advance-epoch`, { method: 'POST', admin: true });
  }

  async banUser(address: string, banned: boolean): Promise<void> {
    await this.request(`/api/v1/admin/ban`, {
      method: 'POST',
      admin: true,
      body: JSON.stringify({ address, banned }),
    });
  }

  async grantReward(address: string, amountNano: string, source: ActionInput['source'] = 'api'): Promise<void> {
    await this.request(`/api/v1/admin/grant`, {
      method: 'POST',
      admin: true,
      body: JSON.stringify({ address, amount_nano: amountNano, source }),
    });
  }
}
