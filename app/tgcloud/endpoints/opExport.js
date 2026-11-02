import { db } from 'sdk';
import { isNotNull } from 'sdk/db';
import { hatches, users } from '../schema.js';
import { eq } from 'sdk/db';
import { requireOp } from '../lib/guard.js';

export default async function (input) {
  requireOp(input);
  const rows = await db.select().from(users).where(isNotNull(users.address)).all();
  const out = [];
  for (const u of rows) out.push({ tgId: u.tgId, address: u.address, publicKey: u.publicKey, sig: u.linkSig, verified: u.verified, locked: u.locked, hatches: await db.$count(hatches, eq(hatches.tgId, u.tgId)) });
  return { users: out, all: await db.$count(users) };
}
