import { keyPairFromSeed } from '@ton/crypto';

function randomSeed32(): Uint8Array {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
}

function bytesToHex(u8: Uint8Array): string {
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Derive RMJ voucher signer keys. Keep `seedHex` secret — same value as backend SIGNER_SEED_HEX. */
export function generateSignerSecrets(): { seedHex: string; pubkeyHex: string } {
  const seed = randomSeed32();
  const kp = keyPairFromSeed(Buffer.from(seed));
  return {
    seedHex: bytesToHex(seed),
    pubkeyHex: bytesToHex(kp.publicKey),
  };
}
