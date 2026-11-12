import { battleReply, settleBattle } from '../lib/battle.js';
import { computeStats, daily, langs, recentEvents, topPosts } from '../lib/stats.js';

// Live project numbers for the explorer inside Telegram (the public site reads the on-chain beacon instead).
export default async function (input) {
  const now = Math.floor(Date.now() / 1000);
  await settleBattle(now).catch(() => null);
  const [stats, recent, days, top, lg, battle] = await Promise.all([computeStats(now), recentEvents(30), input?.days ? daily(now, 14) : null, topPosts(5), langs(), battleReply(now)]);
  return { stats, recent, days, top, langs: lg, battle };
}
