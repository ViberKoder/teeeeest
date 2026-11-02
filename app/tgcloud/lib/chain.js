import { fetch } from 'sdk';
import { TONCENTER } from './config.js';
import { TONCENTER_KEY } from './publisherkey.js';

async function post(method, body) {
  const r = await fetch(`${TONCENTER}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': TONCENTER_KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) throw new Error(`toncenter ${method}: ${r.status} ${j?.error ?? ''}`);
  return j.result;
}

// Getters go through tonapi.io and sending through toncenter: two providers, so neither free rate limit is hit
// (the runtime has no timers to wait with).
const TONAPI = TONCENTER.includes('testnet') ? 'https://testnet.tonapi.io/v2' : 'https://tonapi.io/v2';

/** Runs a getter; null when the contract answers with an error (unknown epoch, not deployed…). */
async function get(address, method, args = []) {
  const q = args.length ? `?${args.map((a) => `args=${a}`).join('&')}` : '';
  const r = await fetch(`${TONAPI}/blockchain/accounts/${address}/methods/${method}${q}`);
  if (r.status === 429 || r.status >= 500) throw new Error(`tonapi ${method}: ${r.status}`);
  const j = await r.json().catch(() => null);
  return j && j.exit_code === 0 ? j.stack : null;
}
const num = (x) => BigInt(x.num);

export async function lastEpoch(minter) {
  const s = await get(minter, 'get_last_epoch');
  if (!s) throw new Error('minter is not reachable');
  return Number(num(s[0]));
}

export async function rootOf(minter, epoch) {
  const s = await get(minter, 'get_root', [String(epoch)]);
  return s ? num(s[0]).toString(16).padStart(64, '0') : null;
}

export async function seqnoOf(wallet) {
  const s = await get(wallet, 'seqno');
  return s ? Number(num(s[0])) : null;
}

export async function sendBoc(base64) {
  await post('sendBoc', { boc: base64 });
}
