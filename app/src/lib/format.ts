/** Decimal string -> base units. Returns null for anything that is not a plain decimal. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) return null;
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

export function formatUnits(value: bigint, decimals: number, maxFrac = 2): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${grouped}${frac ? '.' + frac : ''}`;
}

export function shortAddr(a: string, head = 4, tail = 4): string {
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function timeAgo(unix: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - unix);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(unix * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** EGG (or Gram) in base units -> "2 500.5" */
export const units = (v: bigint | string, decimals = 9, maxFrac = 2) => formatUnits(BigInt(v), decimals, maxFrac);

export const clock = (unix: number) => new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "2d 4h" / "3h 12m" / "8m" until a Unix time */
export function untilText(unix: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(unix - now));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}
