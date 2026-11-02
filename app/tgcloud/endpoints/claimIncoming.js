import { db, EndpointError } from 'sdk';
import { and, eq, ne } from 'sdk/db';
import { payouts, users } from '../schema.js';
import { queueClaims, tickVault } from '../lib/vault.js';
import { ensureUser } from '../lib/ledger.js';

// The owner of a @username opens the wallet: whatever was sent to that username is paid out to THEIR verified wallet.
export default async function (_input, ctx) {
  const u = ctx.initData.user;
  const now = Math.floor(Date.now() / 1000);
  await ensureUser(u.id, now);
  const username = (u.username ?? '').toLowerCase();
  const me = await db.select().from(users).where(eq(users.tgId, u.id)).get();
  if (username && me.username !== username) await db.update(users).set({ username }).where(eq(users.tgId, u.id)).run();
  if (!username || !me.verified || !me.address) return { incoming: [], username: username || null };
  try {
    await queueClaims(username, me.address, now);
    await tickVault(now);
  } catch (e) {
    console.warn('claimIncoming', String(e?.message ?? e));
  }
  const open = await db.select().from(payouts).where(and(eq(payouts.toAddress, me.address), eq(payouts.reason, 'claim'), ne(payouts.status, 'done'))).all();
  return { username, incoming: open.map((p) => ({ kind: p.kind, amount: p.amount, status: p.status })) };
}
void EndpointError;
