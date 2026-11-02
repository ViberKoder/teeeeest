import { db } from 'sdk';
import { proofs, state } from '../schema.js';
import { requireOp } from '../lib/guard.js';

// One-off: forget proofs and publisher state that belong to a previous token contract.
export default async function (input) {
  requireOp(input);
  await db.delete(proofs).run();
  await db.delete(state).run();
  return { ok: true };
}
