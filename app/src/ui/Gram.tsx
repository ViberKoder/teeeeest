import { useId } from 'react';
import { GRAM_OUTER, GRAM_SPARK } from './glyphs';

/** The flat Gram diamond (the shape Telegram's wallet draws), one colour: for inline use next to numbers. */
export function GramGlyph({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 28 28" fill="currentColor" aria-hidden>
      <path d={`${GRAM_OUTER} ${GRAM_SPARK}`} />
    </svg>
  );
}

/** The coloured diamond: cyan-to-blue facets with the white four-point spark, as in the Telegram wallet card. */
export function GramGem({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 28 28" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#8be8ff" />
          <stop offset="0.5" stopColor="#1a9bff" />
          <stop offset="1" stopColor="#0057d9" />
        </linearGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}><path d={GRAM_OUTER} /></clipPath>
      </defs>
      <path d={GRAM_OUTER} fill={`url(#g${id})`} />
      <g clipPath={`url(#c${id})`}>
        <path d="M0 5.6H28V12H0Z" fill={`url(#t${id})`} opacity="0.7" />
        <path d="M4 12.8L14 22.6L24 12.8L14 12.8Z" fill="#003fa8" opacity="0.28" />
        <path d="M14 12.8L24 12.8L14 22.6Z" fill="#fff" opacity="0.1" />
      </g>
      <path d={GRAM_SPARK} fill="#fff" fillOpacity="0.96" />
    </svg>
  );
}

/** A round Gram coin for lists: Telegram-blue gradient, white diamond. */
export function GramCoin({ size = 40, badge }: { size?: number; badge?: 'in' | 'out' }) {
  return (
    <span className="coin gram" style={{ width: size, height: size }}>
      <GramGlyph size={size * 0.66} />
      {badge && <CoinBadge dir={badge} size={size} />}
    </span>
  );
}

/** The little in / out arrow on the corner of a coin. */
export function CoinBadge({ dir, size }: { dir: 'in' | 'out'; size: number }) {
  const s = Math.max(14, Math.round(size * 0.42));
  return (
    <span className={`coin-badge ${dir}`} style={{ width: s, height: s }}>
      <svg width={s * 0.62} height={s * 0.62} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'in' ? <path d="M3 3.5L8.5 9M8.5 4.5V9H4" /> : <path d="M3.5 8.5L9 3M4 3H9V8" />}
      </svg>
    </span>
  );
}
