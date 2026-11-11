import { Address } from '@ton/core';
import { ReactNode } from 'react';
import { cfg } from '../config';
import { formatUnits } from '../lib/format';
import { useCountUp } from '../ui/useCountUp';

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
