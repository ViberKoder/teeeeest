import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';
import { cloud } from '../lib/tg';

/**
 * The wallet belongs to the Telegram account, like Telegram's own Money wallet: it is created on first use, nobody is asked
 * to write anything down, and it follows the account to every device.
 *
 *   device  localStorage            the working copy on this device
 *   cloud   Telegram CloudStorage   the account-bound backup (switch it off in Keys & Backup)
 *   marker  address + backup flag   lets a new session know a wallet exists even when the backup is off
 *
 * With the backup on, Telegram can restore the wallet; with it off — or after switching to self-custody — only the secret
 * phrase can.
 */
const KEY = 'egg.key.v1';
const MARK = 'egg.wallet.v1';

export interface Marker {
  address: string;
  backup: boolean;
}

const dev = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the cloud copy still works */
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const parseWords = (raw: string | null): string[] | null => {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { words?: string[] };
    return Array.isArray(j.words) && j.words.length === 24 ? j.words : null;
  } catch {
    return null;
  }
};

export type Loaded = { kind: 'ready'; words: string[] } | { kind: 'needs-phrase'; marker: Marker } | { kind: 'none' } | { kind: 'unknown' };

export const keyStore = {
  async load(): Promise<Loaded> {
    const local = parseWords(dev.get(KEY));
    if (local) return { kind: 'ready', words: local };

    // Telegram's CloudStorage can be slow or fail: "I could not ask" must never be read as "there is no wallet"
    let asked = await cloud.read(KEY);
    for (let i = 0; i < 2 && !asked.ok && cloud.available(); i++) asked = await cloud.read(KEY);
    const fromCloud = parseWords(asked.value);
    if (fromCloud) {
      dev.set(KEY, JSON.stringify({ words: fromCloud }));
      return { kind: 'ready', words: fromCloud };
    }
    const marker = await keyStore.marker();
    if (marker) return { kind: 'needs-phrase', marker };
    if (!asked.ok && cloud.available()) return { kind: 'unknown' };
    return { kind: 'none' };
  },

  async marker(): Promise<Marker | null> {
    const raw = (await cloud.get(MARK)) ?? dev.get(MARK);
    try {
      return raw ? (JSON.parse(raw) as Marker) : null;
    } catch {
      return null;
    }
  },

  /** A fresh wallet: new phrase, backed up to the Telegram account unless told otherwise. */
  async create(address: (words: string[]) => Promise<string>, backup = true): Promise<string[]> {
    // never overwrite an existing backup: look once more right before writing
    const again = await cloud.read(KEY);
    const existing = parseWords(again.value);
    if (existing) {
      await keyStore.save(existing, await address(existing), true);
      return existing;
    }
    const words = await mnemonicNew(24);
    await keyStore.save(words, await address(words), backup);
    return words;
  },

  async save(words: string[], address: string, backup: boolean) {
    dev.set(KEY, JSON.stringify({ words }));
    const mark = JSON.stringify({ address, backup } satisfies Marker);
    dev.set(MARK, mark);
    await cloud.set(MARK, mark);
    if (backup) await cloud.set(KEY, JSON.stringify({ words }));
    else await cloud.remove(KEY);
  },

  /** Turn the account-bound backup on or off without touching the wallet. */
  async setBackup(words: string[], address: string, backup: boolean) {
    await keyStore.save(words, address, backup);
  },

  /** Forget the working copy on this device (the cloud backup, if any, stays). */
  forgetDevice() {
    dev.remove(KEY);
  },

  /** Check a phrase typed by the user against the wallet that is already known for this account. */
  async validate(words: string[], expectedAddress: string, addressOf: (w: string[]) => Promise<string>): Promise<boolean> {
    if (words.length !== 24 || !(await mnemonicValidate(words))) return false;
    return (await addressOf(words)) === expectedAddress;
  },
};

const PENDING = 'egg.key.pending.v1';

/**
 * A key rotation is staged on the device BEFORE it is sent: if the app dies between "the contract accepted the new key" and
 * "we saved it", the staged phrase is still there and is adopted once the chain shows the new key.
 */
export const pendingKey = {
  stage: (words: string[]) => dev.set(PENDING, JSON.stringify({ words })),
  read: (): string[] | null => parseWords(dev.get(PENDING)),
  clear: () => dev.remove(PENDING),
};

export const keysOf = async (words: string[]) => mnemonicToPrivateKey(words);
