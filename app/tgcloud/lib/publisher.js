// Publishes the ledger on-chain from inside Telegram's runtime, as a small state machine driven by activity
// (each tap on Hatch and each wallet open advances it; there is no scheduler and no sleeping).
//
//   idle ──(ledger changed, interval passed)──▶ sent ──(root visible on-chain)──▶ proofs stored ──▶ idle
//
// Only players whose wallet link was verified (ed25519 signature of that wallet's key) enter a tree.
import { db } from 'sdk';
import { and, eq, lt, sql } from 'sdk/db';
import { proofs, state } from '../schema.js';
import { fromHex, hex, toBase64 } from './bytes.js';
import { toBoc } from './cell.js';
import { lastEpoch, rootOf, seqnoOf, sendBoc } from './chain.js';
import { MIN_INTERVAL, MINTER, PUBLISH_VALUE, PUBLISHER, RESEND_AFTER, NETWORK } from './config.js';
import { PUBLISHER_SEED } from './publisherkey.js';
import { buildTree, proofCell, publishRootBody } from './tree.js';
import { externalSend, SUBWALLET } from './wallet.js';
import { REWARD_UNITS } from './game.js';

const LOCK_SECONDS = 90;

async function row() {
  await db.insert(state).values({ id: 1 }).onConflictDoNothing().run();
  return db.select().from(state).where(eq(state.id, 1)).get();
}

async function lock(now) {
  const got = await db.update(state).set({ lockUntil: now + LOCK_SECONDS }).where(and(eq(state.id, 1), lt(state.lockUntil, now))).returning().run();
  return got.length > 0;
}
const unlock = () => db.update(state).set({ lockUntil: 0 }).where(eq(state.id, 1)).run();

async function ledgerLeaves() {
  const rows = await db.all(sql`SELECT u.address AS address, COUNT(h.id) AS n FROM users u JOIN hatches h ON h.tg_id = u.tg_id WHERE u.verified = 1 AND u.address IS NOT NULL GROUP BY u.tg_id`);
  return rows.map((r) => ({ owner: r.address, cumulative: BigInt(r.n) * REWARD_UNITS }));
}

async function storeProofs(epoch, commitment, leaves) {
  const tree = await buildTree(leaves);
  const rows = [];
  for (const l of tree.leaves) {
    rows.push({ epoch, address: l.owner, cumulative: l.cumulative.toString(), proof: toBase64(await toBoc(proofCell(tree, l.owner))), commitment });
  }
  for (let i = 0; i < rows.length; i += 20) await db.insert(proofs).values(rows.slice(i, i + 20)).onConflictDoNothing().run();
}

/** Advances the machine one step. Safe to call from anywhere, any number of times. */
export async function tick(now) {
  if (MINTER.endsWith('0'.repeat(32))) return 'not-configured';
  const s = await row();
  if (s.lockUntil >= now || !(await lock(now))) return 'busy';
  try {
    // 1. something in flight: is it on-chain yet?
    if (s.pendingEpoch) {
      const onChain = await rootOf(MINTER, s.pendingEpoch);
      if (onChain === s.pendingCommitment) {
        await storeProofs(s.pendingEpoch, s.pendingCommitment, JSON.parse(s.pendingLeaves).map((l) => ({ owner: l.o, cumulative: BigInt(l.c) })));
        await db.update(state).set({ pendingEpoch: 0, pendingCommitment: '', pendingLeaves: '', lastCommitment: s.pendingCommitment }).where(eq(state.id, 1)).run();
        return 'confirmed';
      }
      if (onChain) { // the chain holds a different root for this epoch: stop and let a human look
        await db.update(state).set({ pendingEpoch: 0, pendingCommitment: '', pendingLeaves: '' }).where(eq(state.id, 1)).run();
        return 'conflict';
      }
      if (now - s.sentAt < RESEND_AFTER) return 'waiting';
    }

    // 2. anything new to publish?
    if (!s.pendingEpoch && now - s.lastPublishAt < MIN_INTERVAL) return 'too-soon';
    const leaves = s.pendingEpoch ? JSON.parse(s.pendingLeaves).map((l) => ({ owner: l.o, cumulative: BigInt(l.c) })) : await ledgerLeaves();
    if (!leaves.length) return 'idle';
    const tree = await buildTree(leaves);
    const commitment = hex(tree.commitment);
    if (!s.pendingEpoch && commitment === s.lastCommitment) return 'idle';

    // 3. send the root
    const epoch = s.pendingEpoch || (await lastEpoch(MINTER)) + 1;
    const seqno = await seqnoOf(PUBLISHER);
    if (seqno === null) return 'publisher-not-deployed';
    const boc = await externalSend({
      wallet: PUBLISHER, seed: fromHex(PUBLISHER_SEED), subwalletId: SUBWALLET[NETWORK], seqno, validUntil: now + 240,
      to: MINTER, value: PUBLISH_VALUE, body: publishRootBody(epoch, tree.treeRoot, tree.total),
    });
    await sendBoc(toBase64(boc));
    await db.update(state).set({
      pendingEpoch: epoch, pendingCommitment: commitment, sentAt: now, lastPublishAt: now,
      pendingLeaves: JSON.stringify(tree.leaves.map((l) => ({ o: l.owner, c: l.cumulative.toString() }))),
    }).where(eq(state.id, 1)).run();
    return 'sent';
  } finally {
    await unlock();
  }
}

export async function tickSafe() {
  try {
    return await tick(Math.floor(Date.now() / 1000));
  } catch (e) {
    console.warn('publisher tick failed', String(e?.message ?? e));
    return 'error';
  }
}
