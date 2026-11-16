import { db, EndpointError } from 'sdk';
import { eq, sql } from 'sdk/db';
import { users } from '../schema.js';
import { BOT_USERNAME } from '../lib/config.js';
import { activeFriends, RACK, rackLevel } from '../lib/boosts.js';
import { ensureUser, setReferrer } from '../lib/ledger.js';

/** Friends: the players this account invited (by link, or by being the sender of the first egg they hatched), what each earned, and what they earned for you. */
export default async function (input, ctx) {
  const me = ctx.initData.user.id;
  const now = Math.floor(Date.now() / 1000);
  await ensureUser(me, now, ctx.initData.user.language_code, ctx.initData.user.first_name);

  if (input?.action === 'ref') {
    // opening t.me/<bot>?startapp=ref_<id>: the inviter is set once, and only for someone who has earned nothing yet
    const id = Number(input.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new EndpointError('bad-id', { code: 'bad-id' });
    return { ok: await setReferrer(me, id, now) };
  }

  const rows = await db.all(sql`SELECT u.tg_id AS id, u.name AS name, u.username AS username, u.lang AS lang, u.created_at AS since,
      CAST(COALESCE((SELECT SUM(l.amount) FROM ledger l WHERE l.tg_id = u.tg_id), 0) AS TEXT) AS eggs,
      CAST(COALESCE((SELECT SUM(l.amount) FROM ledger l WHERE l.tg_id = ${me} AND l.kind = 'ref' AND l.src = u.tg_id), 0) AS TEXT) AS forMe
    FROM users u WHERE u.referrer = ${me} ORDER BY CAST(eggs AS INTEGER) DESC, u.tg_id LIMIT 100`);
  const total = await db.get(sql`SELECT COUNT(*) AS n FROM users WHERE referrer = ${tgId(me)}`);
  const fromFriends = await db.get(sql`SELECT CAST(COALESCE(SUM(amount), 0) AS TEXT) AS s FROM ledger WHERE tg_id = ${me} AND kind = 'ref'`);
  const mine = await db.select().from(users).where(eq(users.tgId, me)).get();
  const inviter = mine.referrer ? await db.get(sql`SELECT name, username FROM users WHERE tg_id = ${mine.referrer}`) : null;
  const active = await activeFriends(me);
  return {
    link: `https://t.me/${BOT_USERNAME}?startapp=ref_${me}`,
    count: Number(total?.n ?? 0), active,
    earnedFromFriends: String(fromFriends?.s ?? '0'),
    rack: { level: rackLevel(active), step: RACK.step, bonus: RACK.bonus },
    invitedBy: inviter ? { name: inviter.name ?? inviter.username ?? 'a friend' } : null,
    friends: rows.map((r, i) => ({ rank: i + 1, id: Number(r.id), name: r.name ?? r.username ?? `Player ${String(r.id).slice(-4)}`, username: r.username ?? null, lang: r.lang ?? null, since: Number(r.since), eggs: String(r.eggs), forMe: String(r.forMe) })),
  };
}
const tgId = (x) => x;
