// Project numbers for the explorer: computed from the ledger, the users and the posts (all exact, all public).
import { db } from 'sdk';
import { desc, sql } from 'sdk/db';
import { roots } from '../schema.js';

const one = async (q) => (await db.get(q)) ?? {};

export async function computeStats(now) {
  const day = now - (now % 86400);
  const u = await one(sql`SELECT COUNT(*) AS users, SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS wallets, SUM(CASE WHEN created_at >= ${day} THEN 1 ELSE 0 END) AS newToday, MAX(created_at) AS lastUser FROM users`);
  const l = await one(sql`SELECT CAST(COALESCE(SUM(amount),0) AS TEXT) AS promised, COUNT(*) AS events, MAX(ts) AS lastEvent FROM ledger`);
  const t = await one(sql`SELECT CAST(COALESCE(SUM(amount),0) AS TEXT) AS today, COUNT(*) AS n FROM ledger WHERE ts >= ${day}`);
  const h = await one(sql`SELECT COUNT(*) AS n FROM ledger WHERE ts >= ${now - 3600} AND kind IN ('post','inline')`);
  const p = await one(sql`SELECT COUNT(*) AS posts, COALESCE(SUM(views),0) AS views, COALESCE(SUM(hatches),0) AS hatches FROM posts`);
  const e = await one(sql`SELECT COUNT(*) AS eggs, COALESCE(SUM(hatched),0) AS hatched FROM eggs`);
  const r = await db.select().from(roots).orderBy(desc(roots.seq)).limit(1).get();
  return {
    t: now,
    users: Number(u.users ?? 0), wallets: Number(u.wallets ?? 0), newUsersToday: Number(u.newToday ?? 0), lastUserAt: Number(u.lastUser ?? 0),
    promised: l.promised ?? '0', events: Number(l.events ?? 0), lastEventAt: Number(l.lastEvent ?? 0),
    today: t.today ?? '0', eventsToday: Number(t.n ?? 0), hatchesLastHour: Number(h.n ?? 0),
    posts: Number(p.posts ?? 0), views: Number(p.views ?? 0), postHatches: Number(p.hatches ?? 0),
    eggs: Number(e.eggs ?? 0), eggHatches: Number(e.hatched ?? 0),
    root: r ? { seq: r.seq, treeRoot: r.treeRoot, total: r.total, signature: r.signature, at: r.createdAt } : null,
  };
}

/** The latest events, newest first, for the live feed (no names: Telegram ids are shown shortened). */
export async function recentEvents(limit = 30) {
  const rows = await db.all(sql`SELECT kind, amount, ts, tg_id FROM ledger ORDER BY id DESC LIMIT ${limit}`);
  return rows.map((r) => ({ kind: r.kind, amount: String(r.amount), t: Number(r.ts), who: `…${String(r.tg_id).slice(-3)}` }));
}

/** Players per day and EGG per day for the last `days` days (for the charts). */
export async function daily(now, days = 14) {
  const from = now - (now % 86400) - (days - 1) * 86400;
  const e = await db.all(sql`SELECT (ts / 86400) AS d, CAST(SUM(amount) AS TEXT) AS egg, COUNT(*) AS n FROM ledger WHERE ts >= ${from} GROUP BY d ORDER BY d`);
  const u = await db.all(sql`SELECT (created_at / 86400) AS d, COUNT(*) AS n FROM users WHERE created_at >= ${from} GROUP BY d ORDER BY d`);
  return { egg: e.map((r) => ({ d: Number(r.d) * 86400, egg: r.egg, n: Number(r.n) })), users: u.map((r) => ({ d: Number(r.d) * 86400, n: Number(r.n) })) };
}
