import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { balanceOf } from '../lib/ledger.js';
import { entitlementFor } from '../lib/snapshot.js';

// Internal data for one wallet or @username, to compare with the chain: what the ledger owes it and the signed root that proves it.
export default async function (input) {
  const q = String(input?.q ?? '').trim();
  let u = null;
  if (/^0:[0-9a-f]{64}$/.test(q)) u = await db.select().from(users).where(eq(users.address, q)).get();
  else if (/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(q)) u = await db.select().from(users).where(eq(users.username, q.replace(/^@/, '').toLowerCase())).get();
  else throw new EndpointError('bad-query', { code: 'bad-query' });
  if (!u) return { found: false };
  const address = u.verified ? u.address : null;
  return {
    found: true,
    address,
    ledger: await balanceOf(u.tgId),
    since: u.createdAt,
    entitlement: address ? await entitlementFor(address, Math.floor(Date.now() / 1000)).catch(() => null) : null,
  };
}
