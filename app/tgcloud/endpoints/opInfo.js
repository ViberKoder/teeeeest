import { api, db } from 'sdk';
import { hatches, proofs, users } from '../schema.js';
import { requireOp } from '../lib/guard.js';

export default async function (input) {
  requireOp(input);
  const me = await api.getMe();
  return { bot: me.username, users: await db.$count(users), hatches: await db.$count(hatches), proofs: await db.$count(proofs) };
}
