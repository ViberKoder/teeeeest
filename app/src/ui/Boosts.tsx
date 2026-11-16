import type { EarnBoost } from '../api/server';

export const BOOST_TINT: Record<EarnBoost['id'], [string, string]> = { rack: ['#ffd84d', '#f0a312'], nest: ['#ffb35a', '#ff6a3d'] };

/** A boost's own emoji on a gradient tile (the server names the boost and picks its icon). */
export function BoostIcon({ b, size = 44 }: { b: EarnBoost; size?: number }) {
  const t = BOOST_TINT[b.id] ?? BOOST_TINT.rack;
  return <span className="boost-ic" style={{ width: size, height: size, fontSize: size * 0.5, background: `linear-gradient(150deg, ${t[0]}, ${t[1]})` }}>{b.icon}</span>;
}

/** Level pips: filled up to the current level. */
export function Pips({ level, max }: { level: number; max: number }) {
  return <span className="pips" aria-label={`Level ${level} of ${max}`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}</span>;
}
