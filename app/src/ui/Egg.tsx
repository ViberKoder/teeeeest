import { useId } from 'react';

export type EggState = 'idle' | 'cracking' | 'hatched';

/**
 * The mascot. Two halves split along a zig-zag; on `hatched` the top shell pops off
 * and a chick shows up. Pure SVG + CSS, no assets.
 */
export function Egg({ size = 120, state = 'idle', float = false }: { size?: number; state?: EggState; float?: boolean }) {
  const id = useId().replace(/:/g, '');
  const shell = 'M60 6C88 6 108 52 108 82C108 108 87 126 60 126C33 126 12 108 12 82C12 52 32 6 60 6Z';
  const zig = 'M0 74L18 66L32 80L48 64L62 82L78 66L92 80L106 66L120 74';
  return (
    <svg className={`egg ${float ? 'float' : ''} ${state}`} width={size} height={size * 1.1} viewBox="0 0 120 132" aria-hidden>
      <defs>
        <radialGradient id={`s${id}`} cx="35%" cy="28%" r="85%">
          <stop offset="0" stopColor="var(--shell-1)" />
          <stop offset="0.55" stopColor="var(--shell-2)" />
          <stop offset="1" stopColor="var(--shell-3)" />
        </radialGradient>
        <clipPath id={`t${id}`}><path d={`${zig}L120 0L0 0Z`} /></clipPath>
        <clipPath id={`b${id}`}><path d={`${zig}L120 132L0 132Z`} /></clipPath>
      </defs>
      <ellipse cx="60" cy="128" rx="34" ry="4.5" fill="#000" opacity="0.22" />
      <g className="chick">
        <circle cx="60" cy="96" r="22" fill="#ffd34d" />
        <circle cx="52" cy="92" r="3" fill="#2a1a05" /><circle cx="68" cy="92" r="3" fill="#2a1a05" />
        <path d="M55 100L60 106L65 100Z" fill="#ff8a3d" />
        <path d="M56 74Q60 66 64 74" stroke="#ffd34d" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
      <g clipPath={`url(#b${id})`}>
        <path d={shell} fill={`url(#s${id})`} />
        <Speckles />
      </g>
      <g className="top-half" clipPath={`url(#t${id})`}>
        <path d={shell} fill={`url(#s${id})`} />
        <ellipse cx="42" cy="38" rx="9" ry="16" fill="#fff" opacity="0.5" transform="rotate(18 42 38)" />
        <Speckles />
      </g>
      {state !== 'idle' && <path d={zig} fill="none" stroke="#7a4a12" strokeWidth="2.4" strokeLinejoin="round" opacity="0.7" />}
    </svg>
  );
}

function Speckles() {
  return (
    <g fill="#b9742a" opacity="0.32">
      <circle cx="78" cy="48" r="2.2" /><circle cx="90" cy="86" r="2.6" /><circle cx="36" cy="96" r="2.2" />
      <circle cx="62" cy="110" r="1.8" /><circle cx="28" cy="70" r="1.6" /><circle cx="82" cy="104" r="1.8" />
    </g>
  );
}

/** Confetti-ish burst for celebration moments. */
export function Burst() {
  const dots = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 90 + (i % 3) * 22;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r - 30, c: ['#ffc247', '#ff8a3d', '#fff6e0', '#6be29a'][i % 4], d: (i % 5) * 40 };
  });
  return (
    <div className="burst" aria-hidden>
      {dots.map((d, i) => (
        <i key={i} style={{ ['--x' as string]: `${d.x}px`, ['--y' as string]: `${d.y}px`, background: d.c, animationDelay: `${d.d}ms` }} />
      ))}
    </div>
  );
}

/** Tiny flat egg for list rows. */
export function EggMark() {
  return (
    <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden>
      <path d="M11 1C16 1 19.5 9 19.5 14.5C19.5 19 15.7 22.5 11 22.5C6.3 22.5 2.5 19 2.5 14.5C2.5 9 6 1 11 1Z" fill="#fff6e0" />
      <ellipse cx="8" cy="8" rx="1.9" ry="3.2" fill="#fff" opacity=".7" transform="rotate(18 8 8)" />
    </svg>
  );
}

export function TonMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 6h14l-7 14z" /><path d="M12 6v14" />
    </svg>
  );
}
