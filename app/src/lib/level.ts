/** Player levels, from the egg to the golden hen. `units` is everything the player has earned (EGG in base units). */
export const LEVELS = [
  { min: 0, name: 'Egg', icon: '🥚' },
  { min: 10, name: 'Chick', icon: '🐣' },
  { min: 100, name: 'Fledgling', icon: '🐥' },
  { min: 1000, name: 'Rooster', icon: '🐓' },
  { min: 10000, name: 'Golden hen', icon: '🐔' },
] as const;

export function levelOf(units: bigint, decimals = 9) {
  const egg = Number(units / 10n ** BigInt(decimals - 3)) / 1000;
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (egg >= LEVELS[k].min) i = k;
  const cur = LEVELS[i], next = LEVELS[i + 1] ?? null;
  return { i, cur, next, progress: next ? Math.min(1, (egg - cur.min) / (next.min - cur.min)) : 1, toNext: next ? Math.max(0, next.min - egg) : 0 };
}
