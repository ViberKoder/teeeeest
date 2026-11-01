import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
});
export const Send = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 17L17 7M9 7h8v8" /></svg>);
export const Receive = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M17 7L7 17M15 17H7V9" /></svg>);
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
