import { Address } from '@ton/core';
import { keyPairFromSeed, sign, signVerify } from '@ton/crypto';
import { buildClaim, certDigest, KeyCert } from '@egg/contracts';

export interface CertFile {
  signer: string; // hex
  keyId: number;
  notAfter: number;
  signature: string; // hex
}

export function encodeCert(c: KeyCert): string {
  const f: CertFile = {
    signer: c.signer.toString('hex'),
    keyId: c.keyId,
    notAfter: c.notAfter,
    signature: c.signature.toString('hex'),
  };
  return Buffer.from(JSON.stringify(f)).toString('base64');
}

export function decodeCert(b64: string): KeyCert {
  const f = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as CertFile;
  return {
    signer: Buffer.from(f.signer, 'hex'),
    keyId: f.keyId,
    notAfter: f.notAfter,
    signature: Buffer.from(f.signature, 'hex'),
  };
}

/**
 * Holds the hot key and its certificate. Refuses to start with a certificate
 * that was not issued by the configured authority for *this* key and master,
 * so a misconfiguration fails loudly at boot instead of at the first claim.
 */
export class ClaimSigner {
  private readonly secret: Buffer;
  readonly publicKey: Buffer;

  constructor(
    seedHex: string,
    readonly master: Address,
    readonly authorityPub: Buffer,
    readonly cert: KeyCert,
  ) {
    const kp = keyPairFromSeed(Buffer.from(seedHex, 'hex'));
    this.secret = kp.secretKey;
    this.publicKey = kp.publicKey;
    if (!cert.signer.equals(this.publicKey)) throw new Error('certificate was issued for a different signer key');
    const digest = certDigest(master, cert.signer, cert.keyId, cert.notAfter);
    if (!signVerify(digest, cert.signature, authorityPub)) {
      throw new Error('certificate signature does not verify against AUTHORITY_PUBKEY_HEX for this master');
    }
  }

  /** Seconds until the certificate stops being accepted by wallets. */
  certTtl(now: number) {
    return this.cert.notAfter - now;
  }

  claim(owner: Address, cumulative: bigint, validUntil: number) {
    return buildClaim({
      master: this.master,
      owner,
      cumulative,
      validUntil: Math.min(validUntil, this.cert.notAfter),
      signerSecret: this.secret,
      cert: this.cert,
    });
  }
}

export { sign };
