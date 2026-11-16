// Boosts: percentages added to what a player earns from hatching (kinds post / inline / sender). Nothing here costs EGG and
// nothing is a balance: every boost is derived from rows that already exist (the daily check-ins in the ledger, the squad, the
// invited friends), so it can not drift. The daily cap in credit() still bounds everything a player can earn in a day.
import { db } from 'sdk';
import { sql } from 'sdk/db';

export const DAY = 86400;
export const BOOSTED = new Set(['post', 'inline', 'sender', 'widget']);

export const WARMUP = { pct: 100, secs: 3600 }; // once a day, free: x2 for one hour
export const STREAK = { perDay: 3, max: 30 }; // +3% per consecutive daily check-in, up to +30%
export const SQUAD = { pct: 10 }; // being in a squad
export const BROOD = { each: 5, max: 25 }; // +5% per invited friend who plays, up to +25%

/** Consecutive daily check-ins that end today or yesterday. */
export async function streakOf(tgId, now) {
  const rows = await db.all(sql`SELECT ref FROM ledger WHERE tg_id = ${tgId} AND kind = 'daily' ORDER BY ts DESC LIMIT 60`);
  const days = new Set(rows.map((r) => Number(String(r.ref).split(':')[1])).filter((n) => Number.isFinite(n)));
  const today = Math.floor(now / DAY);
  const claimedToday = days.has(today);
  let d = claimedToday ? today : today - 1;
  let streak = 0;
  while (days.has(d)) { streak++; d--; }
  return { streak, claimedToday, today };
}

/** The warm-up: when it was last switched on, and whether it is running now. */
export async function warmupOf(tgId, now) {
  const r = await db.get(sql`SELECT ts FROM ledger WHERE tg_id = ${tgId} AND kind = 'boost' ORDER BY ts DESC LIMIT 1`);
  const at = Number(r?.ts ?? 0);
  const today = Math.floor(now / DAY);
  return { at, activeUntil: at && now < at + WARMUP.secs ? at + WARMUP.secs : 0, usedToday: at ? Math.floor(at / DAY) === today : false, today };
}

export async function friendsPlaying(tgId) {
  const r = await db.get(sql`SELECT COUNT(*) AS n FROM users u WHERE u.referrer = ${tgId} AND EXISTS (SELECT 1 FROM ledger l WHERE l.tg_id = u.tg_id)`);
  return Number(r?.n ?? 0);
}

/** Every boost of a player with its current percentage. */
export async function boostsOf(tgId, now) {
  const [st, wu, sq, fr] = await Promise.all([
    streakOf(tgId, now),
    warmupOf(tgId, now),
    db.get(sql`SELECT squad FROM users WHERE tg_id = ${tgId}`),
    friendsPlaying(tgId),
  ]);
  const inSquad = Number(sq?.squad ?? 0) > 0;
  const parts = {
    warmup: wu.activeUntil ? WARMUP.pct : 0,
    streak: Math.min(STREAK.max, st.streak * STREAK.perDay),
    squad: inSquad ? SQUAD.pct : 0,
    brood: Math.min(BROOD.max, fr * BROOD.each),
  };
  return { st, wu, inSquad, friends: fr, parts, pct: parts.warmup + parts.streak + parts.squad + parts.brood };
}

/** Just the total percentage, for credit(). Never throws: a failing boost must not block a payout. */
export async function boostPct(tgId, now) {
  try {
    return (await boostsOf(tgId, now)).pct;
  } catch {
    return 0;
  }
}
