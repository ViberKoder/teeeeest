/**
 * Generates the two key pairs.
 *   authority  — COLD. Keep the secret offline. Its public key is baked into the
 *                token at deploy time and can never change.
 *   signer     — HOT. Lives on the server (ideally behind a KMS). Replaceable.
 */
import { keyPairFromSeed, getSecureRandomBytes } from '@ton/crypto';

async function main() {
  const authoritySeed = await getSecureRandomBytes(32);
  const signerSeed = await getSecureRandomBytes(32);
  const a = keyPairFromSeed(authoritySeed);
  const s = keyPairFromSeed(signerSeed);
  console.log('# COLD authority — store the seed offline, never on the server');
  console.log('AUTHORITY_SEED_HEX=' + authoritySeed.toString('hex'));
  console.log('AUTHORITY_PUBKEY_HEX=' + a.publicKey.toString('hex'));
  console.log('\n# HOT signer — goes into the server environment');
  console.log('SIGNER_SEED_HEX=' + signerSeed.toString('hex'));
  console.log('SIGNER_PUBKEY_HEX=' + s.publicKey.toString('hex'));
}
main();
