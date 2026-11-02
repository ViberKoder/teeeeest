import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { fromHex } from '../lib/bytes.js';
import { adoptStep } from '../lib/prepared.js';
import { ensureUser } from '../lib/ledger.js';

// First open of someone who was sent money by @username: hand the prepared wallet over to a key generated on their device.
// The app polls this until it answers "done".
export default async function (input, ctx) {
  const u = ctx.initData.user;
  const username = (u.username ?? '').toLowerCase();
  const key = String(input?.public_key ?? '').toLowerCase();
  const sig = String(input?.signature ?? '').toLowerCase();
  if (!username || !/^[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{128}$/.test(sig)) throw new EndpointError('bad-request', { code: 'bad-request' });
  const now = Math.floor(Date.now() / 1000);
  await ensureUser(u.id, now);
  const me = await db.select().from(users).where(eq(users.tgId, u.id)).get();
  if (me.username !== username) await db.update(users).set({ username }).where(eq(users.tgId, u.id)).run();
  if (me.verified && me.address) throw new EndpointError('has-wallet', { code: 'has-wallet' });
  return adoptStep({ username, tgId: u.id, newPublicKey: fromHex(key), rotationSignature: fromHex(sig), now });
}
