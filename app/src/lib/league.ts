/** Leagues by the EGG a player holds: from an egg to a golden goose. Colours are the league's own accent. */
export interface League { id: number; name: string; min: bigint; emoji: string; from: string; to: string }
const E = (n: number) => BigInt(n) * 1_000_000_000n;
export const LEAGUES: League[] = [
  { id: 0, name: 'Egg', min: 0n, emoji: '🥚', from: '#f4ead6', to: '#d9c7a4' },
  { id: 1, name: 'Hatchling', min: E(100), emoji: '🐣', from: '#ffe9a8', to: '#f4b73a' },
  { id: 2, name: 'Chick', min: E(1_000), emoji: '🐥', from: '#fff08a', to: '#f2b415' },
  { id: 3, name: 'Pullet', min: E(5_000), emoji: '🐤', from: '#ffd36b', to: '#ee8a1c' },
  { id: 4, name: 'Hen', min: E(25_000), emoji: '🐔', from: '#ffb27a', to: '#e8582c' },
  { id: 5, name: 'Rooster', min: E(100_000), emoji: '🐓', from: '#ff8a7a', to: '#d6322a' },
  { id: 6, name: 'Golden Goose', min: E(500_000), emoji: '🪿', from: '#ffe27a', to: '#d99a00' },
];

export function leagueOf(units: bigint) {
  let i = 0;
  for (let k = 0; k < LEAGUES.length; k++) if (units >= LEAGUES[k].min) i = k;
  const cur = LEAGUES[i];
  const next = LEAGUES[i + 1] ?? null;
  const progress = next ? Number(((units - cur.min) * 1000n) / (next.min - cur.min)) / 1000 : 1;
  return { cur, next, progress: Math.max(0, Math.min(1, progress)) };
}

/** A friendly name for a player we only know by @username or the last digits of the id. */
export const playerName = (p: { username: string | null; tag: string }) => (p.username ? `@${p.username}` : `Player ···${p.tag}`);
export const initialOf = (p: { username: string | null; tag: string }) => (p.username ? p.username[0].toUpperCase() : '#');
const HUES = [24, 48, 140, 168, 200, 262, 320, 350];
export const hueOf = (seed: string) => HUES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export const compact = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(n).toLocaleString('en');
};
