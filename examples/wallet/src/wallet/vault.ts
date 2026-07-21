const VAULT_KEY = 'rmj-wallet-vault-v1';
const PBKDF2_ITERATIONS = 310_000;

export interface EncryptedVault {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  /** Cached friendly address (non-secret, for display while locked). */
  address: string;
  createdAt: number;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt mnemonic words (space-separated payload inside AES-GCM). */
export async function encryptMnemonic(
  words: string[],
  password: string,
  address: string,
): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(words.join(' '));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBufferSource(iv) }, key, plaintext);

  return {
    version: 1,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    address,
    createdAt: Date.now(),
  };
}

export async function decryptMnemonic(vault: EncryptedVault, password: string): Promise<string[]> {
  const salt = fromB64(vault.salt);
  const iv = fromB64(vault.iv);
  const key = await deriveKey(password, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(iv) },
      key,
      toBufferSource(fromB64(vault.ciphertext)),
    );
    const text = new TextDecoder().decode(plain).trim();
    return text.split(/\s+/).filter(Boolean);
  } catch {
    throw new Error('Неверный пароль.');
  }
}

export function saveVault(vault: EncryptedVault): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function loadVault(): EncryptedVault | null {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as EncryptedVault;
    if (v?.version !== 1 || !v.ciphertext || !v.salt || !v.iv) return null;
    return v;
  } catch {
    return null;
  }
}

export function clearVault(): void {
  localStorage.removeItem(VAULT_KEY);
}

export function hasVault(): boolean {
  return loadVault() !== null;
}
