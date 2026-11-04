// The public stats beacon: at most every BEACON_EVERY seconds (and only when something changed) the bot's own wallet sends itself
// a comment "egg-stats:v1 {…}". Anyone (hatch.tg) reads it from the chain: it is timestamped, can not be edited afterwards, and only
// the bot's key can write it. It also names the newest signed root, which ties the numbers to what the token contract enforces.
import { db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { state } from '../schema.js';
import { fromHex, hex, sha256, toBase64 } from './bytes.js';
import { Builder } from './cell.js';
import { seqnoOf, sendBoc } from './chain.js';
import { BEACON_EVERY, NETWORK, VAULT } from './config.js';
import { VAULT_SEED } from './publisherkey.js';
import { computeStats } from './stats.js';
import { externalSend, SUBWALLET } from './wallet.js';

const ROW = 3;

/** A text comment as a snake of cells (a comment can be longer than one cell). */
export function commentCell(text) {
  const bytes = new TextEncoder().encode(text);
  const chunks = [];
  chunks.push(bytes.slice(0, 123)); // the first cell also holds the 32-bit zero opcode
  for (let i = 123; i < bytes.length; i += 127) chunks.push(bytes.slice(i, i + 127));
  let next = null;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const b = new Builder();
    if (i === 0) b.uint(0, 32);
    b.bytes(chunks[i]);
    if (next) b.ref(next);
    next = b.build();
  }
  return next;
}

export async function maybeBeacon(now) {
  try {
    await db.insert(state).values({ id: ROW }).onConflictDoNothing().run();
    const s = await db.select().from(state).where(eq(state.id, ROW)).get();
    if (now - s.lastPublishAt < BEACON_EVERY) return 'too-soon';
    const st = await computeStats(now);
    const body = { v: 1, t: now, u: st.users, w: st.wallets, p: st.promised, e: st.events, po: st.posts, vi: st.views, eg: st.eggs, r: st.root ? [st.root.seq, st.root.total, st.root.treeRoot, st.root.signature] : null };
    const json = JSON.stringify(body);
    const h = hex(await sha256(new TextEncoder().encode(JSON.stringify({ ...body, t: 0 }))));
    if (h === s.lastCommitment) return 'unchanged';
    const got = await db.update(state).set({ lastPublishAt: now, lastCommitment: h }).where(and(eq(state.id, ROW), lt(state.lastPublishAt, now - BEACON_EVERY + 1))).returning().run();
    if (!got.length) return 'busy';
    const seqno = await seqnoOf(VAULT);
    if (seqno === null) return 'no-wallet';
    const boc = await externalSend({ wallet: VAULT, seed: fromHex(VAULT_SEED), subwalletId: SUBWALLET[NETWORK], seqno, validUntil: now + 240, to: VAULT, value: 1000000n, body: commentCell(`egg-stats:v1 ${json}`), bounce: false });
    await sendBoc(toBase64(boc));
    return 'sent';
  } catch (e) {
    console.warn('beacon', String(e?.message ?? e));
    return 'error';
  }
}
