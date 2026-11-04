import { db, EndpointError } from 'sdk';
import { and, eq, gte, sql } from 'sdk/db';
import { users } from '../schema.js';
import { balanceOf } from '../lib/ledger.js';
import { balanceOf as tonBalance } from '../lib/chain.js';
import { fundWallet } from '../lib/funder.js';
import { GAS_AMOUNT, GAS_DAILY_BUDGET, GAS_MIN_EARNED } from '../lib/config.js';

// A new player has no TON to pay for their first claim: the bot sends a little, once per Telegram account, only to someone who has
// actually earned EGG, and within a daily budget (so it can not be drained by fresh accounts).
export default async function (_input, ctx) {
  const id = ctx.initData.user.id;
  const now = Math.floor(Date.now() / 1000);
  const u = await db.select().from(users).where(eq(users.tgId, id)).get();
  if (!u?.verified || !u.address) throw new EndpointError('no-wallet', { code: 'no-wallet' });
  if (u.gasAt) throw new EndpointError('already-helped', { code: 'already-helped' });
  if (BigInt(await balanceOf(id)) < GAS_MIN_EARNED) throw new EndpointError('earn-first', { code: 'earn-first' });
  if ((await tonBalance(u.address)) >= GAS_AMOUNT) return { status: 'enough' };
  const day = now - (now % 86400);
  if ((await db.$count(users, and(gte(users.gasAt, day)))) >= GAS_DAILY_BUDGET) throw new EndpointError('budget', { code: 'budget' });
  const mine = await db.update(users).set({ gasAt: now }).where(and(eq(users.tgId, id), eq(users.gasAt, 0))).returning().run();
  if (!mine.length) throw new EndpointError('already-helped', { code: 'already-helped' });
  const sent = await fundWallet(u.address, now, GAS_AMOUNT).catch(() => false);
  if (!sent) {
    await db.update(users).set({ gasAt: 0 }).where(eq(users.tgId, id)).run(); // try again later
    throw new EndpointError('busy', { code: 'busy' });
  }
  return { status: 'sent' };
}
void sql;
