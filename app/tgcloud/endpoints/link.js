import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { ensureUser } from '../lib/ledger.js';
import { fromHex } from '../lib/bytes.js';
import { verify } from '../lib/ed25519.js';
import { walletAddress, SUBWALLET } from '../lib/wallet.js';
import { NETWORK } from '../lib/config.js';
import { tickSafe } from '../lib/publisher.js';

// Stores "this wallet is mine" and checks it: the address must be the WalletTg of the given key, and the
// signature (by that key, for THIS Telegram account) must verify. Only verified wallets enter a published root.
export default async function (input, ctx) {
  const id = ctx.initData.user.id;
  const address = String(input?.address ?? '');
  const key = String(input?.public_key ?? '').toLowerCase();
  const sig = String(input?.signature ?? '').toLowerCase();
  if (!/^0:[0-9a-f]{64}$/.test(address) || !/^[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{128}$/.test(sig)) {
    throw new EndpointError('bad-request', { code: 'bad-request' });
  }
  const pk = fromHex(key);
  const derived = await walletAddress(pk, SUBWALLET[NETWORK]);
  const msg = new TextEncoder().encode(`egg-link:v1:${id}:${address}`);
  if (derived !== address || !(await verify(msg, fromHex(sig), pk))) throw new EndpointError('bad-proof', { code: 'bad-proof' });

  await ensureUser(id, Math.floor(Date.now() / 1000));
  const me = await db.select().from(users).where(eq(users.tgId, id)).get();
  if (me.verified && me.address && me.address !== address) {
    // one Telegram account = one wallet. It can be replaced only before it ever entered a published root.
    if (me.locked) throw new EndpointError('address-locked', { code: 'address-locked' });
    if (!input?.replace) throw new EndpointError('wallet-exists', { code: 'wallet-exists' });
  }
  const owner = await db.select().from(users).where(eq(users.address, address)).get();
  if (owner && owner.tgId !== id) throw new EndpointError('address-taken', { code: 'address-taken' });
  await db.update(users).set({ address, publicKey: key, linkSig: sig, verified: 1 }).where(eq(users.tgId, id)).run();
  await tickSafe();
  return { ok: true, address };
}
