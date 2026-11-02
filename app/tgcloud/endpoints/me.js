import { db } from 'sdk';
import { desc, eq } from 'sdk/db';
import { proofs, users } from '../schema.js';
import { countOf, ensureUser } from '../lib/ledger.js';
import { total } from '../lib/game.js';

export default async function (_input, ctx) {
  const id = ctx.initData.user.id;
  await ensureUser(id, Math.floor(Date.now() / 1000));
  const u = await db.select().from(users).where(eq(users.tgId, id)).get();
  const e = u.address ? await db.select().from(proofs).where(eq(proofs.address, u.address)).orderBy(desc(proofs.epoch)).limit(1).get() : null;
  return {
    tg_id: id,
    address: u.address ?? null,
    ledger: total(await countOf(id)),
    entitlement: e ? { owner: e.address, epoch: e.epoch, cumulative: e.cumulative, proof: e.proof, commitment: e.commitment } : null,
    address_locked: false,
    banned: false,
    sponsored_left: 0,
  };
}
