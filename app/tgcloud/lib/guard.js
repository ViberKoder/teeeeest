import { EndpointError } from 'sdk';
import { OP_KEY } from './opkey.js';

/** Operator-only endpoints are called from the operator's machine through `tgcloud run`; they need the operator key. */
export function requireOp(input) {
  const k = String(input?.key ?? '');
  let diff = k.length ^ OP_KEY.length;
  for (let i = 0; i < OP_KEY.length; i++) diff |= (k.charCodeAt(i) || 0) ^ OP_KEY.charCodeAt(i);
  if (diff !== 0) throw new EndpointError('forbidden', { code: 'forbidden' });
}
