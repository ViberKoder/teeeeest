// The vault: where transfers to a @username wait until that person opens the wallet.
//
//   deposit  the sender sends TON / EGG to the vault with the comment "@username"  (an ordinary transfer, signed by the sender)
//   claim    the owner of that username (Telegram vouches for it, the platform verifies init data) opens the wallet
//            -> the vault pays the deposit out to THEIR verified wallet
//   refund   the sender can take an unclaimed deposit back after REFUND_AFTER
//
// Trust: the vault key lives in this bot's code, so whoever runs the bot could move the vault's funds. It holds only deposits in
// transit; everything else (the player's own wallet) stays self-custodial.
import { db } from 'sdk';
import { and, eq, inArray, lt, sql } from 'sdk/db';
import { payouts, state } from '../schema.js';
import { fromHex } from './bytes.js';
import { Builder } from './cell.js';
import { seqnoOf, sendBoc } from './chain.js';
import { fetch } from 'sdk';
import { FEE, JETTON_PAYOUT_VALUE, MINTER, NETWORK, REFUND_AFTER, VAULT, VAULT_JW } from './config.js';
import { VAULT_SEED } from './publisherkey.js';
import { externalSend, SUBWALLET } from './wallet.js';
import { toBase64 } from './bytes.js';

const TONAPI = NETWORK === 'testnet' ? 'https://testnet.tonapi.io/v2' : 'https://tonapi.io/v2';
const raw = (a) => (typeof a === 'string' ? a : a?.address ?? '');

/** Every deposit that reached the vault: [{ key, kind, amount, from, comment, time }] (newest first). */
export async function deposits() {
  const r = await fetch(`${TONAPI}/accounts/${VAULT}/events?limit=100`);
  if (!r.ok) throw new Error(`tonapi events ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const ev of j.events ?? []) {
    (ev.actions ?? []).forEach((a, i) => {
      if (a.status !== 'ok') return;
      if (a.type === 'TonTransfer' && a.TonTransfer && toRaw(a.TonTransfer.recipient) === VAULT && a.TonTransfer.comment) {
        out.push({ key: `${ev.event_id}:${i}`, kind: 'ton', amount: BigInt(a.TonTransfer.amount), from: toRaw(a.TonTransfer.sender), comment: a.TonTransfer.comment.trim(), time: ev.timestamp });
      } else if (a.type === 'JettonTransfer' && a.JettonTransfer && toRaw(a.JettonTransfer.recipient) === VAULT && a.JettonTransfer.comment && toRaw(a.JettonTransfer.jetton) === MINTER) {
        out.push({ key: `${ev.event_id}:${i}`, kind: 'egg', amount: BigInt(a.JettonTransfer.amount), from: toRaw(a.JettonTransfer.sender), comment: a.JettonTransfer.comment.trim(), time: ev.timestamp });
      }
    });
  }
  return out;
}
const toRaw = (x) => {
  const a = raw(x);
  return /^0:[0-9a-f]{64}$/.test(a) ? a : a; // tonapi returns raw form for `address`
};

const payoutOf = (d) => (d.kind === 'ton' ? d.amount - FEE : d.amount);
export const handleOf = (comment) => (/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(comment) ? comment.slice(1).toLowerCase() : null);

/** Deposits for `username` that were not paid out (or refunded) yet. */
export async function pendingFor(username) {
  const all = (await deposits()).filter((d) => handleOf(d.comment) === username);
  if (!all.length) return [];
  const done = await db.select().from(payouts).where(inArray(payouts.eventKey, all.map((d) => d.key))).all();
  const taken = new Set(done.map((p) => p.eventKey));
  return all.filter((d) => !taken.has(d.key) && payoutOf(d) > 0n);
}

/** Queues a payout for each pending deposit of `username`, to `toAddress`. Idempotent: a deposit is queued once, ever. */
export async function queueClaims(username, toAddress, now) {
  let queued = 0;
  for (const d of await pendingFor(username)) {
    const rows = await db.insert(payouts).values({ eventKey: d.key, kind: d.kind, amount: payoutOf(d).toString(), toAddress, reason: 'claim', createdAt: now }).onConflictDoNothing().returning().run();
    queued += rows.length;
  }
  return queued;
}

/** Sender takes back an unclaimed deposit after REFUND_AFTER. `me` is the caller's verified wallet address. */
export async function queueRefund(key, me, now) {
  const d = (await deposits()).find((x) => x.key === key);
  if (!d || d.from !== me) return 'not-yours';
  if (now - d.time < REFUND_AFTER) return 'too-early';
  if (payoutOf(d) <= 0n) return 'too-small';
  const rows = await db.insert(payouts).values({ eventKey: d.key, kind: d.kind, amount: payoutOf(d).toString(), toAddress: me, reason: 'refund', createdAt: now }).onConflictDoNothing().returning().run();
  return rows.length ? 'queued' : 'already-handled';
}

/** Deposits this wallet sent that nobody collected yet (for the refund button). */
export async function sentBy(me) {
  const mine = (await deposits()).filter((d) => d.from === me && handleOf(d.comment));
  if (!mine.length) return [];
  const done = await db.select().from(payouts).where(inArray(payouts.eventKey, mine.map((d) => d.key))).all();
  const taken = new Set(done.map((p) => p.eventKey));
  return mine.filter((d) => !taken.has(d.key)).map((d) => ({ key: d.key, kind: d.kind, amount: d.amount.toString(), to: d.comment, time: d.time }));
}

// ---- paying out: one signed request at a time, confirmed by the wallet's seqno -------------------------------------------
const LOCK = 2; // state row id used as the vault's lock
async function lock(now) {
  await db.insert(state).values({ id: LOCK }).onConflictDoNothing().run();
  const got = await db.update(state).set({ lockUntil: now + 60 }).where(and(eq(state.id, LOCK), lt(state.lockUntil, now))).returning().run();
  return got.length > 0;
}
const unlock = () => db.update(state).set({ lockUntil: 0 }).where(eq(state.id, LOCK)).run();

const commentBody = (text) => new Builder().uint(0, 32).bytes(new TextEncoder().encode(text)).build();
const jettonTransferBody = (amount, to, response) =>
  new Builder().uint(0x0f8a7ea5, 32).uint(0, 64).coins(amount).address(to).address(response).bit(0).coins(0).bit(0).build();

export async function tickVault(now) {
  const queued = await db.select().from(payouts).where(inArray(payouts.status, ['queued', 'sent'])).orderBy(payouts.id).all();
  if (!queued.length) return 'idle';
  if (!(await lock(now))) return 'busy';
  try {
    const seqno = await seqnoOf(VAULT);
    if (seqno === null) return 'vault-not-deployed';
    let inFlight = false;
    for (const p of queued) {
      if (p.status !== 'sent') continue;
      if (seqno > p.sentSeqno) await db.update(payouts).set({ status: 'done' }).where(eq(payouts.id, p.id)).run();
      else if (now - p.sentAt < 100) inFlight = true;
      else await db.update(payouts).set({ status: 'queued' }).where(eq(payouts.id, p.id)).run(); // not accepted: send again
    }
    if (inFlight) return 'waiting';
    const next = (await db.select().from(payouts).where(eq(payouts.status, 'queued')).orderBy(payouts.id).limit(1).all())[0];
    if (!next) return 'idle';
    const amount = BigInt(next.amount);
    const msg = next.kind === 'ton'
      ? { to: next.toAddress, value: amount, body: commentBody(next.reason === 'refund' ? 'refund' : 'EGG wallet'), bounce: false }
      : { to: VAULT_JW, value: JETTON_PAYOUT_VALUE, body: jettonTransferBody(amount, next.toAddress, VAULT), bounce: true };
    const boc = await externalSend({ wallet: VAULT, seed: fromHex(VAULT_SEED), subwalletId: SUBWALLET[NETWORK], seqno, validUntil: now + 240, ...msg });
    await sendBoc(toBase64(boc));
    await db.update(payouts).set({ status: 'sent', sentSeqno: seqno, sentAt: now }).where(eq(payouts.id, next.id)).run();
    return 'sent';
  } finally {
    await unlock();
  }
}
void sql;
