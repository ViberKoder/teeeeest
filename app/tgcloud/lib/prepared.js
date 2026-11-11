// Wallets prepared for people who have not opened the wallet yet.
//
// A Telegram @username maps to a wallet address WITHOUT any stored secret: the key is derived from a master secret and the
// username (HMAC-SHA256). Anyone can send to that address like to any other. When the owner of the username first opens the
// wallet, the bot (which can derive the key) moves the wallet to a key generated on THEIR device (WalletTg supports key
// rotation, the address stays). From then on the bot's derived key is worthless: the wallet is theirs alone.
import { db, EndpointError } from 'sdk';
import { and, eq, gte } from 'sdk/db';
import { prepared } from '../schema.js';
import { fromHex, hex, toBase64 } from './bytes.js';
import { balanceOf, publicKeyOf, seqnoOf, sendBoc } from './chain.js';
import { NETWORK } from './config.js';
import { publicKeyOf as pubOf, verify } from './ed25519.js';
import { PREP_MASTER } from './publisherkey.js';
import { changeKeyExternal, rotationProof, SUBWALLET, stateInit, walletAddress } from './wallet.js';
import { fundWallet } from './funder.js';

export const USERNAME = /^[a-z][a-z0-9_]{4,31}$/;
const FUND_MIN = 20000000n; // the wallet needs ~0.02 TON of its own to accept the key change
const RETRY_AFTER = 90;

async function seedFor(username) {
  const key = await crypto.subtle.importKey('raw', fromHex(PREP_MASTER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`egg-wallet:v1:${NETWORK}:${username}`)));
}

export async function preparedWallet(username) {
  const seed = await seedFor(username);
  const publicKey = await pubOf(seed);
  return { seed, publicKey, address: await walletAddress(publicKey, SUBWALLET[NETWORK]) };
}

/** Records that this username has a prepared wallet (so its owner can adopt it) and returns its address. */
export const ISSUE_PER_USER_PER_DAY = 30;
export const ISSUE_PER_DAY = 5000;

export async function issue(username, now, by = 0) {
  const w = await preparedWallet(username);
  if (!(await db.select().from(prepared).where(eq(prepared.username, username)).get())) {
    // the table only grows when a signed-in user asks, a few times a day each (and within a global daily budget)
    const day = now - (now % 86400);
    if (!by) throw new EndpointError('sign-in', { code: 'sign-in' });
    if ((await db.$count(prepared, and(eq(prepared.issuedBy, by), gte(prepared.issuedAt, day)))) >= ISSUE_PER_USER_PER_DAY) throw new EndpointError('slow-down', { code: 'slow-down' });
    if ((await db.$count(prepared, gte(prepared.issuedAt, day))) >= ISSUE_PER_DAY) throw new EndpointError('busy', { code: 'busy' });
    await db.insert(prepared).values({ username, address: w.address, issuedAt: now, issuedBy: by }).onConflictDoNothing().run();
  }
  return w.address;
}

/**
 * One step of handing the wallet over. Safe to call repeatedly (the app polls it):
 *   funding -> the wallet had no TON of its own, some was sent;  sent -> the key change was sent;  done -> the wallet answers to `newPublicKey`.
 */
export async function adoptStep({ username, tgId, newPublicKey, rotationSignature, now }) {
  const row = await db.select().from(prepared).where(eq(prepared.username, username)).get();
  if (!row) return { status: 'none' };
  if (row.adoptedBy && row.adoptedBy !== tgId) return { status: 'taken' };
  const w = await preparedWallet(username);
  const newHex = hex(newPublicKey);
  const current = await publicKeyOf(row.address);
  if (current === newHex) {
    if (!row.adoptedBy) await db.update(prepared).set({ adoptedBy: tgId }).where(eq(prepared.username, username)).run();
    return { status: 'done', address: row.address };
  }
  if (current !== null && current !== hex(w.publicKey)) return { status: 'taken' }; // someone else's key: never touch it

  // the new key must prove it is held by whoever asks (checked here too, so a bad request never costs a transaction)
  if (!(await verify(await rotationProof(row.address).hash(), rotationSignature, newPublicKey))) return { status: 'bad-proof' };

  if ((await balanceOf(row.address)) < FUND_MIN) {
    if (now - row.fundedAt < RETRY_AFTER) return { status: 'funding' };
    await db.update(prepared).set({ fundedAt: now }).where(eq(prepared.username, username)).run();
    await fundWallet(row.address, now);
    return { status: 'funding' };
  }
  if (now - row.sentAt < RETRY_AFTER) return { status: 'sent' };
  const seqno = current === null ? 0 : await seqnoOf(row.address);
  const boc = await changeKeyExternal({
    wallet: row.address, seed: w.seed, subwalletId: SUBWALLET[NETWORK], seqno, validUntil: now + 240,
    newPublicKey, rotationSignature, init: current === null ? stateInit(w.publicKey, SUBWALLET[NETWORK]) : null,
  });
  await sendBoc(toBase64(boc));
  await db.update(prepared).set({ sentAt: now }).where(eq(prepared.username, username)).run();
  return { status: 'sent' };
}
