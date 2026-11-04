import { Address } from '@ton/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Stats, StatsReply } from '../api/server';
import { cfg, endpoints } from '../config';
import { formatUnits } from '../lib/format';
import { useCountUp } from '../ui/useCountUp';
import { Beacon, Chain, ClaimTx, readBeacons, readChain, recentClaims, rootFromTuple, rootIsSigned, walletOnChain } from './data';

const D = 9;
const egg = (v: bigint | string, frac = 0) => formatUnits(BigInt(v), D, frac);
const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const short = (a: string) => {
  try {
    const f = Address.parseRaw(a).toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
    return `${f.slice(0, 4)}…${f.slice(-4)}`;
  } catch {
    return a.slice(0, 8);
  }
};
const KIND: Record<string, [string, string]> = {
  post: ['🥚', 'hatched a post'],
  inline: ['🐣', 'hatched a friend’s egg'],
  sender: ['📨', 'their egg was hatched'],
  ref: ['🤝', 'referral bonus'],
  legacy: ['🥚', 'early hatch'],
};

function Num({ value, label, sub, big }: { value: bigint; label: string; sub?: string; big?: boolean }) {
  const shown = useCountUp(value, 900);
  return (
    <div className={`num-card ${big ? 'big' : ''}`}>
      <div className="lbl">{label}</div>
      <div className="val">{formatUnits(shown, 0, 0)}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function Bars({ data, label }: { data: { d: number; v: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((x) => x.v));
  return (
    <div className="chart">
      <div className="lbl">{label}</div>
      <div className="bars">
        {data.map((x) => (
          <div key={x.d} className="bar" title={`${new Date(x.d * 1000).toLocaleDateString()}: ${x.v}`}>
            <i style={{ height: `${Math.max(3, (x.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Spark({ points, label }: { points: { t: number; v: number }[]; label: string }) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.t), ys = points.map((p) => p.v);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${((p.t - x0) / Math.max(1, x1 - x0)) * 300},${70 - ((p.v - y0) / Math.max(1, y1 - y0)) * 64}`).join(' ');
  return (
    <div className="chart">
      <div className="lbl">{label}</div>
      <svg viewBox="0 0 300 74" preserveAspectRatio="none" className="spark"><path d={path} /></svg>
    </div>
  );
}

type Check = { ok: boolean | null; text: string; how: string };

export function Explorer() {
  const inTelegram = api.available();
  const [live, setLive] = useState<StatsReply | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [claims, setClaims] = useState<ClaimTx[]>([]);
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState('');
  const daysAt = useRef(0);

  // live internal numbers (inside Telegram, straight from the bot) — every 3 s
  useEffect(() => {
    if (!inTelegram) return;
    let stop = false;
    const go = async () => {
      try {
        const want = Date.now() - daysAt.current > 60_000;
        const r = await api.stats(want);
        if (want) daysAt.current = Date.now();
        if (!stop) setLive((prev) => ({ ...r, days: r.days ?? prev?.days ?? null }));
      } catch {
        /* next round */
      }
    };
    void go();
    const t = setInterval(go, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [inTelegram]);

  // the chain (and the beacon) — everyone, every 8 s / 30 s
  useEffect(() => {
    let stop = false;
    const go = async () => {
      try {
        const [c, cl] = await Promise.all([readChain(), recentClaims()]);
        if (!stop) { setChain(c); setClaims(cl); setErr(''); }
      } catch {
        if (!stop) setErr('The blockchain API is busy — retrying');
      }
    };
    const gb = async () => { try { const b = await readBeacons(); if (!stop) setBeacons(b); } catch { /* next round */ } };
    void go(); void gb();
    const a = setInterval(go, 8000), b = setInterval(gb, 30_000), c = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { stop = true; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);
  void tick;

  const lastBeacon = beacons[beacons.length - 1];
  // internal numbers: live inside Telegram, otherwise the newest on-chain beacon
  const s: Partial<Stats> & { promised?: string } = live?.stats ?? (lastBeacon ? {
    users: lastBeacon.u, wallets: lastBeacon.w, promised: lastBeacon.p, events: lastBeacon.e, posts: lastBeacon.po, views: lastBeacon.vi, eggs: lastBeacon.eg, t: lastBeacon.t,
    root: lastBeacon.r ? { seq: lastBeacon.r[0], total: lastBeacon.r[1], treeRoot: lastBeacon.r[2], signature: lastBeacon.r[3], at: lastBeacon.t } : null,
  } : {});

  const checks: Check[] = useMemo(() => {
    const out: Check[] = [];
    const root = s.root ? rootFromTuple([s.root.seq, s.root.total, s.root.treeRoot, s.root.signature]) : null;
    out.push({ ok: chain && root ? rootIsSigned(root, chain.publisherKey) : null, text: `Newest root #${s.root?.seq ?? '—'} is signed by the key stored in the token contract`, how: 'ed25519 signature checked in your browser against get_publisher_key()' });
    out.push({ ok: chain ? chain.supply <= chain.maxTotal && chain.maxTotal <= chain.maxSupply : null, text: 'EGG in circulation ≤ the highest total ever promised ≤ the hard cap', how: 'total_supply, get_limits().maxTotal and get_max_supply() — enforced by the contract at every claim' });
    out.push({ ok: chain && s.promised && root ? BigInt(s.promised) >= BigInt(root.total) && BigInt(root.total) >= chain.supply : null, text: 'Ledger ≥ signed root ≥ what was claimed on-chain', how: 'the bot’s ledger total, the signed root’s total, and the contract’s supply' });
    out.push({ ok: chain ? !chain.frozen : null, text: 'The signing key was never caught cheating', how: 'anyone can submit two conflicting signed roots (ProveFraud); the contract would freeze the key' });
    out.push({ ok: lastBeacon ? true : null, text: `Stats beacon written by the bot’s own wallet${lastBeacon ? ` ${ago(lastBeacon.t)}` : ''}`, how: 'an on-chain comment only the bot’s key can send — the public numbers can not be edited afterwards' });
    return out;
  }, [chain, s.root, s.promised, lastBeacon]);

  const days = live?.days;
  return (
    <div className="ex">
      <header>
        <div className="brand"><span className="logo">🥚</span><div><b>Hatch Explorer</b><span>{cfg.network === 'testnet' ? 'testnet' : 'mainnet'} · EGG</span></div></div>
        <div className={`live ${inTelegram ? 'on' : ''}`}><i />{inTelegram ? 'Live' : lastBeacon ? `On-chain · ${ago(lastBeacon.t)}` : 'On-chain'}</div>
      </header>

      <section className="hero">
        <div className="lbl">EGG promised to players</div>
        <BigEgg value={BigInt(s.promised ?? '0')} />
        <div className="sub">
          {chain ? <>on-chain: <b>{egg(chain.supply)}</b> claimed · <b>{chain.holders}</b> holders</> : '…'}
        </div>
      </section>

      <section className="grid">
        <Num value={BigInt(s.users ?? 0)} label="Players" sub={live ? `+${live.stats.newUsersToday} today` : undefined} />
        <Num value={BigInt(s.wallets ?? 0)} label="Wallets linked" />
        <Num value={BigInt(s.events ?? 0)} label="Hatches & rewards" sub={live ? `${live.stats.hatchesLastHour} in the last hour` : undefined} />
        <Num value={BigInt(s.posts ?? 0)} label="Posts" sub={s.views !== undefined ? `${s.views} views` : undefined} />
        <Num value={BigInt(s.eggs ?? 0)} label="Eggs sent in chats" sub={live ? `${live.stats.eggHatches} hatched` : undefined} />
        <Num value={chain ? chain.supply / 10n ** 9n : 0n} label="EGG claimed on-chain" sub={chain ? `cap ${egg(chain.maxSupply)}` : undefined} />
      </section>

      {days ? (
        <section className="charts">
          <Bars label="EGG earned per day" data={days.egg.map((x) => ({ d: x.d, v: Number(BigInt(x.egg) / 10n ** 9n) }))} />
          <Bars label="New players per day" data={days.users.map((x) => ({ d: x.d, v: x.n }))} />
        </section>
      ) : beacons.length > 1 ? (
        <section className="charts">
          <Spark label="Players (beacons)" points={beacons.map((b) => ({ t: b.t, v: b.u }))} />
          <Spark label="EGG promised (beacons)" points={beacons.map((b) => ({ t: b.t, v: Number(BigInt(b.p) / 10n ** 9n) }))} />
        </section>
      ) : null}

      <section className="card">
        <h3>Check it yourself</h3>
        {checks.map((c) => (
          <div key={c.text} className="check">
            <span className={`dot ${c.ok === null ? 'wait' : c.ok ? 'ok' : 'bad'}`}>{c.ok === null ? '…' : c.ok ? '✓' : '✗'}</span>
            <div><b>{c.text}</b><span>{c.how}</span></div>
          </div>
        ))}
        {chain && (
          <div className="facts">
            <span>Growth limit: <b>{egg(chain.maxGrowth)}</b> EGG / {Math.round(chain.periodSeconds / 60)} min</span>
            <span>Per wallet: <b>{egg(chain.walletDaily)}</b> EGG / day</span>
            <span>Highest total promised: <b>{egg(chain.maxTotal)}</b></span>
            <a href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">Token contract ↗</a>
          </div>
        )}
      </section>

      <Lookup inTelegram={inTelegram} />

      <section className="cols">
        {live && (
          <div className="card">
            <h3>Live feed</h3>
            {live.recent.map((r, i) => (
              <div key={i} className="feed"><span className="ic">{KIND[r.kind]?.[0] ?? '•'}</span><div><b>+{egg(r.amount, 2)} EGG</b> <span>{r.who} {KIND[r.kind]?.[1] ?? r.kind}</span></div><time>{ago(r.t)}</time></div>
            ))}
          </div>
        )}
        <div className="card">
          <h3>Claims on-chain</h3>
          {claims.length === 0 && <div className="empty">No claims yet</div>}
          {claims.slice(0, 15).map((c) => (
            <a key={c.hash} className="feed" href={`${endpoints.explorer}/transaction/${c.hash}`} target="_blank" rel="noreferrer">
              <span className="ic">{c.ok ? '✅' : '⚠️'}</span><div><b>{short(c.wallet)}</b> <span>proved its share</span></div><time>{ago(c.t)}</time>
            </a>
          ))}
        </div>
      </section>

      {!inTelegram && (
        <a className="cta" href={`https://t.me/${cfg.bot}`}>Open in Telegram for the live view →</a>
      )}
      {err && <p className="err">{err}</p>}
      <footer>Numbers inside Telegram come from the bot every 3 s; everywhere else from on-chain beacons. Everything marked ✓ is checked in your browser against the token contract.</footer>
    </div>
  );
}

function BigEgg({ value }: { value: bigint }) {
  const shown = useCountUp(value, 900);
  return <div className="big">{egg(shown, 0)}<span> EGG</span></div>;
}

function Lookup({ inTelegram }: { inTelegram: boolean }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<null | { chain?: { balance: bigint; claimed: bigint }; ledger?: string; root?: string; note?: string }>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    setRes(null);
    try {
      const out: { chain?: { balance: bigint; claimed: bigint }; ledger?: string; root?: string; note?: string } = {};
      let addr: Address | null = null;
      try { addr = Address.parse(q.trim()); } catch { /* maybe a username */ }
      if (inTelegram) {
        const r = await api.lookup(addr ? addr.toRawString() : q.trim());
        if (r.found) {
          out.ledger = r.ledger;
          out.root = r.entitlement ? `${egg(r.entitlement.cumulative, 2)} EGG in signed root #${r.entitlement.root.seq}` : 'not in a signed root yet';
          if (!addr && r.address) addr = Address.parseRaw(r.address);
        } else out.note = 'Not found in the ledger';
      } else if (!addr) out.note = 'Enter a wallet address (usernames can be looked up inside Telegram)';
      if (addr) out.chain = await walletOnChain(addr);
      setRes(out);
    } catch {
      setRes({ note: 'Could not look that up' });
    } finally {
      setBusy(false);
    }
  }, [q, inTelegram]);
  return (
    <section className="card">
      <h3>Look up a wallet {inTelegram ? 'or @username' : ''}</h3>
      <form className="lookup" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={inTelegram ? 'UQ… or @username' : 'UQ… wallet address'} autoCapitalize="none" spellCheck={false} />
        <button disabled={!q.trim() || busy}>{busy ? '…' : 'Check'}</button>
      </form>
      {res && (
        <div className="facts">
          {res.ledger !== undefined && <span>Ledger (bot): <b>{egg(res.ledger, 2)} EGG</b></span>}
          {res.root && <span>Proof: <b>{res.root}</b></span>}
          {res.chain && <span>On-chain: <b>{egg(res.chain.balance, 2)} EGG</b> in the wallet, <b>{egg(res.chain.claimed, 2)}</b> claimed in total</span>}
          {res.note && <span>{res.note}</span>}
        </div>
      )}
    </section>
  );
}
