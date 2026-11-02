import { db } from 'sdk';
import { eq } from 'sdk/db';
import { prepared, users } from '../schema.js';

// Has someone sent me something before I ever opened the wallet? Then a wallet is waiting for me.
export default async function (_input, ctx) {
  const u = ctx.initData.user;
  const username = (u.username ?? '').toLowerCase();
  if (!username) return { address: null };
  const me = await db.select().from(users).where(eq(users.tgId, u.id)).get();
  if (me?.verified && me.address) return { address: null };
  const row = await db.select().from(prepared).where(eq(prepared.username, username)).get();
  return { address: row && (!row.adoptedBy || row.adoptedBy === u.id) ? row.address : null };
}
