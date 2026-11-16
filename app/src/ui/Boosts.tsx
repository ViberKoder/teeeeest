import type { EarnBoost } from '../api/server';

/** A boost's own emoji on a gradient tile (the server names the boost and picks its icon). */
export function BoostIcon({ b, size = 44 }: { b: EarnBoost; size?: number }) {
  return <span className="boost-ic" style={{ width: size, height: size, fontSize: size * 0.56 }}>{b.icon}</span>;
}

/** Level pips: filled up to the current level. */
export function Pips({ level, max }: { level: number; max: number }) {
  return <span className="pips" aria-label={`Level ${level} of ${max}`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}</span>;
}
