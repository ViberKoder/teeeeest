// Squads: teams players create inside the app. A squad's weekly score is the EGG its members earned (hatching, eggs, eggs of theirs
// hatched) WHILE they were in it: every ledger row remembers the squad at that moment, so switching squads late can not steal a win.
// The three best squads pay EGG to every member who earned something for them that week (settled lazily, once, like the channel battles).
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { settings } from '../schema.js';
import { weekEnd, weekOf } from './battle.js';
import { getSettings } from './settings.js';

export const SCORED = `('post', 'inline', 'sender')`;
export const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,22}[\p{L}\p{N}]$/u;
export const LINK = /^https:\/\/t\.me\/[A-Za-z0-9_+\/-]{3,64}$/;
export const COOLDOWN = 86400;
export const MAX_MEMBERS = 5000;
export const CREATE_PER_DAY = 300;

const weekStart = (week) => week * 604800 + 4 * 86400;

/** The squads of one week, best first (only squads that still have members). */
export async function squadBoard(week, limit = 20) {
  const a = weekStart(week), b = weekEnd(week);
  const rows = await db.all(sql`SELECT s.id AS id, s.name AS name, s.link AS link,
      (SELECT COUNT(*) FROM users u WHERE u.squad = s.id) AS members,
      CAST(COALESCE((SELECT SUM(l.amount) FROM ledger l WHERE l.squad = s.id AND l.ts >= ${a} AND l.ts < ${b} AND l.kind IN ('post', 'inline', 'sender')), 0) AS TEXT) AS score
    FROM squads s WHERE (SELECT COUNT(*) FROM users u WHERE u.squad = s.id) > 0
    ORDER BY CAST(score AS INTEGER) DESC, members DESC, s.id LIMIT ${limit}`);
  return rows.map((r, i) => ({ rank: i + 1, id: Number(r.id), name: r.name, link: r.link || null, members: Number(r.members), score: String(r.score) }));
}

export async function squadOf(id, week) {
  if (!id) return null;
  const s = await db.get(sql`SELECT id, name, link, owner_id AS owner FROM squads WHERE id = ${id}`);
  if (!s) return null;
  const a = weekStart(week), b = weekEnd(week);
  const m = await db.get(sql`SELECT COUNT(*) AS n FROM users WHERE squad = ${id}`);
  const sc = await db.get(sql`SELECT CAST(COALESCE(SUM(amount), 0) AS TEXT) AS s FROM ledger WHERE squad = ${id} AND ts >= ${a} AND ts < ${b} AND kind IN ('post', 'inline', 'sender')`);
  const rank = (await squadBoard(week, 200)).find((r) => r.id === Number(id))?.rank ?? null;
  return { id: Number(s.id), name: s.name, link: s.link || null, owner: Number(s.owner), members: Number(m?.n ?? 0), score: String(sc?.s ?? '0'), rank };
}

/** Pays the finished week once. */
export async function settleSquads(now) {
  const prev = weekOf(now) - 1;
  const got = await db.insert(settings).values({ key: `squad:${prev}`, value: String(now), updatedAt: now }).onConflictDoNothing().returning().run();
  if (!got.length) return null;
  const S = await getSettings();
  const top = (await squadBoard(prev, 3)).filter((s) => BigInt(s.score) > 0n);
  const a = weekStart(prev), b = weekEnd(prev);
  for (let i = 0; i < top.length; i++) {
    const prize = S.squadPrize[i];
    if (prize <= 0n) continue;
    await db.run(sql`INSERT OR IGNORE INTO ledger (tg_id, amount, kind, ref, ts, squad)
      SELECT DISTINCT l.tg_id, ${Number(prize)}, 'battle', 'squad:' || ${prev} || ':' || ${top[i].id} || ':' || l.tg_id, ${now}, 0
      FROM ledger l JOIN users u ON u.tg_id = l.tg_id
      WHERE l.squad = ${top[i].id} AND l.ts >= ${a} AND l.ts < ${b} AND l.kind IN ('post', 'inline', 'sender') AND u.banned = 0`);
  }
  return top;
}
