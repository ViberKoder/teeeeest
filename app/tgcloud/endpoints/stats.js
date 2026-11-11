import { computeStats, daily, recentEvents, topPosts } from '../lib/stats.js';

// Live project numbers for the explorer inside Telegram (the public site reads the on-chain beacon instead).
export default async function (input) {
  const now = Math.floor(Date.now() / 1000);
  const [stats, recent, days, top] = await Promise.all([computeStats(now), recentEvents(30), input?.days ? daily(now, 14) : null, topPosts(5)]);
  return { stats, recent, days, top };
}
