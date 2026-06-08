/**
 * Passcode-based encryption for the wallet seed.
 *
 * Threat model:
 *   - The 24-word mnemonic is shown to the user EXACTLY ONCE during onboarding,
 *     then wiped from memory after they have written it down and confirmed.
 *   - Only an AES-GCM ciphertext of the 32-byte ed25519 seed is persisted
 *     (localStorage by default; Telegram CloudStorage when running inside TMA).
 *   - The encryption key is derived from a user-chosen passcode via PBKDF2-SHA256
 *     with 250 000 iterations and a per-vault random 16-byte salt.
 *   - Without the passcode no signing is possible; an attacker with the
 *     ciphertext faces an offline brute-force at PBKDF2 cost.
 *
 * Public surface intentionally tiny: encryptSeed / decryptSeed / changePasscode.
 */

const SUBTLE = (() => {
  const c = (globalThis as any).crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto API is required (insecure context?)');
  }
  return c.subtle as SubtleCrypto;
})();

const ITERATIONS = 250_000;
const SALT_LEN = 16;
const IV_LEN = 12;

function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  (globalThis as any).crypto.getRandomValues(out);
  return out;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const pwKey = await SUBTLE.importKey(
    'raw',
    new TextEncoder().encode(passcode) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return SUBTLE.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations: ITERATIONS,
    },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedVault {
  v: 1;
  /** Algorithm identifier — locked to AES-GCM 256 + PBKDF2-SHA256. */
  alg: 'AES-GCM/256+PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  /** Base64 ciphertext + 16-byte GCM tag concatenated (SubtleCrypto convention). */
  ct: string;
}

export async function encryptSeed(seed: Uint8Array, passcode: string): Promise<EncryptedVault> {
  if (seed.length !== 32) throw new Error('expected 32-byte ed25519 seed');
  if (!passcode || passcode.length < 4) {
    throw new Error('passcode must be at least 4 characters');
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(passcode, salt);
  const ct = new Uint8Array(
    await SUBTLE.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, seed as BufferSource),
  );
  return {
    v: 1,
    alg: 'AES-GCM/256+PBKDF2-SHA256',
    iter: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

export async function decryptSeed(vault: EncryptedVault, passcode: string): Promise<Uint8Array> {
  if (vault.v !== 1) throw new Error('unsupported vault version');
  const salt = fromB64(vault.salt);
  const iv = fromB64(vault.iv);
  const ct = fromB64(vault.ct);
  const key = await deriveKey(passcode, salt);
  let pt: ArrayBuffer;
  try {
    pt = await SUBTLE.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  } catch {
    throw new Error('wrong passcode');
  }
  const seed = new Uint8Array(pt);
  if (seed.length !== 32) throw new Error('decrypted seed has wrong length');
  return seed;
}

export async function changePasscode(
  vault: EncryptedVault,
  oldPasscode: string,
  newPasscode: string,
): Promise<EncryptedVault> {
  const seed = await decryptSeed(vault, oldPasscode);
  try {
    return await encryptSeed(seed, newPasscode);
  } finally {
    seed.fill(0);
  }
}
