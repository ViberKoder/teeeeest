// Boosts: permanent upgrades a player EARNS (nothing is spent: balances only ever grow, which is what keeps the signed roots honest).
//   Egg rack   — +5 eggs a day you can send, one level per 2 active friends (up to 5)
//   Golden nest — +10% daily earning limit, one level per 7 days of check-in streak (up to 5)
import { db } from 'sdk';
import { sql } from 'sdk/db';

export const RACK = { step: 2, max: 5, bonus: 5 };
export const NEST = { days: 7, max: 5, pct: 10 };
export const dayIndex = (now) => Math.floor(now / 86400);

/** Invited players who have earned something at least once (a friend who never plays does not count). */
export async function activeFriends(tgId) {
  const r = await db.get(sql`SELECT COUNT(*) AS n FROM users u WHERE u.referrer = ${tgId} AND EXISTS (SELECT 1 FROM ledger l WHERE l.tg_id = u.tg_id)`);
  return Number(r?.n ?? 0);
}
export const rackLevel = (friends) => Math.min(RACK.max, Math.floor(friends / RACK.step));
export const rackBonus = async (tgId) => rackLevel(await activeFriends(tgId)) * RACK.bonus;

/** The streak as it stands today: a missed day resets it. */
export const liveStreak = (u, now) => (u && u.streakDay >= dayIndex(now) - 1 ? u.streak : 0);
export const nestLevel = (streak) => Math.min(NEST.max, Math.floor(streak / NEST.days));
export async function nestPercent(tgId, now) {
  const u = await db.get(sql`SELECT streak, streak_day AS streakDay FROM users WHERE tg_id = ${tgId}`);
  return nestLevel(liveStreak(u, now)) * NEST.pct;
}
