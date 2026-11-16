import { useId } from 'react';
import { CoinBadge } from './Gram';

export type EggTone = 'cream' | 'gold' | 'mint';

const TONES: Record<EggTone, { a: string; b: string; c: string; rim: string; spot: string }> = {
  cream: { a: '#fffdf8', b: '#f1e8d6', c: '#d7c3a0', rim: '#8fd19a', spot: '#b9825a' },
  gold: { a: '#fff3c4', b: '#ffd25c', c: '#e89a24', rim: '#ffe9a0', spot: '#a8611a' },
  mint: { a: '#f4fff3', b: '#cdeccf', c: '#8fc79a', rim: '#bff0c9', spot: '#4f8a63' },
};

/**
 * The small egg used in transaction lists, chips and rewards: the same warm shell, soft key light, glossy highlight and
 * green rim light as the big 3D egg, but drawn as layered gradients (no WebGL), so a hundred of them cost nothing.
 */
export function EggCoin({ size = 40, tone = 'cream', badge, spark = false, float = false }: { size?: number; tone?: EggTone; badge?: 'in' | 'out'; spark?: boolean; float?: boolean }) {
  const id = useId().replace(/:/g, '');
  const t = TONES[tone];
  const shell = 'M32 3C46 3 57.5 25 57.5 41.5C57.5 56.5 46.5 67 32 67C17.5 67 6.5 56.5 6.5 41.5C6.5 25 18 3 32 3Z';
  return (
    <span className={`coin egg-coin ${float ? 'float' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 72" aria-hidden style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`b${id}`} cx="36%" cy="26%" r="88%">
            <stop offset="0" stopColor={t.a} />
            <stop offset="0.52" stopColor={t.b} />
            <stop offset="1" stopColor={t.c} />
          </radialGradient>
          <radialGradient id={`s${id}`} cx="72%" cy="82%" r="60%">
            <stop offset="0" stopColor={t.c} stopOpacity="0.55" />
            <stop offset="1" stopColor={t.c} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`r${id}`} x1="0" y1="1" x2="0.8" y2="0.2">
            <stop offset="0" stopColor={t.rim} stopOpacity="0.95" />
            <stop offset="0.5" stopColor={t.rim} stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`h${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`c${id}`}><path d={shell} /></clipPath>
        </defs>
        <ellipse cx="32" cy="68.5" rx="21" ry="3.4" fill="#10301e" opacity="0.2" />
        <path d={shell} fill={`url(#b${id})`} />
        <g clipPath={`url(#c${id})`}>
          <rect width="64" height="72" fill={`url(#s${id})`} />
          <path d={shell} fill="none" stroke={`url(#r${id})`} strokeWidth="5" />
          <g fill={t.spot} opacity="0.34">
            <circle cx="40" cy="26" r="1.6" /><circle cx="48" cy="44" r="1.9" /><circle cx="22" cy="48" r="1.6" /><circle cx="35" cy="56" r="1.3" /><circle cx="17" cy="34" r="1.2" /><circle cx="44" cy="58" r="1.3" />
          </g>
        </g>
        <ellipse cx="22.5" cy="20" rx="6" ry="10" fill={`url(#h${id})`} transform="rotate(16 22.5 20)" />
        <circle cx="26" cy="11.5" r="1.7" fill="#fff" opacity="0.9" />
        {spark && (
          <g fill="#fff" className="egg-spark">
            <path d="M52 8l1.5 4 4 1.5-4 1.5L52 19l-1.5-4-4-1.5 4-1.5z" />
            <path d="M10 26l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" opacity="0.85" />
          </g>
        )}
      </svg>
      {badge && <CoinBadge dir={badge} size={size} />}
    </span>
  );
}
