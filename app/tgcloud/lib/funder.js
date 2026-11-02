// Sends a little TON from the bot's own wallet (the "vault") so a prepared wallet can pay for its first request.
import { db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { state } from '../schema.js';
import { fromHex, toBase64 } from './bytes.js';
import { seqnoOf, sendBoc } from './chain.js';
import { NETWORK, VAULT } from './config.js';
import { VAULT_SEED } from './publisherkey.js';
import { externalSend, SUBWALLET } from './wallet.js';

const FUND_AMOUNT = 30000000n; // 0.03 TON
const LOCK = 2;

export async function fundWallet(to, now) {
  await db.insert(state).values({ id: LOCK }).onConflictDoNothing().run();
  const got = await db.update(state).set({ lockUntil: now + 30 }).where(and(eq(state.id, LOCK), lt(state.lockUntil, now))).returning().run();
  if (!got.length) return false;
  try {
    const seqno = await seqnoOf(VAULT);
    if (seqno === null) return false;
    const boc = await externalSend({ wallet: VAULT, seed: fromHex(VAULT_SEED), subwalletId: SUBWALLET[NETWORK], seqno, validUntil: now + 240, to, value: FUND_AMOUNT, body: null, bounce: false });
    await sendBoc(toBase64(boc));
    return true;
  } finally {
    await db.update(state).set({ lockUntil: 0 }).where(eq(state.id, LOCK)).run();
  }
}
