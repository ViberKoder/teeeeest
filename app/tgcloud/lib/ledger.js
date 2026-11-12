// The ledger. Every credit is one row with a unique `ref`, so a retried update can never pay twice, and caps are checked
// against what is already in the ledger. Amounts are jetton units (1 EGG = 1e9) and are read back as exact strings.
import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { users } from '../schema.js';
import { EGG } from './config.js';
import { getSettings } from './settings.js';

export async function ensureUser(tgId, now, lang) {
  await db.insert(users).values({ tgId, createdAt: now, lang: lang ?? null }).onConflictDoNothing().run();
  if (lang) await db.run(sql`UPDATE users SET lang = ${String(lang).slice(0, 8).toLowerCase()} WHERE tg_id = ${tgId} AND (lang IS NULL OR lang != ${String(lang).slice(0, 8).toLowerCase()})`);
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
    WHERE (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE tg_id = ${tgId} AND ts >= ${dayStart(now)} AND kind NOT IN ('ref', 'battle')) + ${Number(amount)} <= ${Number(S.dailyCap)}`);
  if (!(await db.get(sql`SELECT 1 AS x FROM ledger WHERE ref = ${ref}`))) return 'cap';
  const u = await db.select().from(users).where(eq(users.tgId, tgId)).get();
  if (u?.referrer && u.referrer !== tgId) {
    const bonus = (amount * S.referralPct) / 100n;
    if (bonus > 0n) await creditRef({ tgId: u.referrer, amount: bonus, ref: `ref:${ref}`, now });
  }
  return 'ok';
}

/** A referral-type credit (share of an invited player's earnings, or the chain bonus): once per `ref`, at most one daily cap a day. */
export async function creditRef({ tgId, amount, ref, now }) {
  const S = await getSettings();
  if (amount <= 0n || (await db.get(sql`SELECT banned AS b FROM users WHERE tg_id = ${tgId}`))?.b) return false;
  await db.run(sql`INSERT OR IGNORE INTO ledger (tg_id, amount, kind, ref, ts)
    SELECT ${tgId}, ${Number(amount)}, 'ref', ${ref}, ${now}
    WHERE (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE tg_id = ${tgId} AND ts >= ${dayStart(now)} AND kind = 'ref') + ${Number(amount)} <= ${Number(S.dailyCap)}`);
  return Boolean(await db.get(sql`SELECT 1 AS x FROM ledger WHERE ref = ${ref}`));
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
