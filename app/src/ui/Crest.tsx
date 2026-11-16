import { hueOf } from '../lib/league';
import { EggCoin } from './EggCoin';

/** A squad's emblem: a rounded shield in the squad's own colour (from its name), its initials, a little egg on the corner. */
export function Crest({ name, size = 56, egg = true }: { name: string; size?: number; egg?: boolean }) {
  const h = hueOf(name);
  const ini = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  return (
    <span className="crest" style={{ width: size, height: size, fontSize: size * 0.38, ['--h' as string]: h }}>
      <span className="crest-in">{ini}</span>
      {egg && <span className="crest-egg"><EggCoin size={size * 0.42} tone="gold" /></span>}
    </span>
  );
}
