import { db, EndpointError } from 'sdk';
import { eq, sql } from 'sdk/db';
import { squads, users } from '../schema.js';
import { weekEnd, weekOf } from '../lib/battle.js';
import { balanceOf, ensureUser, fmtEgg } from '../lib/ledger.js';
import { getSettings } from '../lib/settings.js';
import { COOLDOWN, CREATE_PER_DAY, LINK, MAX_MEMBERS, NAME, settleSquads, squadBoard, squadOf } from '../lib/squads.js';

/** Squads, from inside the app. The platform verifies Telegram's init data, so `ctx.initData.user.id` can not be forged. */
export default async function (input, ctx) {
  const me = ctx.initData.user.id;
  const now = Math.floor(Date.now() / 1000);
  const fail = (c) => { throw new EndpointError(c, { code: c }); };
  await ensureUser(me, now, ctx.initData.user.language_code);
  await settleSquads(now).catch(() => null);
  const u = await db.select().from(users).where(eq(users.tgId, me)).get();
  const cool = () => { if (u.squadAt && now - u.squadAt < COOLDOWN) fail('cooldown'); };
  const week = weekOf(now);

  switch (input?.action ?? 'state') {
    case 'create': {
      if (u.banned) fail('banned');
      if (u.squad) fail('leave-first');
      cool();
      const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
      if (!NAME.test(name)) fail('bad-name');
      const link = String(input.link ?? '').trim();
      if (link && !LINK.test(link)) fail('bad-link');
      if (BigInt(await balanceOf(me)) <= 0n) fail('hatch-first'); // a squad is for people who play
      const today = Number((await db.get(sql`SELECT COUNT(*) AS n FROM squads WHERE created_at >= ${now - (now % 86400)}`))?.n ?? 0);
      if (today >= CREATE_PER_DAY) fail('busy');
      const made = await db.insert(squads).values({ name, nameKey: name.toLowerCase(), ownerId: me, link, createdAt: now }).onConflictDoNothing().returning().run();
      if (!made.length) fail('name-taken');
      await db.update(users).set({ squad: made[0].id, squadAt: now }).where(eq(users.tgId, me)).run();
      break;
    }
    case 'join': {
      if (u.banned) fail('banned');
      const id = Number(input.id);
      if (!Number.isSafeInteger(id) || id <= 0) fail('bad-id');
      if (u.squad === id) break;
      cool();
      const s = await db.select().from(squads).where(eq(squads.id, id)).get();
      if (!s) fail('no-squad');
      const n = Number((await db.get(sql`SELECT COUNT(*) AS n FROM users WHERE squad = ${id}`))?.n ?? 0);
      if (n >= MAX_MEMBERS) fail('full');
      await db.update(users).set({ squad: id, squadAt: now }).where(eq(users.tgId, me)).run();
      break;
    }
    case 'leave': {
      if (!u.squad) break;
      cool();
      const old = u.squad;
      await db.update(users).set({ squad: 0, squadAt: now }).where(eq(users.tgId, me)).run();
      if (!Number((await db.get(sql`SELECT COUNT(*) AS n FROM users WHERE squad = ${old}`))?.n ?? 0)) await db.delete(squads).where(eq(squads.id, old)).run(); // an empty squad frees its name
      break;
    }
    case 'find': {
      const q = String(input.q ?? '').trim().toLowerCase().replace(/[%_]/g, '').slice(0, 24);
      if (q.length < 2) return { found: [] };
      const rows = await db.all(sql`SELECT s.id AS id, s.name AS name, (SELECT COUNT(*) FROM users x WHERE x.squad = s.id) AS members FROM squads s WHERE s.name_key LIKE ${`%${q}%`} ORDER BY members DESC LIMIT 8`);
      return { found: rows.filter((r) => Number(r.members) > 0).map((r) => ({ id: Number(r.id), name: r.name, members: Number(r.members) })) };
    }
    case 'info': {
      const id = Number(input.id);
      const s = await squadOf(id, week);
      return { squad: s && { id: s.id, name: s.name, members: s.members, link: s.link } };
    }
    case 'state': break;
    default: fail('unknown-action');
  }

  const S = await getSettings();
  const fresh = await db.select().from(users).where(eq(users.tgId, me)).get();
  return {
    me: await squadOf(fresh.squad, week),
    board: await squadBoard(week, 20),
    week, endsAt: weekEnd(week),
    nextChangeAt: fresh.squadAt ? fresh.squadAt + COOLDOWN : 0,
    prizes: S.squadPrize.map((p) => fmtEgg(p)),
  };
}
