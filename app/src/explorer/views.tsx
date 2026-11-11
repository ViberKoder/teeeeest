import { Address } from '@ton/core';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/server';
import { cfg, endpoints } from '../config';
import { Holder, Move, PostView, postFromBeacon, readHolders, rootFromTuple, rootIsSigned, walletHistory, walletOnChain } from './data';
import type { ExplorerData } from './hooks';
import { Addr, ago, Card, compact, Count, egg, Empty, friendly, KIND, PostCard, short, Stack } from './ui';

const tx = (h: string) => `${endpoints.explorer}/transaction/${h}`;

// ---------------------------------------------------------------- holders
export function HoldersView({ d }: { d: ExplorerData }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<{ total: number; items: Holder[] } | null>(null);
  const PER = 25;
  useEffect(() => { setRows(null); void readHolders(page * PER, PER).then(setRows).catch(() => setRows({ total: 0, items: [] })); }, [page]);
  const supply = d.chain?.supply ?? 0n;
  return (
    <Card title="Holders" right={<span className="muted">{rows ? rows.total.toLocaleString('en') : '…'} wallets hold EGG</span>}>
      <div className="table">
        <div className="tr th"><span>#</span><span>Wallet</span><span className="r">Balance</span><span className="r share">Share</span></div>
        {rows?.items.map((h, i) => {
          const pct = supply > 0n ? Number((h.balance * 10000n) / supply) / 100 : 0;
          return (
            <div key={h.owner} className="tr">
              <span className="rk">{page * PER + i + 1}</span>
              <span><Addr a={h.owner} n={7} /></span>
              <span className="r"><b>{egg(h.balance, 2)}</b> EGG</span>
              <span className="r share"><em className="pbar"><i style={{ width: `${Math.min(100, pct)}%` }} /></em>{pct.toFixed(pct < 10 ? 2 : 1)}%</span>
            </div>
          );
        })}
        {rows && rows.items.length === 0 && <Empty>No holders yet. The first claim creates one.</Empty>}
        {!rows && <Empty>Loading…</Empty>}
      </div>
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
        <span>Page {page + 1}</span>
        <button disabled={!rows || (page + 1) * PER >= rows.total} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- claims
export function ClaimsView({ d }: { d: ExplorerData }) {
  return (
    <div className="stackv">
      <Card title="Claims on-chain" right={<span className="muted">a player proves their share to the token contract</span>}>
        <div className="table">
          <div className="tr th c3"><span>Wallet</span><span>Result</span><span className="r">When</span></div>
          {d.claims.map((c) => (
            <a key={c.hash} className="tr c3" href={tx(c.hash)} target="_blank" rel="noreferrer">
              <span className="mono">{short(c.wallet, 6)}</span>
              <span><i className={`tag ${c.ok ? 'ok' : 'bad'}`}>{c.ok ? 'accepted' : 'refused'}</i></span>
              <span className="r muted">{ago(c.t)} ↗</span>
            </a>
          ))}
          {d.claims.length === 0 && <Empty>No claims yet.</Empty>}
        </div>
      </Card>
      {d.live && (
        <Card title="Hatches & rewards" right={<em className="rec"><i />live</em>}>
          <div className="table">
            {d.live.recent.slice(0, 30).map((r, i) => (
              <div key={`${r.t}-${i}`} className="tr c3">
                <span>{KIND[r.kind]?.[0] ?? '•'} <b>+{egg(r.amount, 2)} EGG</b></span>
                <span className="muted">…{r.who.slice(-3)} {KIND[r.kind]?.[1] ?? r.kind}</span>
                <span className="r muted">{ago(r.t)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- signed roots
export function RootsView({ d }: { d: ExplorerData }) {
  const list = useMemo(() => {
    const seen = new Map<string, { seq: number; total: string; treeRoot: string; signature: string; t: number; tx: string }>();
    for (const b of d.beacons) if (b.r) seen.set(String(b.r[0]), { seq: b.r[0], total: b.r[1], treeRoot: b.r[2], signature: b.r[3], t: b.t, tx: b.tx });
    if (d.live?.stats.root) { const r = d.live.stats.root; seen.set(String(r.seq), { seq: r.seq, total: r.total, treeRoot: r.treeRoot, signature: r.signature, t: r.at, tx: '' }); }
    return [...seen.values()].sort((a, b) => b.seq - a.seq);
  }, [d.beacons, d.live]);
  return (
    <Card title="Signed roots" right={<span className="muted">the bot signs one Merkle root for everybody; the contract checks it on every claim</span>}>
      <div className="table">
        <div className="tr th c4"><span>Root</span><span className="r">Total promised</span><span>Signature</span><span className="r">Seen</span></div>
        {list.map((r) => {
          const ok = d.chain ? rootIsSigned(rootFromTuple([r.seq, r.total, r.treeRoot, r.signature]), d.chain.publisherKey) : null;
          return (
            <div key={r.seq} className="tr c4">
              <span><b>#{r.seq}</b> <span className="mono muted">{r.treeRoot.slice(0, 10)}…</span></span>
              <span className="r"><b>{egg(r.total)}</b> EGG</span>
              <span><i className={`tag ${ok === null ? 'wait' : ok ? 'ok' : 'warn'}`}>{ok === null ? 'checking' : ok ? 'valid, current key' : 'older key'}</i></span>
              <span className="r muted">{ago(r.t)}</span>
            </div>
          );
        })}
        {list.length === 0 && <Empty>No signed root has been seen yet.</Empty>}
      </div>
      <p className="note">Every signature above is verified in your browser (ed25519) against <code>get_publisher_key()</code> of the token contract. A root signed by a retired key stays valid only for what it had already promised.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- the token
export function TokenView({ d }: { d: ExplorerData }) {
  const { chain, meta, live } = d;
  const s = live?.stats ?? null;
  const last = d.beacons[d.beacons.length - 1];
  const promised = BigInt(s?.promised ?? last?.p ?? '0');
  const root = s?.root ?? (last?.r ? { seq: last.r[0], total: last.r[1], treeRoot: last.r[2], signature: last.r[3], at: last.t } : null);
  const used = chain && chain.maxGrowth > 0n ? Number((chain.windowGrowth * 1000n) / chain.maxGrowth) / 10 : 0;
  const checks = [
    { ok: chain && root ? rootIsSigned(rootFromTuple([root.seq, root.total, root.treeRoot, root.signature]), chain.publisherKey) : null, t: `Root #${root?.seq ?? '—'} is signed by the key stored in the contract`, h: 'ed25519, checked in your browser against get_publisher_key()' },
    { ok: chain ? chain.supply <= chain.maxTotal && chain.maxTotal <= chain.maxSupply : null, t: 'Claimed ≤ promised ≤ hard cap', h: 'total_supply · get_limits().maxTotal · get_max_supply()' },
    { ok: chain && root ? promised >= BigInt(root.total) && BigInt(root.total) >= chain.supply : null, t: 'Ledger ≥ signed root ≥ claimed on-chain', h: 'the bot’s ledger, the signed root and the contract’s supply' },
    { ok: chain ? !chain.frozen : null, t: 'The signing key was never caught cheating', h: 'a fork proof (ProveFraud) would freeze it on-chain' },
  ];
  const row = (k: string, v: React.ReactNode) => <div className="kv"><span>{k}</span><b>{v}</b></div>;
  return (
    <div className="grid2">
      <Card title={`${meta?.name ?? 'Egg'} · ${meta?.symbol ?? 'EGG'}`} right={<a className="link" href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">Open in TON explorer ↗</a>}>
        <div className="kvs">
          {row('Contract', <span className="mono" title={cfg.master}>{cfg.master ? `${cfg.master.slice(0, 8)}…${cfg.master.slice(-8)}` : '—'}</span>)}
          {row('Decimals', meta?.decimals ?? 9)}
          {row('Total supply (claimed)', chain ? `${egg(chain.supply, 2)} EGG` : '—')}
          {row('Holders', chain ? chain.holders.toLocaleString('en') : '—')}
          {row('Hard cap', chain ? `${egg(chain.maxSupply)} EGG` : '—')}
          {row('Highest total promised', chain ? `${egg(chain.maxTotal)} EGG` : '—')}
          {row('Per wallet', chain ? `${egg(chain.walletDaily)} / day` : '—')}
          {row('Growth limit', chain ? `${egg(chain.maxGrowth)} per ${Math.round(chain.periodSeconds / 60)} min` : '—')}
          {row('Signing key', chain ? <span className="mono">{chain.publisherKey.toString('hex').slice(0, 12)}…</span> : '—')}
          {row('Admin', meta?.admin ? <Addr a={meta.admin} n={6} /> : <span className="muted">none (dropped) or unknown</span>)}
        </div>
        <div className="meter"><i style={{ width: `${Math.min(100, used)}%` }} /></div>
        <div className="mlabel">{used.toFixed(used < 10 ? 1 : 0)}% of this period’s growth budget used</div>
        {chain && <Stack total={promised > chain.supply ? promised : chain.supply} parts={[
          { label: 'Claimed on-chain', v: chain.supply, cls: 'c1' },
          { label: 'Promised, not claimed yet', v: promised > chain.supply ? promised - chain.supply : 0n, cls: 'c2' },
          { label: 'Open headroom', v: chain.maxSupply > promised ? chain.maxSupply - promised : 0n, cls: 'c3', bar: false },
        ]} />}
      </Card>
      <Card title="Check it yourself" right={<span className="muted">no trust in us needed</span>}>
        <div className="checks">
          {checks.map((c) => (
            <div key={c.t} className="check">
              <span className={`dot ${c.ok === null ? 'wait' : c.ok ? 'ok' : 'bad'}`}>{c.ok === null ? '…' : c.ok ? '✓' : '✗'}</span>
              <div><b>{c.t}</b><span>{c.h}</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- posts
export function PostsView({ d }: { d: ExplorerData }) {
  const post: PostView | null = d.live?.stats.latestPost
    ? { ...d.live.stats.latestPost, username: d.live.stats.latestPost.username ?? '', caption: d.live.stats.latestPost.caption ?? '' }
    : postFromBeacon(d.beacons[d.beacons.length - 1]);
  return (
    <div className="grid2">
      <div>
        <h2 className="pt">The post</h2>
        <p className="lead">This is what players see in the channel: tap <b>Hatch</b>, get +1 EGG. The numbers below the picture are live.</p>
        <div className="tiles">
          <div><b><Count value={BigInt(post?.hatches ?? 0)} /></b><span>hatches</span></div>
          <div><b>{post?.views ? compact(post.views) : '—'}</b><span>views</span></div>
          <div><b><Count value={BigInt(post?.reactions ?? 0)} /></b><span>reactions</span></div>
        </div>
        {d.live && d.live.top.length > 0 && (
          <Card title="Most hatched posts">
            <div className="table">
              {d.live.top.map((t, i) => (
                <a key={i} className="tr c3" href={t.username ? `https://t.me/${t.username}/${t.messageId}` : undefined} target="_blank" rel="noreferrer">
                  <span><span className="rk">{i + 1}</span> @{t.username ?? 'channel'} #{t.messageId}</span><span className="muted">{ago(t.at)}</span><span className="r"><b>🥚 {t.hatches}</b></span>
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>
      <PostCard post={post} live={d.inTelegram} />
    </div>
  );
}

// ---------------------------------------------------------------- one wallet
export function AddressView({ raw, d }: { raw: string; d: ExplorerData }) {
  const addr = useMemo(() => { try { return Address.parse(raw); } catch { return null; } }, [raw]);
  const [chain, setChain] = useState<{ balance: bigint; claimed: bigint } | null>(null);
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [bot, setBot] = useState<{ ledger: string; cumulative?: string; seq?: number } | null>(null);
  useEffect(() => {
    if (!addr) return;
    setChain(null); setMoves(null); setBot(null);
    void walletOnChain(addr).then(setChain).catch(() => setChain({ balance: 0n, claimed: 0n }));
    void walletHistory(addr).then(setMoves).catch(() => setMoves([]));
    if (d.inTelegram) void api.lookup(addr.toRawString()).then((r) => r.found && setBot({ ledger: r.ledger ?? '0', cumulative: r.entitlement?.cumulative, seq: r.entitlement ? Number(r.entitlement.root.seq) : undefined })).catch(() => undefined);
  }, [addr, d.inTelegram]);
  if (!addr) return <Card title="Wallet"><Empty>That is not a valid TON address.</Empty></Card>;
  const me = addr.toRawString();
  const f = friendly(me);
  const pending = bot?.cumulative && chain ? BigInt(bot.cumulative) - chain.claimed : null;
  return (
    <div className="stackv">
      <Card title="Wallet" right={<a className="link" href={`${endpoints.explorer}/${f}`} target="_blank" rel="noreferrer">TON explorer ↗</a>}>
        <div className="mono wrap">{f}</div>
        <div className="tiles three">
          <div><b>{chain ? egg(chain.balance, 2) : '…'}</b><span>EGG in the wallet</span></div>
          <div><b>{chain ? egg(chain.claimed, 2) : '…'}</b><span>claimed from the contract</span></div>
          <div><b>{bot ? egg(bot.ledger, 2) : '—'}</b><span>{d.inTelegram ? 'promised by the bot’s ledger' : 'ledger (open in Telegram)'}</span></div>
        </div>
        {pending !== null && pending > 0n && <p className="note">⏳ <b>{egg(pending, 2)} EGG</b> are promised in signed root #{bot?.seq} and can be claimed with one tap in the wallet.</p>}
      </Card>
      <Card title="EGG transfers">
        <div className="table">
          <div className="tr th c4"><span>When</span><span>From</span><span>To</span><span className="r">Amount</span></div>
          {moves?.map((m) => {
            const out = m.from && Address.parse(m.from).toRawString() === me;
            return (
              <a key={m.hash + m.t} className="tr c4" href={tx(m.hash)} target="_blank" rel="noreferrer">
                <span className="muted">{ago(m.t)}</span>
                <span>{m.from ? short(m.from) : '—'}</span>
                <span>{m.to ? short(m.to) : '—'}</span>
                <span className={`r ${out ? 'neg' : 'pos'}`}><b>{out ? '−' : '+'}{egg(m.amount, 2)}</b> EGG</span>
              </a>
            );
          })}
          {moves && moves.length === 0 && <Empty>No transfers yet. Claims are credited by the contract and show up as a balance.</Empty>}
          {!moves && <Empty>Loading…</Empty>}
        </div>
      </Card>
    </div>
  );
}
