import { mnemonicToPrivateKey } from '@ton/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SUBWALLET_ID, tgWalletStateInit } from '@egg/sdk';
import { keyStore, pendingKey } from '../src/keys/store';

// a tiny localStorage for the node test environment
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const addressOf = async (w: string[]) => {
  const k = await mnemonicToPrivateKey(w);
  return tgWalletStateInit({ publicKey: k.publicKey, subwalletId: SUBWALLET_ID.testnet }).address.toRawString();
};

describe('seedless wallet keys', () => {
  beforeEach(() => mem.clear());

  it('nothing known → none; creating makes a 24-word wallet that loads back unchanged, without asking the user anything', async () => {
    expect((await keyStore.load()).kind).toBe('none');
    const words = await keyStore.create(addressOf);
    expect(words).toHaveLength(24);
    const loaded = await keyStore.load();
    expect(loaded).toEqual({ kind: 'ready', words });
    expect((await keyStore.marker())?.address).toBe(await addressOf(words));
  });

  it('a wallet address is derived from the phrase alone, so restoring on another device gives the same address', async () => {
    const words = await keyStore.create(addressOf);
    const a1 = await addressOf(words);
    mem.clear();
    expect(await addressOf(words)).toBe(a1);
  });

  it('validates a typed phrase against the account’s wallet', async () => {
    const words = await keyStore.create(addressOf);
    const expected = await addressOf(words);
    expect(await keyStore.validate(words, expected, addressOf)).toBe(true);
    const other = await keyStore.create(addressOf);
    expect(await keyStore.validate(other, expected, addressOf)).toBe(false);
    expect(await keyStore.validate(words.slice(1), expected, addressOf)).toBe(false);
    expect(await keyStore.validate([...words.slice(0, 23), 'abandon'], expected, addressOf)).toBe(false);
  });

  it('backup flag lives in the marker', async () => {
    const words = await keyStore.create(addressOf);
    await keyStore.setBackup(words, await addressOf(words), false);
    expect((await keyStore.marker())?.backup).toBe(false);
  });

  it('a staged key rotation survives until it is cleared', async () => {
    const words = await keyStore.create(addressOf);
    expect(pendingKey.read()).toBeNull();
    pendingKey.stage(words);
    expect(pendingKey.read()).toEqual(words);
    pendingKey.clear();
    expect(pendingKey.read()).toBeNull();
  });
});
