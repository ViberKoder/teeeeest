import { useMemo, useState } from 'react';
import type { Activity } from '../chain/history';
import { clock, formatUnits, shortAddr } from '../lib/format';
import { EggCoin } from './EggCoin';
import { GramCoin, GramGlyph } from './Gram';

const dayLabel = (t: number) => {
  const d = new Date(t * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

export const txTitle = (a: Activity) => (a.failed ? 'Failed' : a.label === 'hatch' ? 'Earned' : a.direction === 'in' ? 'Received' : 'Sent');

/** The coin of a transaction: our little egg for EGG (golden with sparks when it was earned), the Gram diamond for Gram. */
export function TxCoin({ a, size = 44 }: { a: Activity; size?: number }) {
  const badge = a.label === 'hatch' ? undefined : a.direction;
  return a.kind === 'egg' ? <EggCoin size={size} tone={a.label === 'hatch' ? 'gold' : 'cream'} spark={a.label === 'hatch'} badge={badge} /> : <GramCoin size={size} badge={badge} />;
}

export function Amount({ a, big = false }: { a: Activity; big?: boolean }) {
  const sign = a.direction === 'in' ? '+' : '−';
  return (
    <span className={`amt num ${a.direction === 'in' && !a.failed ? 'in' : ''} ${a.failed ? 'fail' : ''} ${big ? 'big' : ''}`}>
      {sign}{formatUnits(a.amount, a.decimals, 2)}
      <span className="sym">{a.kind === 'ton' ? <GramGlyph size={big ? 22 : 13} /> : null}{a.kind === 'egg' ? a.symbol : ''}</span>
    </span>
  );
}

export function TxRow({ a, onClick }: { a: Activity; onClick?: () => void }) {
  const peer = a.peer ? shortAddr(a.peer.replace(/^0:/, ''), 4, 4) : '';
  return (
    <button className="tx" onClick={onClick}>
      <TxCoin a={a} />
      <span className="tx-main">
        <span className="tx-title">{txTitle(a)}</span>
        <span className="tx-sub num">
          {a.label === 'hatch' ? 'Verified on-chain' : peer ? `${a.direction === 'in' ? 'from' : 'to'} ${peer}` : a.direction === 'in' ? 'Incoming' : 'Outgoing'} · {clock(a.time)}
        </span>
        {a.comment && !a.label && <span className="tx-note">“{a.comment}”</span>}
      </span>
      <Amount a={a} />
    </button>
  );
}

type Filter = 'all' | 'egg' | 'gram';

/** Activity grouped by day, with a filter. Everything the wallet moved shows here the same way, whatever it was moved on. */
export function ActivityList({ items, loading, onOpen, eggOn }: { items: Activity[]; loading: boolean; onOpen: (a: Activity) => void; eggOn: boolean }) {
  const [f, setF] = useState<Filter>('all');
  const groups = useMemo(() => {
    const out: { day: string; items: Activity[] }[] = [];
    for (const a of items.filter((x) => f === 'all' || (f === 'egg' ? x.kind === 'egg' : x.kind === 'ton')).slice(0, 40)) {
      const day = dayLabel(a.time);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(a);
      else out.push({ day, items: [a] });
    }
    return out;
  }, [items, f]);

  return (
    <section className="activity">
      <div className="act-head">
        <h3>Activity</h3>
        {eggOn && (
          <div className="chips-seg" role="tablist">
            {(['all', 'egg', 'gram'] as Filter[]).map((k) => (
              <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k === 'all' ? 'All' : k === 'egg' ? 'EGG' : 'Gram'}</button>
            ))}
          </div>
        )}
      </div>
      {groups.length === 0 ? (
        <div className="empty-card">
          <EggCoin size={54} float />
          <b>{loading ? 'Loading…' : 'No transactions yet'}</b>
          <span>{loading ? '' : 'Everything you earn, send and receive shows up here.'}</span>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.day} className="day-group">
            <div className="day-label">{g.day}</div>
            <div className="card tx-card">{g.items.map((a) => <TxRow key={a.id} a={a} onClick={() => onOpen(a)} />)}</div>
          </div>
        ))
      )}
    </section>
  );
}
