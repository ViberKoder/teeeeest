import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { queueRefund, tickVault } from '../lib/vault.js';

export default async function (input, ctx) {
  const now = Math.floor(Date.now() / 1000);
  const me = await db.select().from(users).where(eq(users.tgId, ctx.initData.user.id)).get();
  if (!me?.verified || !me.address) throw new EndpointError('no-wallet', { code: 'no-wallet' });
  const r = await queueRefund(String(input?.key ?? ''), me.address, now);
  if (r !== 'queued' && r !== 'already-handled') throw new EndpointError(r, { code: r });
  await tickVault(now).catch(() => undefined);
  return { status: r };
}
