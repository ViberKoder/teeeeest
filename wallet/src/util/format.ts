/**
 * Tiny formatting helpers, kept dependency-free so they can be inlined in
 * onboarding screens before the rest of the app boots.
 */

export function formatBigUnits(nano: string | bigint, decimals: number, maxFractionDigits = 4): string {
  const n = typeof nano === 'bigint' ? nano : BigInt(nano || '0');
  if (decimals === 0) return n.toString();
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (frac === 0n) return `${negative ? '-' : ''}${whole.toString()}`;
  let fracStr = frac.toString().padStart(decimals, '0');
  if (maxFractionDigits < decimals) fracStr = fracStr.slice(0, maxFractionDigits);
  fracStr = fracStr.replace(/0+$/, '');
  return fracStr ? `${negative ? '-' : ''}${whole.toString()}.${fracStr}` : `${negative ? '-' : ''}${whole.toString()}`;
}

export function parseUnitsToNano(input: string, decimals: number): bigint {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return 0n;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid amount');
  }
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) {
    throw new Error(`Too many decimals (max ${decimals})`);
  }
  const padded = frac.padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

export function shortAddress(addr: string, head = 4, tail = 4): string {
  if (!addr) return '';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function timeAgo(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}
