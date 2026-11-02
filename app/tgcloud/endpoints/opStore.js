import { db } from 'sdk';
import { proofs } from '../schema.js';
import { requireOp } from '../lib/guard.js';

export default async function (input) {
  requireOp(input);
  const rows = (input.rows ?? []).map((r) => ({ epoch: input.epoch, address: r.address, cumulative: r.cumulative, proof: r.proof, commitment: input.commitment }));
  for (let i = 0; i < rows.length; i += 20) await db.insert(proofs).values(rows.slice(i, i + 20)).onConflictDoNothing().run();
  return { stored: rows.length };
}
