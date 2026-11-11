import { Address } from '@ton/core';
import { useState } from 'react';
import { api } from '../api/server';
import { cfg, endpoints } from '../config';
import { Egg3D } from '../ui/Egg3D';
import { PostView, postFromBeacon } from './data';
import { ExplorerData, useExplorerData, useRoute } from './hooks';
import { parseQuery } from './search';
import { ago, compact, Count, egg, friendly } from './ui';
import { AddressView, ClaimsView, HoldersView, RootsView, TokenView } from './views';

const TABS: [string, string][] = [['holders', 'Holders'], ['claims', 'Claims'], ['roots', 'Signed roots'], ['token', 'Token']];

const Eye = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5C6.5 5 2.7 9 1.5 12c1.2 3 5 7 10.5 7s9.3-4 10.5-7C21.3 9 17.5 5 12 5Zm0 11.2a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4Zm0-6.4a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z" fill="currentColor" /></svg>
);

export function Explorer() {
  const d = useExplorerData();
  const route = useRoute();
  const page = route[0] ?? 'holders';
  return (
    <div className="ex">
      <Header />
      <Hero d={d} />
      <section className="explorer" id="explorer">
        <h2>Explorer</h2>
        <AddressBar d={d} />
        <div className="tabs">{TABS.map(([k, t]) => <a key={k} href={`#/${k}`} className={page === k ? 'on' : ''}>{t}</a>)}</div>
        <div className="pane">
          {page === 'holders' && <HoldersView d={d} />}
          {page === 'claims' && <ClaimsView d={d} />}
          {page === 'roots' && <RootsView d={d} />}
          {page === 'token' && <TokenView d={d} />}
          {page === 'address' && <AddressView raw={route[1] ?? ''} d={d} />}
        </div>
        {d.err && <p className="err">{d.err}</p>}
      </section>
      <footer>
        <div><b>hatch.tg</b> · the public ledger of EGG. Inside Telegram the numbers update every 3 seconds from the bot; here they come from the blockchain and the bot’s on-chain beacons.</div>
        <div className="links"><a href={`https://t.me/${cfg.bot}`}>@{cfg.bot}</a><a href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">Contract</a></div>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="top">
      <a className="brand" href="#/"><span className="logo">🥚</span><b>hatch<i>.tg</i></b></a>
      <nav><a href="#explorer">Explorer</a><a href="#/token">Token</a><a href={`https://t.me/${cfg.bot}`}>Bot</a></nav>
      <a className="cta" href={`https://t.me/${cfg.bot}`}>Open wallet</a>
    </header>
  );
}

function Hero({ d }: { d: ExplorerData }) {
  const { live, chain, beacons } = d;
  const lastBeacon = beacons[beacons.length - 1];
  const s = live?.stats ?? (lastBeacon ? { users: lastBeacon.u, wallets: lastBeacon.w, promised: lastBeacon.p, events: lastBeacon.e, lastEventAt: 0 } : null);
  // when the newest egg appeared: the bot says so; the public page finds the first beacon that already counted it
  let lastEgg = live?.stats.lastEventAt ?? 0;
  if (!lastEgg) for (let i = beacons.length - 1; i > 0; i--) if (beacons[i].e > beacons[i - 1].e) { lastEgg = beacons[i].t; break; }
  const post: PostView | null = live?.stats.latestPost
    ? { ...live.stats.latestPost, username: live.stats.latestPost.username ?? '', caption: live.stats.latestPost.caption ?? '' }
    : postFromBeacon(lastBeacon);
  const link = post?.username ? `https://t.me/${post.username}${post.messageId ? `/${post.messageId}` : ''}` : `https://t.me/${cfg.bot}`;
  const time = post ? new Date(post.at * 1000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const promised = BigInt(s?.promised ?? '0') / 10n ** 9n;
  return (
    <section className="hero">
      <div className="hero-l">
        <span className="pill"><i /> {cfg.network === 'testnet' ? 'TON testnet' : 'TON mainnet'}</span>
        <h1>Egg</h1>
        <p>Hatch eggs in Telegram and own them on TON. Every egg you earn is proven by a smart contract, not by our word, and anyone can check it here.</p>
        <div className="stats">
          <div><span>Eggs hatched</span><b><Count value={BigInt(s?.events ?? 0)} /></b></div>
          <div><span>EGG promised</span><b><Count value={promised} /></b></div>
          <div><span>Last egg</span><b className="sm">{lastEgg ? ago(lastEgg) : '—'}</b></div>
          <div><span>Players</span><b><Count value={BigInt(s?.users ?? 0)} /></b></div>
          <div><span>Wallets</span><b><Count value={BigInt(s?.wallets ?? 0)} /></b></div>
          <div><span>Holders</span><b><Count value={BigInt(chain?.holders ?? 0)} /></b></div>
        </div>
      </div>
      <div className="hero-r">
        <div className="tgmsg">
          <div className="media"><Egg3D energy={0.7} /></div>
          <div className="foot">
            <button className="react" type="button" title="Reactions in Telegram"><span className="em">❤️</span><b>{compact(post?.reactions ?? 0)}</b></button>
            <span className="views" title="Views in Telegram"><Eye />{post?.views ? compact(post.views) : '—'}</span>
            <span className="time">{time}</span>
          </div>
          <a className="rbtn" href={link} target="_blank" rel="noreferrer">🥚 Hatch{post?.hatches ? ` · ${post.hatches.toLocaleString('en')}` : ''}</a>
        </div>
      </div>
    </section>
  );
}

function AddressBar({ d }: { d: ExplorerData }) {
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
    <form className="bar" onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <input value={q} onChange={(e) => { setQ(e.target.value); setNote(''); }} placeholder={d.inTelegram ? 'Search by wallet address, @username or transaction hash' : 'Search by wallet address or transaction hash'} spellCheck={false} autoCapitalize="none" />
      <button disabled={busy || !q.trim()}>{busy ? '…' : 'Search'}</button>
      {note && <div className="note">{note}</div>}
    </form>
  );
}
void egg;
