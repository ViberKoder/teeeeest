import { Address } from '@ton/core';
import { ReactNode } from 'react';
import { cfg } from '../config';
import { formatUnits } from '../lib/format';
import { useCountUp } from '../ui/useCountUp';
import type { PostView } from './data';
import { DEFAULT_CAPTION } from './data';

export const D = 9;
export const egg = (v: bigint | string, frac = 0) => formatUnits(BigInt(v), D, frac);
export const nowS = () => Math.floor(Date.now() / 1000);
export const ago = (t: number) => {
  const s = Math.max(0, nowS() - t);
  return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString('en'));
export const friendly = (a: string) => {
  try { return Address.parse(a).toString({ bounceable: false, testOnly: cfg.network === 'testnet' }); } catch { return a; }
};
export const short = (a: string, n = 5) => { const f = friendly(a); return f.length > 2 * n + 1 ? `${f.slice(0, n)}…${f.slice(-n)}` : f; };

export const KIND: Record<string, [string, string]> = {
  post: ['🥚', 'hatched a post'],
  inline: ['🐣', 'hatched a friend’s egg'],
  sender: ['📨', 'their egg was hatched'],
  ref: ['🤝', 'referral bonus'],
  legacy: ['🥚', 'early hatch'],
};

/** A number that counts up to its new value. */
export function Count({ value, frac = 0 }: { value: bigint; frac?: number }) {
  const v = useCountUp(value, 900);
  return <>{frac ? formatUnits(v, D, frac) : v.toLocaleString('en')}</>;
}

/** A wallet address as a link to its page in this explorer. */
export const Addr = ({ a, n = 5 }: { a: string; n?: number }) => <a className="addr" href={`#/address/${encodeURIComponent(friendly(a))}`} title={friendly(a)}>{short(a, n)}</a>;

export const Card = ({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) => (
  <div className={`card ${className}`}>
    {(title || right) && <div className="card-h"><h3>{title}</h3>{right && <div className="card-r">{right}</div>}</div>}
    {children}
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/** A tile like the ones on gram.org: a label, a big number, a small caption and (when there is history) a sparkline. */
export function Stat({ label, value, sub, points, tone = 'gold', flash }: { label: string; value: bigint | number; sub?: ReactNode; points?: number[]; tone?: 'gold' | 'green' | 'sky'; flash?: boolean }) {
  return (
    <div className={`stat ${tone} ${flash ? 'flash' : ''}`}>
      <div className="k">{label}</div>
      <div className="v"><Count value={BigInt(Math.round(Number(value)))} /></div>
      {sub && <div className="s">{sub}</div>}
      {points && points.length > 1 && <Line points={points} />}
    </div>
  );
}

export function Line({ points }: { points: number[] }) {
  const lo = Math.min(...points), hi = Math.max(...points);
  const pts = points.map((v, i) => `${((i / (points.length - 1)) * 100).toFixed(1)},${(26 - ((v - lo) / Math.max(1e-9, hi - lo)) * 22).toFixed(1)}`);
  return (
    <svg className="line" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <path d={`M${pts.join(' L')} L100,30 L0,30 Z`} className="fill" />
      <path d={`M${pts.join(' L')}`} className="stroke" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Bars({ data, label, unit }: { data: { d: number; v: number }[]; label: string; unit: string }) {
  const max = Math.max(1, ...data.map((x) => x.v));
  return (
    <Card title={label} right={<span className="muted">last {data.length} days</span>}>
      <div className="bars">
        {data.map((x) => (
          <div key={x.d} className="bar" data-tip={`${new Date(x.d * 86400000).toLocaleDateString('en', { month: 'short', day: 'numeric' })}: ${x.v.toLocaleString('en')} ${unit}`}>
            <i style={{ height: `${Math.max(5, (x.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A stacked bar with a legend: what part of a whole is what. */
export function Stack({ parts, total }: { parts: { label: string; v: bigint; cls: string; bar?: boolean }[]; total: bigint }) {
  // the bar shows only what exists (claimed / promised); open headroom is far larger and would hide both, so it is listed, not drawn
  const t = total > 0n ? total : 1n;
  return (
    <div className="stack">
      <div className="stackbar">{parts.filter((p) => p.bar !== false).map((p) => <i key={p.label} className={p.cls} style={{ width: `${Math.max(p.v > 0n ? 2 : 0, Math.min(100, Number((p.v * 10000n) / t) / 100))}%` }} />)}</div>
      <div className="legend">{parts.map((p) => <div key={p.label}><span className={`sw ${p.cls}`} />{p.label}<b>{egg(p.v)}</b></div>)}</div>
    </div>
  );
}

export function PostCard({ post, live }: { post: PostView | null; live: boolean }) {
  const p: PostView = post ?? { title: 'Egg', username: '', messageId: null, hatches: 0, views: 0, reactions: 0, at: nowS(), caption: DEFAULT_CAPTION };
  const link = p.username ? `https://t.me/${p.username}${p.messageId ? `/${p.messageId}` : ''}` : `https://t.me/${cfg.bot}`;
  const time = new Date(p.at * 1000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="chat">
      <div className="bubble">
        <div className="bh">
          <span className="av">🥚</span>
          <div><b>{p.title}</b><span>channel{p.username ? ` · @${p.username}` : ''}</span></div>
          {live && <em className="rec"><i />live</em>}
        </div>
        <a className="photo" href={link} target="_blank" rel="noreferrer"><img src="/post-egg.jpg" alt="Egg post" loading="lazy" /></a>
        <a className="kbtn" href={link} target="_blank" rel="noreferrer">🥚 Hatch · <Count value={BigInt(p.hatches)} /></a>
        <div className="bf">
          <div className="reacts"><span title="Hatches">🥚 <Count value={BigInt(p.hatches)} /></span><span title="Reactions in Telegram">❤️ <Count value={BigInt(p.reactions)} /></span></div>
          <div className="meta"><span title="Views in Telegram">👁 {p.views ? compact(p.views) : '—'}</span><span>{time}</span></div>
        </div>
      </div>
    </div>
  );
}
