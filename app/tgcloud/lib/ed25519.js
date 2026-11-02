// Ed25519 (RFC 8032) on BigInt: signing and verification, because the runtime's WebCrypto does not offer it.
// Verified against @ton/crypto in server/tests (same keys, same messages, same signatures).
import { concat, sha512 } from './bytes.js';

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const mod = (a, m = P) => ((a % m) + m) % m;
const pow = (b, e, m = P) => { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const inv = (a) => pow(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const I = pow(2n, (P - 1n) / 4n);

const add = (a, b) => { // extended twisted Edwards coordinates [X, Y, Z, T]
  const A = mod((a[1] - a[0]) * (b[1] - b[0])), B = mod((a[1] + a[0]) * (b[1] + b[0]));
  const C = mod(2n * D * a[3] * b[3]), Dd = mod(2n * a[2] * b[2]);
  const E = B - A, F = Dd - C, G = Dd + C, H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
};
const ZERO = [0n, 1n, 1n, 0n];
const mul = (p, k) => { let r = ZERO, q = p; while (k > 0n) { if (k & 1n) r = add(r, q); q = add(q, q); k >>= 1n; } return r; };
const recoverX = (y, sign) => {
  const xx = mod((y * y - 1n) * inv(D * y * y + 1n));
  let x = pow(xx, (P + 3n) / 8n);
  if (mod(x * x - xx) !== 0n) x = mod(x * I);
  if (mod(x * x - xx) !== 0n) throw new Error('bad point');
  if ((x & 1n) !== BigInt(sign)) x = P - x;
  return x;
};
const BY = mod(4n * inv(5n));
const B = (() => { const x = recoverX(BY, 0); return [x, BY, 1n, mod(x * BY)]; })();

const enc = (p) => {
  const zi = inv(p[2]), x = mod(p[0] * zi), y = mod(p[1] * zi);
  const out = new Uint8Array(32);
  let v = y | ((x & 1n) << 255n);
  for (let i = 0; i < 32; i++) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
};
const dec = (u8) => {
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(u8[i]);
  const sign = Number(v >> 255n);
  const y = v & ((1n << 255n) - 1n);
  if (y >= P) throw new Error('bad point');
  const x = recoverX(y, sign);
  return [x, y, 1n, mod(x * y)];
};
const le = (u8) => { let v = 0n; for (let i = u8.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(u8[i]); return v; };
const leBytes = (v, n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) { out[i] = Number(v & 255n); v >>= 8n; } return out; };

/** `seed` is the 32-byte secret; returns the 64-byte signature. */
export async function sign(message, seed) {
  const h = await sha512(seed);
  const s = h.slice(0, 32);
  s[0] &= 248; s[31] &= 127; s[31] |= 64;
  const a = le(s);
  const A = enc(mul(B, a));
  const r = mod(le(await sha512(concat(h.slice(32), message))), L);
  const R = enc(mul(B, r));
  const k = mod(le(await sha512(concat(R, A, message))), L);
  return concat(R, leBytes(mod(r + k * a, L), 32));
}

export async function publicKeyOf(seed) {
  const h = await sha512(seed);
  const s = h.slice(0, 32);
  s[0] &= 248; s[31] &= 127; s[31] |= 64;
  return enc(mul(B, le(s)));
}

export async function verify(message, signature, publicKey) {
  try {
    if (signature.length !== 64 || publicKey.length !== 32) return false;
    const R = dec(signature.slice(0, 32));
    const A = dec(publicKey);
    const S = le(signature.slice(32));
    if (S >= L) return false;
    const k = mod(le(await sha512(concat(signature.slice(0, 32), publicKey, message))), L);
    const left = mul(B, S), right = add(R, mul(A, k));
    return mod(left[0] * right[2] - right[0] * left[2]) === 0n && mod(left[1] * right[2] - right[1] * left[2]) === 0n;
  } catch {
    return false;
  }
}
