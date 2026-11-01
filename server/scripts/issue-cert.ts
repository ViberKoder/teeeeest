/**
 * Run on the machine that holds the cold authority key:
 *
 *   AUTHORITY_SEED_HEX=… SIGNER_PUBKEY_HEX=… JETTON_MASTER_ADDRESS=… \
 *   KEY_ID=1 DAYS=30 npm run cert -w @egg/server
 *
 * Prints KEY_CERT_B64 for the server. Raising KEY_ID revokes older signers on
 * every wallet that sees the new one; a short DAYS value limits the exposure
 * if the hot key leaks (wallets stop trusting it when the certificate lapses).
 */
import { Address } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { signCert } from '@egg/contracts';
import { encodeCert } from '../src/signer';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

const authority = keyPairFromSeed(Buffer.from(need('AUTHORITY_SEED_HEX'), 'hex'));
const cert = signCert(
  authority.secretKey,
  Address.parse(need('JETTON_MASTER_ADDRESS')),
  Buffer.from(need('SIGNER_PUBKEY_HEX'), 'hex'),
  Number(process.env.KEY_ID ?? 1),
  Math.floor(Date.now() / 1000) + Number(process.env.DAYS ?? 30) * 86_400,
);
console.log('KEY_CERT_B64=' + encodeCert(cert));
