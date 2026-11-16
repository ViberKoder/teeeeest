import type { SVGProps } from 'react';
import { SWAP_PATHS } from './glyphs';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
});
export const Send = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 17L17 7M9 7h8v8" /></svg>);
export const Receive = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M17 7L7 17M15 17H7V9" /></svg>);
/** Telegram's own swap glyph (two opposite arrows), filled */
export const Swap = (p: SVGProps<SVGSVGElement>) => (<svg width={22} height={22} viewBox="0 0 18 18" fill="currentColor" {...p}>{SWAP_PATHS.map((d, i) => <path key={i} d={d} />)}</svg>);
export const Sparkle = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></svg>);
export const Gear = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>);
export const Copy = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="3" /><path d="M5 15V6a2 2 0 012-2h9" /></svg>);
export const Check = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const Lock = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="5" y="11" width="14" height="9" rx="3" /><path d="M8 11V8a4 4 0 118 0v3" /></svg>);
export const Back = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>);
export const Backspace = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M20 5H9l-6 7 6 7h11a1 1 0 001-1V6a1 1 0 00-1-1zM17 9l-5 6M12 9l5 6" /></svg>);
export const Link = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>);
export const Key = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></svg>);
export const Trash = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>);
export const External = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>);

export const Bolt = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" /></svg>);
export const Users = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20c.4-3.4 3-5.4 6.2-5.4s5.8 2 6.2 5.4" /><path d="M16 4.8a3.2 3.2 0 010 6.2M18.4 14.9c1.6.7 2.6 2.2 2.8 4.1" /></svg>);
export const ShieldIc = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3l7.5 2.8v5.6c0 4.6-3.1 8.1-7.5 9.9-4.4-1.8-7.5-5.3-7.5-9.9V5.8z" /><path d="M8.6 12l2.4 2.4 4.4-4.6" /></svg>);
export const Globe = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" /></svg>);
export const Trophy = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4.5c0 3 1.4 4.6 3.6 5M16 6h3.5c0 3-1.4 4.6-3.6 5M12 13v4M8.5 20h7M10 17h4" /></svg>);
export const Calendar = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
export const Fire = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-2.6 1.6-4.2 2.8-5.6.8-.9 1.3-2 1.2-3.4 2.9 1.2 4.4 3.6 4.4 5.4 1-.5 1.6-1.4 1.8-2.6C18.8 10.5 18.5 12.5 18.5 15c0 3.4-2.6 6-6.5 6z" /></svg>);
export const Qr = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><path d="M14 14h2.5v2.5M20.5 14v.1M14 20.5h.1M17 20.5h3.5v-2.5" /></svg>);
export const Share = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5v5.5a2.5 2.5 0 002.5 2.5h9a2.5 2.5 0 002.5-2.5v-5.5" /></svg>);
export const Close = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Plus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const Chevron = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 5l7 7-7 7" /></svg>);
export const Clock = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></svg>);
export const Gift = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3.5" y="8.5" width="17" height="4" rx="1.5" /><path d="M12 8.5V21M5 12.5V19a2 2 0 002 2h10a2 2 0 002-2v-6.5M8.5 8.5C6 8.5 6 4 9 4c2 0 3 4.5 3 4.5S13 4 15 4c3 0 3 4.5.5 4.5" /></svg>);
export const Wallet = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 7.5A2.5 2.5 0 016.5 5H18a2 2 0 012 2v1.5M4 7.5V17a2.5 2.5 0 002.5 2.5H18a2 2 0 002-2V11a2 2 0 00-2-2H6.5A2.5 2.5 0 014 6.5" /><circle cx="16" cy="14" r="1.1" fill="currentColor" /></svg>);
export const Star = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3.5l2.6 5.4 5.9.8-4.300 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z" /></svg>);
export const Info = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.7v.1" /></svg>);
export const Crown = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 18.5L3 7.5l5 4 4-6.5 4 6.5 5-4-1 11z" /><path d="M4.5 21h15" /></svg>);
/** the egg as a line icon (tab bar) */
export const EggLine = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3c3.9 0 6.7 5.6 6.7 10 0 3.8-2.9 6.8-6.7 6.8S5.300 16.8 5.300 13C5.300 8.6 8.1 3 12 3z" /><path d="M9.200 9.8c.4-1.5 1.200-2.7 2.200-3.4" /></svg>);
export const Scan = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16" /></svg>);
export const Paste = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="6" y="5" width="12" height="16" rx="3" /><path d="M9.5 5V4a1 1 0 011-1h3a1 1 0 011 1v1M9.5 11h5M9.5 15h5" /></svg>);
