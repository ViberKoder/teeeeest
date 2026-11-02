import { db } from 'sdk';
import { desc, eq } from 'sdk/db';
import { proofs, users } from '../schema.js';
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
  const e = address ? await db.select().from(proofs).where(eq(proofs.address, address)).orderBy(desc(proofs.epoch)).limit(1).get() : null;
  return {
    tg_id: id,
    address,
    ledger: total(await countOf(id)),
    entitlement: e ? { owner: e.address, epoch: e.epoch, cumulative: e.cumulative, proof: e.proof, commitment: e.commitment } : null,
    address_locked: Boolean(u.locked),
    banned: false,
    sponsored_left: 0,
  };
}
