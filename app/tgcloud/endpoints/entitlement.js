import { db, EndpointError } from 'sdk';
import { desc, eq } from 'sdk/db';
import { proofs } from '../schema.js';

export default async function (input) {
  const address = String(input?.address ?? '');
  if (!/^0:[0-9a-f]{64}$/.test(address)) throw new EndpointError('invalid-address', { code: 'invalid-address' });
  const e = await db.select().from(proofs).where(eq(proofs.address, address)).orderBy(desc(proofs.epoch)).limit(1).get();
  if (!e) throw new EndpointError('no-entitlement', { code: 'no-entitlement' });
  return { owner: e.address, epoch: e.epoch, cumulative: e.cumulative, proof: e.proof, commitment: e.commitment };
}
