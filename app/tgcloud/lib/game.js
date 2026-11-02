// One Hatch = one EGG (decimals 9). Amounts are BigInt strings outside the database.
export const REWARD_UNITS = 1000000000n;
export const DAILY_CAP = 100; // hatches per player per UTC day
export const HATCH_DATA = 'h';

export const total = (count) => (BigInt(count) * REWARD_UNITS).toString();

export function fmt(units) {
  const u = BigInt(units);
  const whole = u / 1000000000n;
  const frac = (u % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}
