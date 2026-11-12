import { Address } from '@ton/core';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/server';
import { cfg, endpoints } from '../config';
import { Holder, Move, readHolders, rootFromTuple, rootIsSigned, walletHistory, walletOnChain } from './data';
import type { ExplorerData } from './hooks';
import { langName } from './geo';
import { WorldMap } from '../ui/WorldMap';
import { Addr, ago, Card, egg, Empty, friendly, KIND, short, Stack } from './ui';

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

// ---------------------------------------------------------------- the spread map
export function MapView({ d }: { d: ExplorerData }) {
  const last = d.beacons[d.beacons.length - 1];
  const langs: [string, number][] = d.live?.langs?.length ? d.live.langs : last?.lg ?? [];
  const total = langs.reduce((a, [, n]) => a + n, 0);
  return (
    <div className="grid2 mapgrid">
      <Card title="Where the eggs travel" right={<span className="muted">by players’ Telegram language</span>}>
        <WorldMap langs={langs} />
        {total === 0 && <Empty>The map fills as players open the bot: Telegram tells us only the interface language, nothing else about where anyone is.</Empty>}
      </Card>
      <Card title="Languages" right={<span className="muted">{total.toLocaleString('en')} players with a known language</span>}>
        <div className="table">
          {langs.slice(0, 12).map(([code, n], i) => (
            <div key={code} className="tr c3"><span><span className="rk">{i + 1}</span> {langName(code)}</span><span className="muted">{code}</span><span className="r"><b>{n.toLocaleString('en')}</b> · {Math.round((n / Math.max(1, total)) * 100)}%</span></div>
          ))}
          {langs.length === 0 && <Empty>No data yet.</Empty>}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- channel battles
const weekOf = (t: number) => Math.floor((t - 4 * 86400) / 604800);
export function BattlesView({ d }: { d: ExplorerData }) {
  const last = d.beacons[d.beacons.length - 1];
  const board = d.live?.battle?.board ?? (last?.bt ?? []).map(([title, score, players], i) => ({ rank: i + 1, chatId: i, title, username: null as string | null, score, players }));
  const endsAt = d.live?.battle?.endsAt ?? (weekOf(Math.floor(Date.now() / 1000)) + 1) * 604800 + 4 * 86400;
  const left = Math.max(0, endsAt - Math.floor(Date.now() / 1000));
  const top = Math.max(1, ...board.map((b) => b.score));
  return (
    <Card title="Channel battles" right={<span className="muted">ends in {Math.floor(left / 86400)}d {Math.floor((left % 86400) / 3600)}h</span>}>
      <p className="note" style={{ marginTop: 0 }}>One Hatch a day under a channel’s post scores a point for that channel. When the week ends, the three best channels pay EGG to everyone who hatched there.</p>
      <div className="table">
        <div className="tr th c4"><span>Channel</span><span className="r">Hatches</span><span className="r">Players</span><span>Share of the leader</span></div>
        {board.map((b) => (
          <a key={b.chatId} className="tr c4" href={b.username ? `https://t.me/${b.username}` : undefined} target="_blank" rel="noreferrer">
            <span>{['🥇', '🥈', '🥉'][b.rank - 1] ?? `${b.rank}.`} <b>{b.title}</b></span>
            <span className="r"><b>{b.score.toLocaleString('en')}</b></span>
            <span className="r">{b.players.toLocaleString('en')}</span>
            <span><em className="pbar wide"><i style={{ width: `${(b.score / top) * 100}%` }} /></em></span>
          </a>
        ))}
        {board.length === 0 && <Empty>No hatches yet this week. Be the first channel on the board.</Empty>}
      </div>
    </Card>
  );
}
