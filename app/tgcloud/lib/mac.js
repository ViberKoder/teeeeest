// Short MACs for callback data, so a modified client can not invent eggs (e.g. raise a multi egg's limit).
import { OP_KEY } from './opkey.js';

let key = null;
async function hmacKey() {
  key ??= await crypto.subtle.importKey('raw', new TextEncoder().encode(`cb:${OP_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return key;
}
export async function mac(text) {
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(text)));
  return Array.from(s.slice(0, 5), (b) => b.toString(16).padStart(2, '0')).join('');
}
