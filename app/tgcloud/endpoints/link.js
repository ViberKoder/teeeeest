import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { ensureUser } from '../lib/ledger.js';

// Stores the claim "this wallet is mine" with the wallet's signature. The operator verifies the signature
// (ed25519, plus address = WalletTg(public key)) before the address can enter a published root.
export default async function (input, ctx) {
  const id = ctx.initData.user.id;
  const address = String(input?.address ?? '');
  const key = String(input?.public_key ?? '');
  const sig = String(input?.signature ?? '');
  if (!/^0:[0-9a-f]{64}$/.test(address) || !/^[0-9a-f]{64}$/i.test(key) || !/^[0-9a-f]{128}$/i.test(sig)) {
    throw new EndpointError('bad-request', { code: 'bad-request' });
  }
  await ensureUser(id, Math.floor(Date.now() / 1000));
  const owner = await db.select().from(users).where(eq(users.address, address)).get();
  if (owner && owner.tgId !== id) throw new EndpointError('address-taken', { code: 'address-taken' });
  await db.update(users).set({ address, publicKey: key.toLowerCase(), linkSig: sig.toLowerCase() }).where(eq(users.tgId, id)).run();
  return { ok: true, address };
}
