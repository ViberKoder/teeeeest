import { Address } from '@ton/core';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/server';
import { cfg, endpoints } from '../config';
import { Egg3D } from '../ui/Egg3D';
import { PostView, postFromBeacon } from './data';
import { ExplorerData, useExplorerData, useRoute } from './hooks';
import { parseQuery } from './search';
import { Addr, ago, Bars, Card, compact, Count, egg, Empty, friendly, KIND, nowS, PostCard, Stack, Stat } from './ui';
import { AddressView, ClaimsView, HoldersView, PostsView, RootsView, TokenView } from './views';

const TABS: [string, string][] = [['', 'Overview'], ['holders', 'Holders'], ['claims', 'Claims'], ['roots', 'Roots'], ['token', 'Token'], ['posts', 'Post']];

export function Explorer() {
  const d = useExplorerData();
  const route = useRoute();
  const lastBeacon = d.beacons[d.beacons.length - 1];
  const page = route[0] ?? '';
  return (
    <div className="ex">
      <div className="mesh" aria-hidden />
      <Nav d={d} page={page} lastAt={d.live ? nowS() : lastBeacon?.t} />
      <main>
        {page === '' && <Overview d={d} />}
        {page === 'holders' && <HoldersView d={d} />}
        {page === 'claims' && <ClaimsView d={d} />}
        {page === 'roots' && <RootsView d={d} />}
        {page === 'token' && <TokenView d={d} />}
        {page === 'posts' && <PostsView d={d} />}
        {page === 'address' && <AddressView raw={route[1] ?? ''} d={d} />}
      </main>
      {d.err && <p className="err">{d.err}</p>}
      <footer>
        <div><b>hatch.tg</b> · the public ledger of EGG. Inside Telegram the numbers update every 3 seconds from the bot; here they come from the blockchain and the bot’s on-chain beacons.</div>
        <div className="links"><a href={`https://t.me/${cfg.bot}`}>@{cfg.bot}</a><a href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">Contract</a></div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- overview
function Overview({ d }: { d: ExplorerData }) {
  const { live, chain, claims, beacons } = d;
  const lastBeacon = beacons[beacons.length - 1];
  const s = live?.stats ?? (lastBeacon ? {
    users: lastBeacon.u, wallets: lastBeacon.w, promised: lastBeacon.p, events: lastBeacon.e, posts: lastBeacon.po, views: lastBeacon.vi, eggs: lastBeacon.eg,
    newUsersToday: 0, hatchesLastHour: 0, eggHatches: 0,
  } : null);
  const post: PostView | null = live?.stats.latestPost
    ? { ...live.stats.latestPost, username: live.stats.latestPost.username ?? '', caption: live.stats.latestPost.caption ?? '' }
    : postFromBeacon(lastBeacon);
  const promised = BigInt(s?.promised ?? '0');
  const claimed = chain?.supply ?? 0n;
  const claimedPct = promised > 0n ? Number((claimed * 1000n) / promised) / 10 : 0;

  // every new event makes the egg burst
  const [burst, setBurst] = useState(0);
  const [pops, setPops] = useState<{ id: number; text: string; x: number }[]>([]);
  const seen = useRef<{ events: number; users: number } | null>(null);
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

  const hist = (f: (b: (typeof beacons)[number]) => number) => beacons.slice(-24).map(f);
  const days = live?.days;
  return (
    <>
      <section className="hero">
        <div className="copy">
          <span className="pill"><i /> {cfg.network === 'testnet' ? 'TON testnet' : 'TON mainnet'} · public ledger</span>
          <h1>Every egg,<br /><em>checkable.</em></h1>
          <p>EGG is hatched in Telegram and owned on TON. Every number here is read from the token contract or checked against it, right in your browser.</p>
          <div className="big">
            <div className="lbl">EGG promised to players</div>
            <div className="num"><Count value={promised / 10n ** 9n} /><span>EGG</span></div>
            <div className="bar2"><i style={{ width: `${Math.min(100, claimedPct)}%` }} /></div>
            <div className="lbl2"><b>{egg(claimed)}</b> already on-chain ({claimedPct.toFixed(claimedPct < 10 ? 1 : 0)}%) · <b>{chain?.holders ?? 0}</b> holders</div>
          </div>
          <div className="cta">
            <a className="btn" href={`https://t.me/${cfg.bot}`}>Open the wallet</a>
            <a className="btn ghost" href="#/token">How to verify</a>
          </div>
        </div>
        <div className="stage">
          <div className="halo" />
          <div className="egg3d"><Egg3D energy={0.6} burst={burst} /></div>
          {pops.map((p) => <span key={p.id} className="pop" style={{ left: `${p.x}%` }}>{p.text}</span>)}
          <div className="hint">drag · zoom · tap</div>
        </div>
      </section>

      <section className="stats">
        <Stat label="Players" value={s?.users ?? 0} sub={live ? `+${live.stats.newUsersToday} today` : 'registered in Telegram'} points={hist((b) => b.u)} />
        <Stat label="Wallets" value={s?.wallets ?? 0} sub="linked with a signature" points={hist((b) => b.w)} tone="green" />
        <Stat label="Hatches & rewards" value={s?.events ?? 0} sub={live ? `${live.stats.hatchesLastHour} in the last hour` : 'all time'} points={hist((b) => b.e)} />
        <Stat label="Holders" value={chain?.holders ?? 0} sub="wallets with EGG on-chain" tone="sky" />
        <Stat label="Claims on-chain" value={claims.filter((c) => c.ok).length} sub="players proved their share" tone="green" />
        <Stat label="Eggs sent in chats" value={s?.eggs ?? 0} sub={live ? `${live.stats.eggHatches} hatched` : 'via @' + cfg.bot} tone="sky" />
      </section>

      <section className="grid2">
        <Card title="Supply" right={<a className="link" href="#/token">Token details →</a>}>
          {chain ? (
            <Stack total={promised > chain.supply ? promised : chain.supply} parts={[
              { label: 'Claimed on-chain', v: chain.supply, cls: 'c1' },
              { label: 'Promised, not claimed yet', v: promised > chain.supply ? promised - chain.supply : 0n, cls: 'c2' },
              { label: 'Open headroom to the hard cap', v: chain.maxSupply > promised ? chain.maxSupply - promised : 0n, cls: 'c3', bar: false },
            ]} />
          ) : <Empty>Reading the contract…</Empty>}
          <div className="mini">
            <div><span>Hard cap</span><b>{chain ? egg(chain.maxSupply) : '—'}</b></div>
            <div><span>Per wallet / day</span><b>{chain ? egg(chain.walletDaily) : '—'}</b></div>
            <div><span>Signing key</span><b className={chain?.frozen ? 'bad' : 'ok'}>{chain ? (chain.frozen ? 'frozen' : 'active') : '—'}</b></div>
          </div>
        </Card>
        <PostCard post={post} live={d.inTelegram} />
      </section>

      {days ? (
        <section className="grid2">
          <Bars label="EGG earned per day" unit="EGG" data={days.egg.map((x) => ({ d: x.d, v: Number(BigInt(x.egg) / 10n ** 9n) }))} />
          <Bars label="New players per day" unit="players" data={days.users.map((x) => ({ d: x.d, v: x.n }))} />
        </section>
      ) : null}

      <section className="grid2">
        <Card title={live ? 'Live feed' : 'On-chain beacons'} right={live ? <em className="rec"><i />live</em> : <span className="muted">snapshots by the bot’s wallet</span>}>
          {live ? live.recent.slice(0, 10).map((r, i) => (
            <div key={`${r.t}-${i}`} className="feed"><span className="ic">{KIND[r.kind]?.[0] ?? '•'}</span><div><b>+{egg(r.amount, 2)} EGG</b><span>…{r.who.slice(-3)} {KIND[r.kind]?.[1] ?? r.kind}</span></div><time>{ago(r.t)}</time></div>
          )) : beacons.slice(-8).reverse().map((b) => (
            <a key={b.tx} className="feed" href={`${endpoints.explorer}/transaction/${b.tx}`} target="_blank" rel="noreferrer"><span className="ic">📡</span><div><b>{b.u} players · {egg(b.p)} EGG</b><span>{b.e} events</span></div><time>{ago(b.t)}</time></a>
          ))}
          {!live && beacons.length === 0 && <Empty>Waiting for the first beacon…</Empty>}
        </Card>
        <Card title="Latest claims" right={<a className="link" href="#/claims">All claims →</a>}>
          {claims.length === 0 && <Empty>No claims yet</Empty>}
          {claims.slice(0, 8).map((c) => (
            <a key={c.hash} className="feed" href={`${endpoints.explorer}/transaction/${c.hash}`} target="_blank" rel="noreferrer">
              <span className="ic">{c.ok ? '✅' : '⚠️'}</span><div><b><Addr a={c.wallet} /></b><span>proved its share</span></div><time>{ago(c.t)}</time>
            </a>
          ))}
        </Card>
      </section>
      <p className="muted center">{s?.views ? `${compact(s.views)} post views · ` : ''}{s?.posts ?? 0} posts</p>
    </>
  );
}

// ---------------------------------------------------------------- header with the search
function Nav({ d, page, lastAt }: { d: ExplorerData; page: string; lastAt?: number }) {
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const parsed = parseQuery(q);
    setNote('');
    if (!parsed) return setNote('Enter a wallet address, a transaction hash or a @username');
    if (parsed.kind === 'tx') return void window.open(`${endpoints.explorer}/transaction/${parsed.hash}`, '_blank');
    if (parsed.kind === 'address') { location.hash = `#/address/${encodeURIComponent(friendly(parsed.address.toRawString()))}`; return setQ(''); }
    if (!d.inTelegram) return setNote('Usernames can be looked up inside Telegram. Paste a wallet address here.');
    setBusy(true);
    try {
      const r = await api.lookup(parsed.name);
      if (r.found && r.address) { location.hash = `#/address/${encodeURIComponent(friendly(Address.parseRaw(r.address).toRawString()))}`; setQ(''); }
      else setNote(`@${parsed.name} has no wallet yet`);
    } catch { setNote('Could not look that up'); } finally { setBusy(false); }
  };

  return (
    <header className="nav">
      <a className="brand" href="#/"><span className="logo">🥚</span><b>hatch<i>.tg</i></b></a>
      <nav>{TABS.map(([k, t]) => <a key={k} href={`#/${k}`} className={(k === page || (k === 'posts' && page === 'posts')) ? 'on' : ''}>{t}</a>)}</nav>
      <form className="search" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setNote(''); }} placeholder={d.inTelegram ? 'Wallet, @username or transaction' : 'Wallet address or transaction'} spellCheck={false} autoCapitalize="none" />
        <button disabled={busy || !q.trim()}>{busy ? '…' : 'Search'}</button>
        {note && <div className="result"><div className="note">{note}</div></div>}
      </form>
      <div className={`live ${d.inTelegram ? 'on' : ''}`}><i />{d.inTelegram ? 'Live' : lastAt ? `Beacon · ${ago(lastAt)}` : 'On-chain'}</div>
    </header>
  );
}
