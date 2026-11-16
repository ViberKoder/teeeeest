import type { ReactNode } from 'react';

/**
 * A light 3D egg for lists and small spots: one SVG with a lit body, a soft terminator, a gloss and a few speckles (no WebGL, so a
 * list can hold dozens). `wobble` rocks it gently; `tone` tints the shell (gold for rewards).
 */
export function EggMini({ size = 32, wobble = false, tone = 'cream' }: { size?: number; wobble?: boolean; tone?: 'cream' | 'gold' }) {
  const gold = tone === 'gold';
  return (
    <svg className={`egg-mini ${wobble ? 'wobble' : ''}`} width={size * 0.8} height={size} viewBox="0 0 64 80" aria-hidden>
      <defs>
        <radialGradient id="em-body" cx="34%" cy="26%" r="88%">
          <stop offset="0" stopColor={gold ? '#fff6c8' : '#fffefa'} />
          <stop offset=".42" stopColor={gold ? '#ffe27a' : '#fbf2e0'} />
          <stop offset=".8" stopColor={gold ? '#e8a931' : '#e6d2ac'} />
          <stop offset="1" stopColor={gold ? '#b9740f' : '#c4aa7c'} />
        </radialGradient>
        <radialGradient id="em-shade" cx="82%" cy="88%" r="75%">
          <stop offset="0" stopColor="#6b4410" stopOpacity=".34" />
          <stop offset=".6" stopColor="#6b4410" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="em-gloss" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="75.5" rx="19" ry="3.6" fill="#0b2a19" opacity=".22" />
      <path d="M32 3C46 3 57 28 57 47c0 17-11.5 27-25 27S7 64 7 47C7 28 18 3 32 3Z" fill="url(#em-body)" />
      <path d="M32 3C46 3 57 28 57 47c0 17-11.5 27-25 27S7 64 7 47C7 28 18 3 32 3Z" fill="url(#em-shade)" />
      <ellipse cx="23" cy="27" rx="8" ry="15" fill="url(#em-gloss)" transform="rotate(18 23 27)" />
      <g fill="#a87a2e" opacity=".22">
        <circle cx="38" cy="38" r="1.6" /><circle cx="26" cy="52" r="1.3" /><circle cx="42" cy="56" r="1.7" /><circle cx="33" cy="24" r="1.1" />
      </g>
    </svg>
  );
}

/** An egg (or gem) on a soft disc, with the direction of the transfer as a small badge — the leading icon of a transaction. */
export function Coin({ children, badge, tone = 'egg' }: { children: ReactNode; badge?: 'in' | 'out' | 'spark'; tone?: 'egg' | 'gram' | 'plain' }) {
  return (
    <span className={`coin tone-${tone}`}>
      {children}
      {badge && (
        <span className={`coin-badge ${badge}`}>
          {badge === 'in' ? '↓' : badge === 'out' ? '↑' : '✦'}
        </span>
      )}
    </span>
  );
}
