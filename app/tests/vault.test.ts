import { decryptPhrase, encryptPhrase } from '../src/crypto/vault';

const words = Array.from({ length: 24 }, (_, i) => `word${i}`);

describe('vault', () => {
  it('round-trips with the right passcode only', async () => {
    const blob = await encryptPhrase(words, '123456', 'UQtest', 1000);
    expect(await decryptPhrase(blob, '123456')).toEqual(words);
    expect(await decryptPhrase(blob, '123457')).toBeNull();
  });

  it('never stores the phrase in the clear and uses fresh randomness', async () => {
    const a = await encryptPhrase(words, '123456', 'UQtest', 1000);
    const b = await encryptPhrase(words, '123456', 'UQtest', 1000);
    expect(JSON.stringify(a)).not.toContain('word0');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('detects tampering', async () => {
    const blob = await encryptPhrase(words, '123456', 'UQtest', 1000);
    const bytes = Buffer.from(blob.ct, 'base64');
    bytes[0] ^= 1;
    expect(await decryptPhrase({ ...blob, ct: bytes.toString('base64') }, '123456')).toBeNull();
  });
});
