import { fromNano } from '@ton/core';

export function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatTon(nano: bigint): string {
  const s = fromNano(nano);
  const n = Number(s);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

export function formatJettonAmount(balanceNano: bigint, decimals: number): string {
  if (decimals <= 0) return balanceNano.toString();

  const base = 10n ** BigInt(decimals);
  const whole = balanceNano / base;
  const frac = balanceNano % base;
  if (frac === 0n) return whole.toLocaleString('en-US');

  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}.${fracStr}`;
}

export function parseJettonAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [wholePart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > decimals) return null;

  const base = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart || '0');
  const fracPadded = fracPart.padEnd(decimals, '0');
  const frac = fracPadded ? BigInt(fracPadded) : 0n;
  return whole * base + frac;
}
