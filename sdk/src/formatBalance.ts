/** Matches backend `PUBLIC_BALANCE_DISPLAY`. */
export type BalanceDisplayMode = 'jetton_nano' | 'integer';

/**
 * Format cumulative amounts for UI. Raw API values are always stored as jetton nano on the backend.
 *
 * - `integer`: show the numeric string as-is (game-style "1 tap = 1 point").
 * - `jetton_nano`: divide by 1e9; whole jettons without ".0", fractional part trimmed.
 */
export function formatBalanceDisplay(amountStr: string, mode: BalanceDisplayMode): string {
  const n = BigInt(amountStr || '0');
  if (mode === 'integer') return n.toString();

  const base = 1_000_000_000n;
  const whole = n / base;
  const frac = n % base;
  if (frac === 0n) return whole.toString();
  const fracTrimmed = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}.${fracTrimmed}`;
}
