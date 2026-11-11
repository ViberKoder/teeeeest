import { useEffect, useRef, useState } from 'react';
import { api, StatsReply } from '../api/server';
import { cfg } from '../config';
import { Beacon, Chain, ClaimTx, readBeacons, readChain, readMeta, recentClaims } from './data';

export interface Meta { name: string; symbol: string; decimals: number; admin: string | null }

/** Everything the explorer shows, loaded once and shared by every page: the bot (inside Telegram), the chain and the on-chain beacons. */
export function useExplorerData() {
  const inTelegram = api.available();
  const [live, setLive] = useState<StatsReply | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [claims, setClaims] = useState<ClaimTx[]>([]);
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState('');
  const [, setTick] = useState(0);
  const daysAt = useRef(0);

  useEffect(() => {
    if (!inTelegram) return;
    let stop = false;
    const go = async () => {
      if (document.hidden) return;
      try {
        const want = Date.now() - daysAt.current > 60_000;
        const r = await api.stats(want);
        if (want) daysAt.current = Date.now();
        if (!stop) setLive((prev) => ({ ...r, days: r.days ?? prev?.days ?? null }));
      } catch { /* next round */ }
    };
    void go();
    const t = setInterval(go, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [inTelegram]);

  useEffect(() => {
    let stop = false;
    const go = async () => {
      if (document.hidden) return;
      try {
        const [c, cl] = await Promise.all([readChain(), recentClaims()]);
        if (!stop) { setChain(c); setClaims(cl); setErr(''); }
      } catch {
        if (!stop) setErr('The blockchain API is busy, retrying');
      }
    };
    const gb = async () => {
      if (document.hidden) return;
      try {
        const b = await readBeacons();
        const mn = b[b.length - 1]?.mn; // the active token is whatever the newest beacon says
        if (mn && !api.available()) (cfg as { master: string }).master = mn;
        if (!stop) setBeacons(b);
      } catch { /* next round */ }
    };
    void go(); void gb();
    void readMeta().then((m) => { if (!stop) setMeta(m); }).catch(() => undefined);
    const a = setInterval(go, 8000), b = setInterval(gb, 20_000), c = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { stop = true; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);

  return { inTelegram, live, chain, claims, beacons, meta, err };
}
export type ExplorerData = ReturnType<typeof useExplorerData>;

/** Hash routing: #/, #/holders, #/address/<addr> … */
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(read);
  useEffect(() => {
    const f = () => { setR(read()); document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
