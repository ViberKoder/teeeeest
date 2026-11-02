import { Address } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';
import { rotationSignature } from '@egg/sdk';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, Me } from '../api/server';
import { Activity, loadActivity } from '../chain/history';
import { EggState, readEgg } from '../chain/egg';
import { ton } from '../chain/client';
import { loadSnap, saveSnap } from './snapshot';
import { cfg } from '../config';
import { keyStore, Marker, pendingKey } from '../keys/store';
import { haptic } from '../lib/tg';
import { TgWalletProvider } from '../provider/tg';
import type { WalletProvider } from '../provider/types';

export type Phase = 'boot' | 'needs-phrase' | 'offline' | 'adopting' | 'ready';

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
  /** this Telegram account already has a wallet that this device does not hold (only its phrase can open it) */
  conflict: { locked: boolean } | null;
  /** start over with the wallet of this device — allowed only while the account's wallet never entered a published root */
  useNewWallet: () => Promise<void>;
  retryBoot: () => void;
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
  const dataRef = useRef(data);
  dataRef.current = data;
  const [demo, setDemoState] = useState(false);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [backupOn, setBackupOn] = useState(true);
  const [firstRun, setFirstRun] = useState(false);
  const [localAct, setLocalAct] = useState<Activity[]>(() => readLocalActivity());
  const words = useRef<string[] | null>(null);
  const [conflict, setConflict] = useState<{ locked: boolean } | null>(null);
  const [bootTry, setBootTry] = useState(0);

  const masterAddress = useMemo(() => {
    try {
      return cfg.master ? Address.parse(cfg.master) : null;
    } catch {
      return null;
    }
  }, []);

  const open = useCallback(async (w: string[], created: boolean, address?: string) => {
    words.current = w;
    // After a key change the wallet keeps its address, which the phrase alone no longer reveals: use the one saved with the key.
    const saved = keyStore.localMarker();
    const derived = await TgWalletProvider.addressOf(w);
    const at = address ?? (saved && saved.address !== derived ? saved.address : undefined);
    const p = await TgWalletProvider.fromWords(w, at ? Address.parseRaw(at) : undefined);
    const snap = loadSnap(p.address.toRawString()); // the last known numbers: the wallet opens with something real on screen
    if (snap) setData((d) => ({ ...d, ton: snap.ton, egg: snap.egg, me: snap.me }));
    setProvider(p);
    setFirstRun(created);
    setPhase('ready');
    // the marker only matters for settings: do not make the first screen wait for Telegram's storage
    void keyStore.marker().then((m) => { setMarker(m); setBackupOn(m ? m.backup : true); });
  }, []);

  /** Moves a wallet that was prepared for this @username to the key `w` made on this device, then opens it. */
  const adopt = useCallback(async (w: string[], address: string) => {
    setPhase('adopting');
    const keys = await mnemonicToPrivateKey(w);
    const signature = rotationSignature(Address.parseRaw(address), keys.secretKey).toString('hex');
    for (let i = 0; i < 80; i++) {
      const r = await api.adopt(keys.publicKey.toString('hex'), signature).catch(() => null);
      if (r?.status === 'done') return void (await open(w, true, address));
      if (r && (r.status === 'taken' || r.status === 'none' || r.status === 'bad-proof')) break;
      await new Promise((res) => setTimeout(res, 3000));
    }
    // could not take it over (or it is not ours): never leave the user without a wallet
    keyStore.forgetDevice();
    setPhase('offline');
  }, [open]);

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
      if (loaded.kind === 'ready') {
        // Interrupted hand-over of a prepared wallet: the key is here, the wallet may not answer to it yet. Finish it.
        const saved = keyStore.localMarker();
        if (saved && api.available() && saved.address !== (await TgWalletProvider.addressOf(loaded.words))) {
          const m = await api.me().catch(() => null);
          if (m && !m.address) return void (await adopt(loaded.words, saved.address));
        }
        return void (await open(loaded.words, false));
      }
      if (loaded.kind === 'needs-phrase') {
        setMarker(loaded.marker);
        return setPhase('needs-phrase');
      }
      // No key here. Before creating a wallet, ask the account itself: if it already has one (another device made it),
      // a second wallet would split the account's EGG across two wallets, so only the first one's phrase may be used.
      let me: Awaited<ReturnType<typeof api.me>> | null = null;
      if (api.available()) {
        for (let i = 0; i < 2 && !me; i++) {
          me = await api.me().catch(() => null);
          if (!me) await new Promise((r) => setTimeout(r, 1500));
        }
        if (!me) return setPhase('offline');
      }
      if (me?.address) {
        setMarker({ address: me.address, backup: false });
        setConflict({ locked: me.address_locked });
        return setPhase('needs-phrase');
      }
      // Did someone send money to this @username before the first visit? Then a wallet is already waiting: take it over.
      if (api.available()) {
        const prep = await api.prepared().catch(() => ({ address: null as string | null }));
        if (prep.address) {
          const w = await mnemonicNew(24);
          await keyStore.save(w, prep.address, true); // the key is stored BEFORE the hand-over starts: a crash cannot lose it
          return void (await adopt(w, prep.address));
        }
      }
      // (storage that does not answer + an account the server knows has no wallet = safe to create one; the server is the authority)
      const w = await keyStore.create(TgWalletProvider.addressOf);
      await open(w, true);
    })();
  }, [open, adopt, bootTry]);

  // ---- data ---------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (demo || !provider) return;
    const raw = provider.address.toRawString();
    setData((d) => ({ ...d, loading: true }));

    // Everything runs at once and shows up as it arrives: the numbers of the last visit first, then each source as soon as it answers.
    const acc: { ton: bigint; egg: EggState | null; me: Me | null; activity: Activity[] } = {
      ton: dataRef.current.ton, egg: dataRef.current.egg, me: dataRef.current.me, activity: dataRef.current.activity,
    };
    const derive = () => {
      const mine = acc.me ? (acc.me.address ? acc.me.address === raw : true) : false;
      const claimed = acc.egg?.claimed ?? 0n;
      const committed = acc.me && mine && acc.me.entitlement ? BigInt(acc.me.entitlement.cumulative) : 0n;
      const ready = committed > claimed ? committed - claimed : 0n;
      const owed = acc.me && mine ? BigInt(acc.me.ledger) : 0n;
      const known = claimed > committed ? claimed : committed;
      return { ton: acc.ton, egg: acc.egg, me: acc.me, activity: acc.activity, ready, accruing: owed > known ? owed - known : 0n };
    };
    const push = () => setData((d) => ({ ...d, ...derive() }));
    push(); // numbers of the last visit first
    let chainDown = false;

    const tasks: Promise<unknown>[] = [
      ton().getBalance(provider.address).then((v) => { acc.ton = v; push(); }).catch(() => { chainDown = true; }),
      masterAddress
        ? readEgg(masterAddress, provider.address).then((v) => { acc.egg = v; push(); }).catch(() => { chainDown = true; })
        : Promise.resolve(),
      loadActivity(provider.address, masterAddress).then((v) => { acc.activity = v; push(); }).catch(() => undefined),
      (async () => {
        let me = api.available() ? await api.me().catch(() => null) : null;
        // The account has ONE wallet. If it has none yet, this one becomes it; if it has another, never replace it silently.
        if (me && !me.address) {
          await provider.linkToAccount().catch(() => undefined);
          me = await api.me().catch(() => me);
        } else if (me?.address && me.address !== raw) {
          setMarker({ address: me.address, backup: false });
          setConflict({ locked: me.address_locked });
          setPhase('needs-phrase');
          return;
        }
        acc.me = me;
        push();
        if (api.available()) void api.kick();
      })().catch(() => undefined),
    ];
    await Promise.all(tasks);
    saveSnap(raw, { ton: acc.ton, egg: acc.egg, me: acc.me });
    setData((d) => ({ ...d, ...derive(), loading: false, error: chainDown ? 'Network is busy — retrying' : null }));
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
    conflict,
    retryBoot: () => { setPhase('boot'); setBootTry((n) => n + 1); },
    async useNewWallet() {
      let p = provider;
      if (!p) {
        const w = await keyStore.create(TgWalletProvider.addressOf);
        words.current = w;
        p = await TgWalletProvider.fromWords(w);
      }
      await p.linkToAccount(true);
      setConflict(null);
      await open(words.current ?? [], false);
    },
    async restore(w) {
      if (!marker) return false;
      let ok = await keyStore.validate(w, marker.address, TgWalletProvider.addressOf);
      if (!ok && w.length === 24 && (await mnemonicValidate(w))) {
        // a wallet whose key was changed (self-custody / handed over) does not derive its address from the phrase: ask the chain
        try {
          const p = await TgWalletProvider.fromWords(w, Address.parseRaw(marker.address));
          ok = (await p.onchainPublicKey()) === p.publicKeyHex;
        } catch {
          ok = false;
        }
      }
      if (!ok) {
        haptic.error();
        return false;
      }
      await keyStore.save(w, marker.address, marker.backup);
      setConflict(null);
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
