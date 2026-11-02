import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { sentBy } from '../lib/vault.js';
import { REFUND_AFTER } from '../lib/config.js';

// Transfers this wallet sent to a @username that nobody collected yet (so the sender can see them and, later, take them back).
export default async function (_input, ctx) {
  const me = await db.select().from(users).where(eq(users.tgId, ctx.initData.user.id)).get();
  if (!me?.verified || !me.address) return { items: [], refundAfter: REFUND_AFTER };
  return { items: await sentBy(me.address), refundAfter: REFUND_AFTER };
}
