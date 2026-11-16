import { useId } from 'react';

/** A chick for the spots that want warmth: friends, rewards, empty states. `hatching` puts it in half an eggshell. */
export function Chick({ size = 96, hatching = false, wave = false }: { size?: number; hatching?: boolean; wave?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`chick ${wave ? 'wave' : ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={`y${id}`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#fff3a6" />
          <stop offset="0.55" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#f2a516" />
        </radialGradient>
        <radialGradient id={`e${id}`} cx="35%" cy="25%" r="90%">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="0.6" stopColor="#f1e8d6" />
          <stop offset="1" stopColor="#d7c3a0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="93" rx="30" ry="4.5" fill="#10301e" opacity="0.18" />
      <g className="chick-body">
        <path d="M50 74C34 74 22 63 22 49C22 33 34 22 50 22C66 22 78 33 78 49C78 63 66 74 50 74Z" fill={`url(#y${id})`} />
        <path d="M44 22C44 15 47 11 50 11C53 11 53 16 50 20C54 14 58 14 58 18C58 21 54 23 50 23Z" fill="#f2a516" />
        <g className="wing"><path d="M24 50C16 48 12 54 14 60C20 64 28 62 30 56Z" fill="#f4b11c" /></g>
        <path d="M76 50C84 48 88 54 86 60C80 64 72 62 70 56Z" fill="#f4b11c" />
        <ellipse cx="38" cy="45" rx="4.2" ry="5" fill="#2a1a05" /><ellipse cx="62" cy="45" rx="4.2" ry="5" fill="#2a1a05" />
        <circle cx="39.4" cy="43.2" r="1.5" fill="#fff" /><circle cx="63.4" cy="43.2" r="1.5" fill="#fff" />
        <path d="M44 52L50 60L56 52Z" fill="#ff8a3d" /><path d="M44 52L50 55L56 52Z" fill="#ffae6b" />
        <ellipse cx="31" cy="55" rx="4.5" ry="3" fill="#ff9a7a" opacity="0.45" /><ellipse cx="69" cy="55" rx="4.5" ry="3" fill="#ff9a7a" opacity="0.45" />
      </g>
      {hatching && (
        <g>
          <path d="M18 66L30 58L38 70L50 58L62 70L70 58L82 66C82 82 68 92 50 92C32 92 18 82 18 66Z" fill={`url(#e${id})`} />
          <path d="M18 66L30 58L38 70L50 58L62 70L70 58L82 66" fill="none" stroke="#c9b48f" strokeWidth="1.6" strokeLinejoin="round" opacity="0.8" />
        </g>
      )}
    </svg>
  );
}
