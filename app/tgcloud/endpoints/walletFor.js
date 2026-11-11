import { db, EndpointError } from 'sdk';
import { and, eq, isNotNull } from 'sdk/db';
import { users } from '../schema.js';
import { issue, USERNAME } from '../lib/prepared.js';

// Where do I send EGG / TON for @username? Their own wallet if they already have one, otherwise the wallet prepared for them.
export default async function (input, ctx) {
  const username = String(input?.username ?? '').replace(/^@/, '').toLowerCase();
  if (!USERNAME.test(username)) throw new EndpointError('bad-username', { code: 'bad-username' });
  const known = await db.select().from(users).where(and(eq(users.username, username), eq(users.verified, 1), isNotNull(users.address))).get();
  if (known) return { username, address: known.address, ready: true };
  return { username, address: await issue(username, Math.floor(Date.now() / 1000), ctx?.initData?.user?.id ?? 0), ready: false };
}
