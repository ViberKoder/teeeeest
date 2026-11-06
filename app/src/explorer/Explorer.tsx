import { Address } from '@ton/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, StatsReply } from '../api/server';
import { cfg, endpoints } from '../config';
import { formatUnits } from '../lib/format';
import { Egg3D } from '../ui/Egg3D';
import { useCountUp } from '../ui/useCountUp';
import { Beacon, Chain, ClaimTx, DEFAULT_CAPTION, PostView, postFromBeacon, readBeacons, readChain, recentClaims, rootFromTuple, rootIsSigned, walletOnChain } from './data';
import { parseQuery } from './search';

const D = 9;
const egg = (v: bigint | string, frac = 0) => formatUnits(BigInt(v), D, frac);
const nowS = () => Math.floor(Date.now() / 1000);
const ago = (t: number) => {
  const s = Math.max(0, nowS() - t);
  return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString('en'));
const short = (a: string) => {
  try {
    const f = Address.parseRaw(a).toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
    return `${f.slice(0, 5)}…${f.slice(-4)}`;
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

/** A number that counts up to its new value (the page grows in front of you). */
function Count({ value, frac = 0 }: { value: bigint; frac?: number }) {
  const v = useCountUp(value, 900);
  return <>{frac ? formatUnits(v, D, frac) : v.toLocaleString('en')}</>;
}

function Kpi({ label, value, sub, flash }: { label: string; value: number | bigint; sub?: string; flash?: boolean }) {
  return (
    <div className={`kpi ${flash ? 'flash' : ''}`}>
      <div className="k">{label}</div>
      <div className="v"><Count value={BigInt(value)} /></div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- the Telegram-post card
function PostCard({ post, live }: { post: PostView | null; live: boolean }) {
  const p: PostView = post ?? { title: 'Egg', username: '', messageId: null, hatches: 0, views: 0, reactions: 0, at: nowS(), caption: DEFAULT_CAPTION };
  const link = p.username ? `https://t.me/${p.username}${p.messageId ? `/${p.messageId}` : ''}` : `https://t.me/${cfg.bot}`;
  const time = new Date(p.at * 1000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  const lines = (p.caption ?? '').split('\n').filter(Boolean);
  return (
    <div className="chat">
      <div className="bubble">
        <div className="bh">
          <span className="av">🥚</span>
          <div><b>{p.title}</b><span>channel{p.username ? ` · @${p.username}` : ''}</span></div>
          {live && <em className="rec"><i />live</em>}
        </div>
        <a className="photo" href={link} target="_blank" rel="noreferrer">
          <img src="/post-egg.jpg" alt="Egg post" loading="lazy" />
        </a>
        {lines.length > 0 && <p className="cap">{lines.map((l, i) => <span key={i}>{l}<br /></span>)}</p>}
        <a className="kbtn" href={link} target="_blank" rel="noreferrer">🥚 Hatch · <Count value={BigInt(p.hatches)} /></a>
        <div className="bf">
          <div className="reacts">
            <span title="Hatches (taps on the button)">🥚 <Count value={BigInt(p.hatches)} /></span>
            <span title="Reactions in Telegram">❤️ <Count value={BigInt(p.reactions)} /></span>
          </div>
          <div className="meta"><span title="Views in Telegram">👁 {p.views ? compact(p.views) : '—'}</span><span>{time}</span></div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- small charts
function Bars({ data, label, unit }: { data: { d: number; v: number }[]; label: string; unit: string }) {
  const max = Math.max(1, ...data.map((x) => x.v));
  return (
    <div className="chart">
      <div className="ch"><b>{label}</b><span>last {data.length} days</span></div>
      <div className="bars">
        {data.map((x) => (
          <div key={x.d} className="bar" data-tip={`${new Date(x.d * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' })}: ${x.v.toLocaleString('en')} ${unit}`}>
            <i style={{ height: `${Math.max(4, (x.v / max) * 100)}%` }} />
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
  const pts = points.map((p) => `${(((p.t - x0) / Math.max(1, x1 - x0)) * 300).toFixed(1)},${(70 - ((p.v - y0) / Math.max(1, y1 - y0)) * 62).toFixed(1)}`);
  return (
    <div className="chart">
      <div className="ch"><b>{label}</b><span>on-chain beacons</span></div>
      <svg viewBox="0 0 300 76" preserveAspectRatio="none" className="spark">
        <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--b3)" stopOpacity=".35" /><stop offset="1" stopColor="var(--b3)" stopOpacity="0" /></linearGradient></defs>
        <path d={`M${pts.join(' L')} L300,76 L0,76 Z`} fill="url(#sg)" />
        <path d={`M${pts.join(' L')}`} className="line" />
      </svg>
    </div>
  );
}

type Check = { ok: boolean | null; title: string; how: string };

export function Explorer() {
  const inTelegram = api.available();
  const [live, setLive] = useState<StatsReply | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [claims, setClaims] = useState<ClaimTx[]>([]);
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [, setTick] = useState(0);
  const [err, setErr] = useState('');
  const [burst, setBurst] = useState(0);
  const [pops, setPops] = useState<{ id: number; text: string; x: number }[]>([]);
  const daysAt = useRef(0);
  const seen = useRef<{ events: number; users: number } | null>(null);

  // inside Telegram: straight from the bot, every 3 s
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

  // everywhere: the chain every 8 s, the beacons every 20 s
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
    const a = setInterval(go, 8000), b = setInterval(gb, 20_000), c = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { stop = true; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);

  const lastBeacon = beacons[beacons.length - 1];
  const s = live?.stats ?? (lastBeacon ? {
    users: lastBeacon.u, wallets: lastBeacon.w, promised: lastBeacon.p, events: lastBeacon.e, posts: lastBeacon.po, views: lastBeacon.vi, eggs: lastBeacon.eg,
    reactions: lastBeacon.re ?? 0, t: lastBeacon.t, newUsersToday: 0, hatchesLastHour: 0, eggHatches: 0, postHatches: 0,
    root: lastBeacon.r ? { seq: lastBeacon.r[0], total: lastBeacon.r[1], treeRoot: lastBeacon.r[2], signature: lastBeacon.r[3], at: lastBeacon.t } : null,
  } : null);
  const post: PostView | null = live?.stats.latestPost
    ? { ...live.stats.latestPost, title: live.stats.latestPost.title, username: live.stats.latestPost.username ?? '', caption: live.stats.latestPost.caption ?? '', at: live.stats.latestPost.at, messageId: live.stats.latestPost.messageId }
    : postFromBeacon(lastBeacon);

  // every new event makes the egg burst and a "+1 EGG" float up
  useEffect(() => {
    if (!s) return;
    const cur = { events: s.events ?? 0, users: s.users ?? 0 };
    const prev = seen.current;
    seen.current = cur;
    if (!prev || (cur.events <= prev.events && cur.users <= prev.users)) return;
    setBurst((b) => b + 1);
    const id = Date.now();
    const text = cur.users > prev.users ? `+${cur.users - prev.users} player` : `+${cur.events - prev.events} hatch${cur.events - prev.events > 1 ? 'es' : ''}`;
    setPops((p) => [...p.slice(-3), { id, text, x: 20 + Math.random() * 60 }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 2600);
  }, [s?.events, s?.users]);

  const checks: Check[] = useMemo(() => {
    const out: Check[] = [];
    const root = s?.root ? rootFromTuple([s.root.seq, s.root.total, s.root.treeRoot, s.root.signature]) : null;
    out.push({ ok: chain && root ? rootIsSigned(root, chain.publisherKey) : null, title: `Root #${s?.root?.seq ?? '—'} is signed by the key in the token contract`, how: 'ed25519, verified in your browser against get_publisher_key()' });
    out.push({ ok: chain ? chain.supply <= chain.maxTotal && chain.maxTotal <= chain.maxSupply : null, title: 'Claimed ≤ promised ≤ hard cap', how: 'total_supply · get_limits().maxTotal · get_max_supply()' });
    out.push({ ok: chain && s && root ? BigInt(s.promised) >= BigInt(root.total) && BigInt(root.total) >= chain.supply : null, title: 'Ledger ≥ signed root ≥ claimed on-chain', how: 'the bot’s ledger, the signed root, and the contract’s supply' });
    out.push({ ok: chain ? !chain.frozen : null, title: 'The signing key was never caught cheating', how: 'ProveFraud would freeze it on-chain' });
    out.push({ ok: lastBeacon ? true : null, title: `Stats come from an on-chain beacon${lastBeacon ? ` (${ago(lastBeacon.t)})` : ''}`, how: 'a comment only the bot’s own wallet can write' });
    return out;
  }, [chain, s?.root, s?.promised, lastBeacon]);

  const days = live?.days;
  const promised = BigInt(s?.promised ?? '0');
  const claimed = chain?.supply ?? 0n;
  const budgetUsed = chain && chain.maxGrowth > 0n ? Number((chain.windowGrowth * 1000n) / chain.maxGrowth) / 10 : 0;
  const claimedPct = promised > 0n ? Number((claimed * 1000n) / promised) / 10 : 0;

  return (
    <div className="ex">
      <Nav inTelegram={inTelegram} lastAt={live ? nowS() : lastBeacon?.t} />

      <section className="hero" id="top">
        <div className="copy">
          <span className="pill"><i /> {cfg.network === 'testnet' ? 'TON testnet' : 'TON mainnet'} · public ledger</span>
          <h1>Every egg,<br /><em>checkable.</em></h1>
          <p>EGG is hatched in Telegram and owned on TON. Every number here is either read from the token contract or checked against it, right in your browser.</p>
          <div className="big">
            <div className="lbl">EGG promised to players</div>
            <div className="num"><Count value={promised / 10n ** 9n} /><span> EGG</span></div>
            <div className="bar2"><i style={{ width: `${Math.min(100, claimedPct)}%` }} /></div>
            <div className="lbl2"><b>{egg(claimed)}</b> already on-chain ({claimedPct.toFixed(claimedPct < 10 ? 1 : 0)}%) · <b>{chain?.holders ?? 0}</b> holders</div>
          </div>
          <div className="cta">
            <a className="btn" href={`https://t.me/${cfg.bot}`}>Open the wallet</a>
            <a className="btn ghost" href="#verify">How to verify</a>
          </div>
        </div>
        <div className="stage">
          <div className="halo" />
          <div className="egg3d"><Egg3D energy={0.6} burst={burst} /></div>
          {pops.map((p) => <span key={p.id} className="pop" style={{ left: `${p.x}%` }}>{p.text}</span>)}
          <div className="hint">drag · zoom · tap</div>
        </div>
      </section>

      <section className="kpis">
        <Kpi label="Players" value={s?.users ?? 0} sub={live ? `+${live.stats.newUsersToday} today` : undefined} />
        <Kpi label="Wallets" value={s?.wallets ?? 0} sub="linked with a signature" />
        <Kpi label="Hatches & rewards" value={s?.events ?? 0} sub={live ? `${live.stats.hatchesLastHour} in the last hour` : undefined} />
        <Kpi label="Posts" value={s?.posts ?? 0} sub={s?.views ? `${compact(s.views)} views` : undefined} />
        <Kpi label="Eggs sent in chats" value={s?.eggs ?? 0} sub={live ? `${live.stats.eggHatches} hatched` : undefined} />
        <Kpi label="Claims on-chain" value={claims.filter((c) => c.ok).length} sub="players proved their share" />
      </section>

      <section className="two" id="post">
        <div>
          <h2>The post</h2>
          <p className="lead">This is what players see in the channel: tap <b>Hatch</b>, get +1 EGG. The numbers below the picture are live.</p>
          <div className="tiles">
            <div><b><Count value={BigInt(post?.hatches ?? 0)} /></b><span>hatches</span></div>
            <div><b>{post?.views ? compact(post.views) : '—'}</b><span>views</span></div>
            <div><b><Count value={BigInt(post?.reactions ?? 0)} /></b><span>reactions</span></div>
          </div>
          {!(live && live.top.length > 1) && (
            <ol className="steps">
              <li><b>Tap Hatch</b><span>+1 EGG goes to your ledger the moment you tap, once per post.</span></li>
              <li><b>A signed root</b><span>The bot signs one Merkle root for everybody. Nothing is published on-chain per update.</span></li>
              <li><b>Claim on-chain</b><span>Your wallet proves its share; the token contract checks the signature and the proof itself.</span></li>
            </ol>
          )}
          {live && live.top.length > 1 && (
            <div className="list">
              <div className="lh">Most hatched posts</div>
              {live.top.map((t, i) => (
                <a key={i} className="li" href={t.username ? `https://t.me/${t.username}/${t.messageId}` : undefined} target="_blank" rel="noreferrer">
                  <span className="rk">{i + 1}</span><div><b>@{t.username ?? 'channel'} #{t.messageId}</b><span>{ago(t.at)}</span></div><em>🥚 {t.hatches}</em>
                </a>
              ))}
            </div>
          )}
        </div>
        <PostCard post={post} live={inTelegram} />
      </section>

      <section id="verify">
        <h2>Check it yourself</h2>
        <div className="verify">
          <div className="checks">
            {checks.map((c) => (
              <div key={c.title} className="check">
                <span className={`dot ${c.ok === null ? 'wait' : c.ok ? 'ok' : 'bad'}`}>{c.ok === null ? '…' : c.ok ? '✓' : '✗'}</span>
                <div><b>{c.title}</b><span>{c.how}</span></div>
              </div>
            ))}
          </div>
          <div className="limits">
            <div className="lh">Token contract</div>
            {cfg.master && <a className="addr" href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">{cfg.master.slice(0, 10)}…{cfg.master.slice(-8)} ↗</a>}
            <div className="row"><span>Hard cap</span><b>{chain ? egg(chain.maxSupply) : '—'}</b></div>
            <div className="row"><span>Highest total promised</span><b>{chain ? egg(chain.maxTotal) : '—'}</b></div>
            <div className="row"><span>Per wallet</span><b>{chain ? `${egg(chain.walletDaily)} / day` : '—'}</b></div>
            <div className="row"><span>Growth limit</span><b>{chain ? `${egg(chain.maxGrowth)} / ${Math.round(chain.periodSeconds / 60)} min` : '—'}</b></div>
            <div className="meter"><i style={{ width: `${Math.min(100, budgetUsed)}%` }} /></div>
            <div className="mlabel">{budgetUsed.toFixed(budgetUsed < 10 ? 1 : 0)}% of this period’s growth budget used</div>
          </div>
        </div>
      </section>

      <section id="activity">
        <h2>Activity</h2>
        {days ? (
          <div className="charts">
            <Bars label="EGG earned per day" unit="EGG" data={days.egg.map((x) => ({ d: x.d, v: Number(BigInt(x.egg) / 10n ** 9n) }))} />
            <Bars label="New players per day" unit="players" data={days.users.map((x) => ({ d: x.d, v: x.n }))} />
          </div>
        ) : beacons.length > 1 ? (
          <div className="charts">
            <Spark label="Players" points={beacons.map((b) => ({ t: b.t, v: b.u }))} />
            <Spark label="EGG promised" points={beacons.map((b) => ({ t: b.t, v: Number(BigInt(b.p) / 10n ** 9n) }))} />
          </div>
        ) : null}
        <div className="two feeds">
          {live ? (
            <div className="panel">
              <div className="lh">Live feed <em className="rec"><i />live</em></div>
              {live.recent.slice(0, 12).map((r, i) => (
                <div key={`${r.t}-${i}`} className="feed"><span className="ic">{KIND[r.kind]?.[0] ?? '•'}</span><div><b>+{egg(r.amount, 2)} EGG</b> <span>…{r.who.slice(-3)} {KIND[r.kind]?.[1] ?? r.kind}</span></div><time>{ago(r.t)}</time></div>
              ))}
            </div>
          ) : (
            <div className="panel">
              <div className="lh">Beacons <span className="muted">· on-chain snapshots</span></div>
              {beacons.slice(-8).reverse().map((b) => (
                <a key={b.tx} className="feed" href={`${endpoints.explorer}/transaction/${b.tx}`} target="_blank" rel="noreferrer"><span className="ic">📡</span><div><b>{b.u} players · {egg(b.p)} EGG</b> <span>{b.e} events</span></div><time>{ago(b.t)}</time></a>
              ))}
              {beacons.length === 0 && <div className="empty">Waiting for the first beacon…</div>}
            </div>
          )}
          <div className="panel">
            <div className="lh">Claims on-chain</div>
            {claims.length === 0 && <div className="empty">No claims yet</div>}
            {claims.slice(0, 12).map((c) => (
              <a key={c.hash} className="feed" href={`${endpoints.explorer}/transaction/${c.hash}`} target="_blank" rel="noreferrer">
                <span className="ic">{c.ok ? '✅' : '⚠️'}</span><div><b>{short(c.wallet)}</b> <span>proved its share</span></div><time>{ago(c.t)}</time>
              </a>
            ))}
          </div>
        </div>
      </section>

      {err && <p className="err">{err}</p>}
      <footer>
        <div><b>hatch.tg</b> · the public ledger of EGG. Inside Telegram the numbers update every 3 seconds from the bot; here they come from the blockchain and the bot’s on-chain beacons (every minute at most).</div>
        <div className="links"><a href={`https://t.me/${cfg.bot}`}>@{cfg.bot}</a><a href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">Contract</a></div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- header with the search
function Nav({ inTelegram, lastAt }: { inTelegram: boolean; lastAt?: number }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<null | { lines: [string, string][]; link?: string; note?: string }>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const parsed = parseQuery(q);
    if (!parsed) return setRes({ lines: [], note: 'Enter a wallet address, a transaction hash or a @username' });
    if (parsed.kind === 'tx') return void window.open(`${endpoints.explorer}/transaction/${parsed.hash}`, '_blank');
    setBusy(true);
    try {
      const lines: [string, string][] = [];
      let addr: Address | null = parsed.kind === 'address' ? parsed.address : null;
      if (inTelegram) {
        const r = await api.lookup(addr ? addr.toRawString() : parsed.kind === 'username' ? parsed.name : '');
        if (r.found) {
          lines.push(['Ledger (bot)', `${egg(r.ledger ?? '0', 2)} EGG`]);
          lines.push(['Signed root', r.entitlement ? `${egg(r.entitlement.cumulative, 2)} EGG in root #${r.entitlement.root.seq}` : 'not in a root yet']);
          if (!addr && r.address) addr = Address.parseRaw(r.address);
        } else if (parsed.kind === 'username') return setRes({ lines: [], note: `@${parsed.name} is not in the ledger` });
      } else if (parsed.kind === 'username') {
        return setRes({ lines: [], note: 'Usernames can be looked up inside Telegram. Paste a wallet address here.' });
      }
      if (addr) {
        const c = await walletOnChain(addr);
        lines.push(['On-chain balance', `${egg(c.balance, 2)} EGG`]);
        lines.push(['Claimed in total', `${egg(c.claimed, 2)} EGG`]);
        return setRes({ lines, link: `${endpoints.explorer}/${addr.toString({ bounceable: false, testOnly: cfg.network === 'testnet' })}` });
      }
      setRes({ lines, note: lines.length ? undefined : 'Nothing found' });
    } catch {
      setRes({ lines: [], note: 'Could not look that up' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="nav">
      <a className="brand" href="#top"><span className="logo">🥚</span><b>hatch<i>.tg</i></b></a>
      <nav><a href="#post">Post</a><a href="#verify">Verify</a><a href="#activity">Activity</a></nav>
      <form className="search" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setRes(null); }} placeholder={inTelegram ? 'Wallet, @username or transaction' : 'Wallet address or transaction'} spellCheck={false} autoCapitalize="none" />
        <button disabled={busy || !q.trim()}>{busy ? '…' : 'Search'}</button>
        {res && (
          <div className="result">
            {res.lines.map(([k, v]) => <div key={k} className="row"><span>{k}</span><b>{v}</b></div>)}
            {res.note && <div className="note">{res.note}</div>}
            {res.link && <a href={res.link} target="_blank" rel="noreferrer">Open in the TON explorer ↗</a>}
          </div>
        )}
      </form>
      <div className={`live ${inTelegram ? 'on' : ''}`}><i />{inTelegram ? 'Live' : lastAt ? `Beacon · ${ago(lastAt)}` : 'On-chain'}</div>
    </header>
  );
}
