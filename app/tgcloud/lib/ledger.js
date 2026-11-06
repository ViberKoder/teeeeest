// The ledger. Every credit is one row with a unique `ref`, so a retried update can never pay twice, and caps are checked
// against what is already in the ledger. Amounts are jetton units (1 EGG = 1e9) and are read back as exact strings.
import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { ledger, users } from '../schema.js';
import { EGG } from './config.js';
import { getSettings } from './settings.js';

export async function ensureUser(tgId, now) {
  await db.insert(users).values({ tgId, createdAt: now }).onConflictDoNothing().run();
}

const dayStart = (now) => now - (now % 86400);

/** Exact balance (string) of everything ever promised to a player. */
export async function balanceOf(tgId) {
  const r = await db.get(sql`SELECT CAST(COALESCE(SUM(amount), 0) AS TEXT) AS s FROM ledger WHERE tg_id = ${tgId}`);
  return r?.s ?? '0';
}

/**
 * Credits `amount` to `tgId` once per `ref`. Returns 'ok' | 'again' (this event was already paid) | 'cap' (daily cap reached) | 'banned'.
 * The player's referrer, if any, gets REFERRAL_PERCENT on top (it does not count against anyone's cap).
 */
export async function credit({ tgId, amount, kind, ref, now }) {
  const S = await getSettings();
  await ensureUser(tgId, now);
  if (await db.get(sql`SELECT 1 AS x FROM ledger WHERE ref = ${ref}`)) return 'again';
  if ((await db.get(sql`SELECT banned AS b FROM users WHERE tg_id = ${tgId}`))?.b) return 'banned';
  // one statement: the cap can not be overrun by two taps arriving at the same moment
  await db.run(sql`INSERT OR IGNORE INTO ledger (tg_id, amount, kind, ref, ts)
    SELECT ${tgId}, ${Number(amount)}, ${kind}, ${ref}, ${now}
    WHERE (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE tg_id = ${tgId} AND ts >= ${dayStart(now)} AND kind != 'ref') + ${Number(amount)} <= ${Number(S.dailyCap)}`);
  if (!(await db.get(sql`SELECT 1 AS x FROM ledger WHERE ref = ${ref}`))) return 'cap';
  const u = await db.select().from(users).where(eq(users.tgId, tgId)).get();
  if (u?.referrer && u.referrer !== tgId) {
    const bonus = (amount * S.referralPct) / 100n;
    if (bonus > 0n) await db.insert(ledger).values({ tgId: u.referrer, amount: Number(bonus), kind: 'ref', ref: `ref:${ref}`, ts: now }).onConflictDoNothing().run();
  }
  return 'ok';
}

/** Sets who invited a player — once, never yourself, only for someone who has not earned anything yet. */
export async function setReferrer(tgId, referrer, now) {
  if (!referrer || referrer === tgId) return false;
  await ensureUser(tgId, now);
  const u = await db.select().from(users).where(eq(users.tgId, tgId)).get();
  if (u.referrer) return false;
  if (BigInt(await balanceOf(tgId)) > 0n) return false;
  await db.update(users).set({ referrer }).where(eq(users.tgId, tgId)).run();
  return true;
}

export const fmtEgg = (units) => {
  const u = BigInt(units);
  const whole = u / EGG;
  const frac = (u % EGG).toString().padStart(9, '0').replace(/0+$/, '').slice(0, 2);
  return frac ? `${whole}.${frac}` : `${whole}`;
};
