import { computeStats, daily, recentEvents } from '../lib/stats.js';
import { refreshViews } from '../lib/posts.js';

// Live project numbers for the explorer inside Telegram (the public site reads the on-chain beacon instead).
export default async function (input) {
  const now = Math.floor(Date.now() / 1000);
  await refreshViews(now).catch(() => undefined);
  const [stats, recent, days] = await Promise.all([computeStats(now), recentEvents(30), input?.days ? daily(now, 14) : null]);
  return { stats, recent, days };
}
