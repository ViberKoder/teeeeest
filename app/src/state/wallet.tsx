import { Address } from '@ton/core';
import { mnemonicNew, mnemonicValidate } from '@ton/crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, Me } from '../api/server';
import { Activity, loadActivity } from '../chain/history';
import { EggState, readEgg } from '../chain/egg';
import { ton } from '../chain/client';
import { cfg } from '../config';
import { keyStore, Marker, pendingKey } from '../keys/store';
import { haptic } from '../lib/tg';
import { TgWalletProvider } from '../provider/tg';
import type { WalletProvider } from '../provider/types';

export type Phase = 'boot' | 'needs-phrase' | 'ready';

export interface Data {
  ton: bigint;
  egg: EggState | null;
  me: Me | null;
  activity: Activity[];
  /** committed on-chain and provable: claimable right now */
  ready: bigint;
  /** earned, but not in a published root yet: it joins the next one */
  accruing: bigint;
  loading: boolean;
  error: string | null;
}

const empty: Data = { ton: 0n, egg: null, me: null, activity: [], ready: 0n, accruing: 0n, loading: true, error: null };

interface Ctx {
  phase: Phase;
  provider: WalletProvider | null;
  data: Data;
  masterAddress: Address | null;
  marker: Marker | null;
  /** the wallet was created in this session: show the short "how it works" once */
  firstRun: boolean;
  backupOn: boolean;
  refresh: () => Promise<void>;
  /** enter the secret phrase of a wallet that exists for this account but has no cloud backup */
  restore: (words: string[]) => Promise<boolean>;
  setBackup: (on: boolean) => Promise<void>;
  /** the current secret phrase — only handed out when the user asked to see it */
  secretPhrase: () => string[] | null;
  newPhrase: () => Promise<string[]>;
  /** give the wallet a new key whose phrase only the user knows; Telegram's backup is erased */
  selfCustody: (words: string[]) => Promise<void>;
  dismissIntro: () => void;
  addLocalActivity: (a: Activity) => void;
  /** demo fixtures only: jump straight to a screen */
  setDemo: (phase: Phase, p?: WalletProvider, d?: Data, marker?: Marker | null) => void;
}

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error('WalletProvider missing');
  return c;
};

const LOCAL_ACT = 'egg.activity.v1';
const readLocalActivity = (): Activity[] => {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_ACT) ?? '[]') as (Omit<Activity, 'amount'> & { amount: string })[]).map((a) => ({ ...a, amount: BigInt(a.amount) }));
  } catch {
    return [];
  }
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [demo, setDemoState] = useState(false);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [backupOn, setBackupOn] = useState(true);
  const [firstRun, setFirstRun] = useState(false);
  const [localAct, setLocalAct] = useState<Activity[]>(() => readLocalActivity());
  const words = useRef<string[] | null>(null);

  const masterAddress = useMemo(() => {
    try {
      return cfg.master ? Address.parse(cfg.master) : null;
    } catch {
      return null;
    }
  }, []);

  const open = useCallback(async (w: string[], created: boolean) => {
    words.current = w;
    const p = await TgWalletProvider.fromWords(w);
    setProvider(p);
    setFirstRun(created);
    const m = await keyStore.marker();
    setMarker(m);
    setBackupOn(m ? m.backup : true);
    setPhase('ready');
  }, []);

  // ---- boot: adopt a staged rotation, find the wallet of this account, or create it -----------------
  useEffect(() => {
    if (cfg.demo) return;
    void (async () => {
      const staged = pendingKey.read();
      const loaded = await keyStore.load();
      if (staged && loaded.kind === 'ready') {
        // a rotation was interrupted: if the chain already shows the staged key, finish it; otherwise drop it
        try {
          const cur = await TgWalletProvider.fromWords(loaded.words);
          const next = await TgWalletProvider.fromWords(staged);
          if ((await cur.onchainPublicKey()) === next.publicKeyHex) {
            await keyStore.save(staged, next.address.toRawString(), false);
            pendingKey.clear();
            return void (await open(staged, false));
          }
        } catch {
          /* offline: keep both, retry next time */
        }
      }
      if (loaded.kind === 'ready') return void (await open(loaded.words, false));
      if (loaded.kind === 'needs-phrase') {
        setMarker(loaded.marker);
        return setPhase('needs-phrase');
      }
      const w = await keyStore.create(TgWalletProvider.addressOf);
      await open(w, true);
    })();
  }, [open]);

  // ---- data ---------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (demo || !provider) return;
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const raw = provider.address.toRawString();
      let me = api.available() ? await api.me().catch(() => null) : null;
      // the wallet belongs to the Telegram account: tell the server which address that is (once, quietly)
      if (me && me.address !== raw && !me.address_locked) {
        await api.link(raw).catch(() => undefined);
        me = await api.me().catch(() => me);
      }
      const [balance, egg, activity] = await Promise.all([
        ton().getBalance(provider.address),
        masterAddress ? readEgg(masterAddress, provider.address) : Promise.resolve(null),
        loadActivity(provider.address, masterAddress).catch(() => [] as Activity[]),
      ]);
      const mine = me ? (me.address ? me.address === raw : true) : false;
      const claimed = egg?.claimed ?? 0n;
      const committed = me && mine && me.entitlement ? BigInt(me.entitlement.cumulative) : 0n;
      const ready = committed > claimed ? committed - claimed : 0n;
      const owed = me && mine ? BigInt(me.ledger) : 0n;
      const known = claimed > committed ? claimed : committed;
      const accruing = owed > known ? owed - known : 0n;
      setData({ ton: balance, egg, me, activity, ready, accruing, loading: false, error: null });
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

  const value: Ctx = {
    phase,
    provider,
    data: { ...data, activity: [...localAct, ...data.activity].sort((a, b) => b.time - a.time) },
    masterAddress,
    marker,
    firstRun,
    backupOn,
    refresh,
    async restore(w) {
      if (!marker) return false;
      const ok = await keyStore.validate(w, marker.address, TgWalletProvider.addressOf);
      if (!ok) {
        haptic.error();
        return false;
      }
      await keyStore.save(w, marker.address, marker.backup);
      await open(w, false);
      haptic.success();
      return true;
    },
    async setBackup(on) {
      if (!provider || !words.current) return;
      await keyStore.setBackup(words.current, provider.address.toRawString(), on);
      setBackupOn(on);
      setMarker({ address: provider.address.toRawString(), backup: on });
    },
    secretPhrase: () => words.current,
    newPhrase: () => mnemonicNew(24),
    async selfCustody(newWords) {
      if (!(provider instanceof TgWalletProvider) || !words.current) throw new Error('wallet not ready');
      pendingKey.stage(newWords); // stage BEFORE sending: a crash can not lose the new key
      const next = await provider.rotateKey(newWords);
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if ((await next.onchainPublicKey().catch(() => '')) === next.publicKeyHex) {
          await keyStore.save(newWords, next.address.toRawString(), false);
          pendingKey.clear();
          words.current = newWords;
          setProvider(next);
          setBackupOn(false);
          setMarker({ address: next.address.toRawString(), backup: false });
          haptic.success();
          return;
        }
      }
      throw new Error('rotation-pending');
    },
    dismissIntro: () => {
      setFirstRun(false);
    },
    addLocalActivity(a) {
      const next = [a, ...localAct].slice(0, 30);
      setLocalAct(next);
      try {
        localStorage.setItem(LOCAL_ACT, JSON.stringify(next.map((x) => ({ ...x, amount: x.amount.toString() }))));
      } catch {
        /* private mode */
      }
    },
    setDemo(ph, p, d, m) {
      setDemoState(true);
      if (p) setProvider(p);
      if (d) setData(d);
      if (m !== undefined) setMarker(m);
      setPhase(ph);
    },
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export { mnemonicValidate };
