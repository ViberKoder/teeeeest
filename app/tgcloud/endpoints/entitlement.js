import { db, EndpointError } from 'sdk';
import { entitlementFor } from '../lib/snapshot.js';

// The newest signed root and the proof for an address (public: the contract re-checks everything it contains).
export default async function (input) {
  const address = String(input?.address ?? '');
  if (!/^0:[0-9a-f]{64}$/.test(address)) throw new EndpointError('invalid-address', { code: 'invalid-address' });
  const e = await entitlementFor(address, Math.floor(Date.now() / 1000));
  if (!e) throw new EndpointError('no-entitlement', { code: 'no-entitlement' });
  return e;
}
void db;
