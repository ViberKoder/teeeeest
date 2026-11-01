/**
 * Passcode-encrypted storage for the recovery phrase.
 *   key  = PBKDF2-SHA256(passcode, random salt, 600k rounds)
 *   blob = AES-256-GCM(key, random iv, phrase)
 * Only ciphertext touches storage. The phrase lives in memory while unlocked.
 */
const KEY = 'egg.vault.v1';
const ITER = 600_000;

export interface VaultBlob {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
  /** public address, so the locked screen can show who you are without decrypting */
  address: string;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passcode: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPhrase(words: string[], passcode: string, address: string, iter = ITER): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveKey(passcode, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(words.join(' '))));
  return { v: 1, iter, salt: b64(salt), iv: b64(iv), ct: b64(ct), address };
}

export async function decryptPhrase(blob: VaultBlob, passcode: string): Promise<string[] | null> {
  try {
    const key = await deriveKey(passcode, unb64(blob.salt), blob.iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return new TextDecoder().decode(pt).split(' ');
  } catch {
    return null; // wrong passcode (GCM tag mismatch)
  }
}

export const vaultStore = {
  read(): VaultBlob | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as VaultBlob) : null;
    } catch {
      return null;
    }
  },
  write(blob: VaultBlob) {
    localStorage.setItem(KEY, JSON.stringify(blob));
  },
  wipe() {
    localStorage.removeItem(KEY);
    localStorage.removeItem('egg.attempts');
  },
};

/** Client-side throttle against casual guessing (offline attacks are slowed by PBKDF2 itself). */
export const attempts = {
  state(): { n: number; until: number } {
    try {
      return JSON.parse(localStorage.getItem('egg.attempts') ?? '{"n":0,"until":0}');
    } catch {
      return { n: 0, until: 0 };
    }
  },
  fail() {
    const s = this.state();
    const n = s.n + 1;
    const until = n >= 5 ? Date.now() + Math.min(2 ** (n - 5) * 30_000, 3_600_000) : 0;
    localStorage.setItem('egg.attempts', JSON.stringify({ n, until }));
    return { n, until };
  },
  reset() {
    localStorage.removeItem('egg.attempts');
  },
};
