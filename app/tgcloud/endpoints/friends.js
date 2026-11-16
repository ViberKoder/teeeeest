import { db } from 'sdk';
import { sql } from 'sdk/db';
import { ensureUser, balanceOf } from '../lib/ledger.js';
import { getSettings } from '../lib/settings.js';

/**
 * The players this account invited: who they are (their public @username, if they have one), how many EGG they hold and how much
 * of it came to the inviter as the referral share. Read-only. Telegram ids are not returned, only the last three digits.
 */
export default async function (_input, ctx) {
  const me = ctx.initData.user.id;
  const now = Math.floor(Date.now() / 1000);
  await ensureUser(me, now, ctx.initData.user.language_code);
  const S = await getSettings();

  const rows = await db.all(sql`SELECT u.tg_id AS id, u.username AS username, u.created_at AS joined, u.squad AS squad,
      CAST(COALESCE((SELECT SUM(l.amount) FROM ledger l WHERE l.tg_id = u.tg_id), 0) AS TEXT) AS balance,
      COALESCE((SELECT MAX(l.ts) FROM ledger l WHERE l.tg_id = u.tg_id), 0) AS last
    FROM users u WHERE u.referrer = ${me}
    ORDER BY COALESCE((SELECT SUM(l.amount) FROM ledger l WHERE l.tg_id = u.tg_id), 0) DESC, u.created_at LIMIT 100`);
  // what each friend's play brought the inviter: the referral row of an event has the ref "ref:" + the event's own ref
  const per = await db.all(sql`SELECT f.tg_id AS fid, CAST(SUM(r.amount) AS TEXT) AS s
    FROM ledger r JOIN ledger f ON r.ref = 'ref:' || f.ref
    WHERE r.tg_id = ${me} AND r.kind = 'ref' AND f.tg_id IN (SELECT tg_id FROM users WHERE referrer = ${me})
    GROUP BY f.tg_id`);
  const gave = new Map(per.map((r) => [Number(r.fid), String(r.s)]));
  const total = await db.get(sql`SELECT CAST(COALESCE(SUM(amount), 0) AS TEXT) AS s FROM ledger WHERE tg_id = ${me} AND kind = 'ref'`);
  const count = await db.get(sql`SELECT COUNT(*) AS n FROM users WHERE referrer = ${me}`);
  const inviter = await db.get(sql`SELECT i.username AS username FROM users u JOIN users i ON i.tg_id = u.referrer WHERE u.tg_id = ${me}`);

  return {
    pct: Number(S.referralPct),
    count: Number(count?.n ?? rows.length),
    earned: String(total?.s ?? '0'),
    balance: await balanceOf(me),
    invitedBy: inviter?.username ?? null,
    friends: rows.map((r) => ({
      tag: String(r.id).slice(-3),
      username: r.username || null,
      balance: String(r.balance),
      gave: gave.get(Number(r.id)) ?? '0',
      joined: Number(r.joined),
      last: Number(r.last),
      squad: Number(r.squad) > 0,
    })),
  };
}
