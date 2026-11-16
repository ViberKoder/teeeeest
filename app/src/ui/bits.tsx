import type { ReactNode } from 'react';

const HUES = [28, 46, 96, 150, 176, 204, 262, 330];
/** A round avatar from the first letter of a name, tinted by id. */
export function Avatar({ name, id, size = 40 }: { name: string; id: number; size?: number }) {
  const h = HUES[Math.abs(id) % HUES.length];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(145deg, hsl(${h} 85% 70%), hsl(${(h + 28) % 360} 70% 46%))` }}>
      {(Array.from(name.trim())[0] ?? '?').toUpperCase()}
    </span>
  );
}

export const Pips = ({ n, max }: { n: number; max: number }) => (
  <span className="pips">{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>
);

export const Bar = ({ value }: { value: number }) => <span className="pbar"><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></span>;

export const Seg = <T extends string>({ value, items, onChange }: { value: T; items: [T, string][]; onChange: (v: T) => void }) => (
  <div className="seg2">{items.map(([k, t]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{t}</button>)}</div>
);

export const Hero = ({ icon, title, sub, children }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode }) => (
  <header className="tab-hero">
    {icon && <div className="tab-hero-ic">{icon}</div>}
    <h1>{title}</h1>
    {sub && <p>{sub}</p>}
    {children}
  </header>
);

export const copyText = (t: string) => { try { void navigator.clipboard?.writeText(t); } catch { /* ignore */ } };
