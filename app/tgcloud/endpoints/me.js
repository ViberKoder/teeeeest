import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { entitlementFor } from '../lib/snapshot.js';
import { countOf, ensureUser } from '../lib/ledger.js';
import { total } from '../lib/game.js';

export default async function (_input, ctx) {
  const id = ctx.initData.user.id;
  await ensureUser(id, Math.floor(Date.now() / 1000));
  const uname = (ctx.initData.user.username ?? '').toLowerCase();
  let u = await db.select().from(users).where(eq(users.tgId, id)).get();
  if (uname && u.username !== uname) await db.update(users).set({ username: uname }).where(eq(users.tgId, id)).run();
  // an address counts only once its signature was verified: an older, unsigned link makes the wallet sign again
  const address = u.verified ? u.address : null;
  const e = address ? await entitlementFor(address, Math.floor(Date.now() / 1000)).catch(() => null) : null;
  return {
    tg_id: id,
    address,
    ledger: total(await countOf(id)),
    entitlement: e,
    address_locked: Boolean(u.locked),
    banned: false,
    sponsored_left: 0,
  };
}
