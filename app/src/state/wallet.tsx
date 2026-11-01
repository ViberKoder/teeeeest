import { Address } from '@ton/core';
import { mnemonicNew, mnemonicValidate } from '@ton/crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, Me } from '../api/server';
import { Activity, loadActivity } from '../chain/history';
import { EggState, readEgg } from '../chain/egg';
import { ton } from '../chain/client';
import { cfg } from '../config';
import { attempts, decryptPhrase, encryptPhrase, vaultStore } from '../crypto/vault';
import { BuiltinProvider } from '../provider/builtin';
import { TonConnectProvider, tonConnect } from '../provider/tonconnect';
import type { WalletProvider } from '../provider/types';
import { haptic } from '../lib/tg';

export type Phase = 'boot' | 'welcome' | 'locked' | 'ready';

export interface Data {
  ton: bigint;
  egg: EggState | null;
  me: Me | null;
  activity: Activity[];
  /** what the project owes you but is not on-chain yet */
  pending: bigint;
  loading: boolean;
  error: string | null;
}

const empty: Data = { ton: 0n, egg: null, me: null, activity: [], pending: 0n, loading: true, error: null };

interface Ctx {
  phase: Phase;
  provider: WalletProvider | null;
  data: Data;
  masterAddress: Address | null;
  lockedAddress: string | null;
  refresh: () => Promise<void>;
  createWallet: (words: string[], passcode: string) => Promise<void>;
  newMnemonic: () => Promise<string[]>;
  validateMnemonic: (words: string[]) => Promise<boolean>;
  unlock: (passcode: string) => Promise<'ok' | 'wrong' | 'throttled'>;
  lock: () => void;
  revealPhrase: (passcode: string) => Promise<string[] | null>;
  useExternal: () => void;
  signOut: () => Promise<void>;
  /** demo fixtures only: jump straight to a screen */
  setDemo: (phase: Phase, p?: WalletProvider, d?: Data) => void;
}

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error('WalletProvider missing');
  return c;
};

const AUTO_LOCK_MS = 5 * 60_000;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [demo, setDemoState] = useState(false);
  const lastActive = useRef(Date.now());

  const masterAddress = useMemo(() => {
    try {
      return cfg.master ? Address.parse(cfg.master) : null;
    } catch {
      return null;
    }
  }, []);

  const blob = vaultStore.read();
  const lockedAddress = blob?.address ?? null;

  // ---- boot: external wallet session > encrypted vault > welcome ----------
  useEffect(() => {
    if (cfg.demo) return;
    const u = tonConnect();
    void u.connectionRestored.then(() => {
      const ext = TonConnectProvider.fromConnected();
      if (ext) {
        setProvider(ext);
        setPhase('ready');
      } else setPhase(vaultStore.read() ? 'locked' : 'welcome');
    });
    return u.onStatusChange((w) => {
      if (!w) return;
      const ext = TonConnectProvider.fromConnected();
      if (ext) {
        setProvider(ext);
        setPhase('ready');
      }
    });
  }, []);

  // ---- data ---------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (demo || !provider) return;
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const [balance, egg, me, activity] = await Promise.all([
        ton().getBalance(provider.address),
        masterAddress ? readEgg(masterAddress, provider.address) : Promise.resolve(null),
        api.available() ? api.me().catch(() => null) : Promise.resolve(null),
        loadActivity(provider.address, masterAddress).catch(() => [] as Activity[]),
      ]);
      // The server balance only counts for the wallet it is linked to.
      const linkedHere = me?.address ? me.address === provider.address.toRawString() : true;
      const owed = me && linkedHere ? BigInt(me.cumulative) : 0n;
      const claimed = egg?.claimed ?? 0n;
      setData({ ton: balance, egg, me, activity, pending: owed > claimed ? owed - claimed : 0n, loading: false, error: null });
    } catch {
      setData((d) => ({ ...d, loading: false, error: 'Network is unavailable' }));
    }
  }, [provider, masterAddress, demo]);

  useEffect(() => {
    if (phase !== 'ready') return;
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [phase, refresh]);

  // ---- auto-lock ----------------------------------------------------------
  const lock = useCallback(() => {
    if (provider instanceof BuiltinProvider) provider.lock();
    if (provider?.kind === 'builtin') {
      setProvider(null);
      setData(empty);
      setPhase('locked');
    }
  }, [provider]);

  useEffect(() => {
    if (phase !== 'ready' || provider?.kind !== 'builtin') return;
    const touch = () => (lastActive.current = Date.now());
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > AUTO_LOCK_MS) lock();
    }, 10_000);
    const vis = () => document.hidden && lock();
    document.addEventListener('visibilitychange', vis);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [phase, provider, lock]);

  // ---- actions ------------------------------------------------------------
  const openWith = async (words: string[]) => {
    const p = await BuiltinProvider.fromMnemonic(words);
    setProvider(p);
    setPhase('ready');
    lastActive.current = Date.now();
    return p;
  };

  const value: Ctx = {
    phase,
    provider,
    data,
    masterAddress,
    lockedAddress,
    refresh,
    newMnemonic: () => mnemonicNew(24),
    validateMnemonic: (w) => mnemonicValidate(w),
    async createWallet(words, passcode) {
      const p = await openWith(words);
      vaultStore.write(await encryptPhrase(words, passcode, p.address.toString({ bounceable: false })));
      attempts.reset();
      haptic.success();
    },
    async unlock(passcode) {
      const b = vaultStore.read();
      if (!b) return 'wrong';
      if (attempts.state().until > Date.now()) return 'throttled';
      const words = await decryptPhrase(b, passcode);
      if (!words) {
        attempts.fail();
        haptic.error();
        return 'wrong';
      }
      attempts.reset();
      await openWith(words);
      return 'ok';
    },
    lock,
    async revealPhrase(passcode) {
      const b = vaultStore.read();
      return b ? decryptPhrase(b, passcode) : null;
    },
    useExternal() {
      void tonConnect().openModal();
    },
    async signOut() {
      if (provider instanceof BuiltinProvider) provider.lock();
      if (provider instanceof TonConnectProvider) await provider.disconnect().catch(() => undefined);
      vaultStore.wipe();
      setProvider(null);
      setData(empty);
      setPhase('welcome');
    },
    setDemo(ph, p, d) {
      setDemoState(true);
      if (p) setProvider(p);
      if (d) setData(d);
      setPhase(ph);
    },
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
