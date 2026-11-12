// Channel battles (the squads idea of Notcoin): every Hatch under a channel post scores a point for that channel in the current week.
// The three best channels win EGG for everyone who hatched in them that week. Settled lazily: the first activity after the week ends
// pays the previous week out, exactly once (a settings row is the lock; every payout row has a unique `ref`).
import { api, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { chatHits, settings, users } from '../schema.js';
import { fmtEgg } from './ledger.js';
import { getSettings } from './settings.js';
import { esc, quietly } from './telegram.js';

/** Monday-based week index (the Unix epoch was a Thursday). */
export const weekOf = (now) => Math.floor((now - 4 * 86400) / 604800);
export const weekEnd = (week) => (week + 1) * 604800 + 4 * 86400;

export async function recordHit({ chatId, tgId, now }) {
  await db.insert(chatHits).values({ week: weekOf(now), chatId, tgId, ts: now }).onConflictDoNothing().run();
  await db.update(users).set({ team: chatId }).where(eq(users.tgId, tgId)).run();
}

/** The channels of one week, best first. */
export async function board(week, limit = 10) {
  const rows = await db.all(sql`SELECT h.chat_id AS chat, COUNT(*) AS score, COUNT(DISTINCT h.tg_id) AS players, c.title AS title, c.username AS username
    FROM chat_hits h LEFT JOIN chats c ON c.chat_id = h.chat_id WHERE h.week = ${week}
    GROUP BY h.chat_id ORDER BY score DESC, players DESC, h.chat_id LIMIT ${limit}`);
  return rows.map((r, i) => ({ rank: i + 1, chatId: Number(r.chat), title: r.title ?? r.username ?? `Channel ${String(r.chat).slice(-4)}`, username: r.username ?? null, score: Number(r.score), players: Number(r.players) }));
}

export async function battleReply(now) {
  const week = weekOf(now);
  return { week, endsAt: weekEnd(week), board: await board(week, 10) };
}

/** Pays the finished week once. Safe to call on every activity. */
export async function settleBattle(now) {
  const prev = weekOf(now) - 1;
  const got = await db.insert(settings).values({ key: `battle:${prev}`, value: String(now), updatedAt: now }).onConflictDoNothing().returning().run();
  if (!got.length) return null;
  const S = await getSettings();
  const top = await board(prev, 3);
  const lines = [];
  for (let i = 0; i < top.length; i++) {
    const prize = S.battlePrize[i];
    if (prize > 0n) {
      await db.run(sql`INSERT OR IGNORE INTO ledger (tg_id, amount, kind, ref, ts)
        SELECT DISTINCT h.tg_id, ${Number(prize)}, 'battle', 'battle:' || ${prev} || ':' || h.chat_id || ':' || h.tg_id, ${now}
        FROM chat_hits h JOIN users u ON u.tg_id = h.tg_id WHERE h.week = ${prev} AND h.chat_id = ${top[i].chatId} AND u.banned = 0`);
    }
    lines.push(`${['🥇', '🥈', '🥉'][i]} <b>${esc(top[i].title)}</b> · ${top[i].score} hatches · ${top[i].players} players · +${fmtEgg(prize)} EGG each`);
  }
  for (const t of top) {
    await quietly(api.sendMessage({ chat_id: t.chatId, parse_mode: 'HTML', text: `🏆 <b>Channel battle: last week’s results</b>\n\n${lines.join('\n')}\n\nA new week has started: hatch under the post every day!` }));
  }
  return top;
}
