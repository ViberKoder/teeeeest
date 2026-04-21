import { keyPairFromSeed, sign, KeyPair } from '@ton/crypto';
import { signVoucher, voucherSigningHash, RootVoucher } from '@rmj/contracts';
import { config } from './config';
import { logger } from './logger';

/**
 * Voucher signer service. In production, wrap an HSM / KMS behind this
 * interface and never expose the raw secret key to the rest of the process.
 *
 * For development and reference we derive the keypair from a seed provided
 * via environment variable.
 */
export class VoucherSigner {
  readonly keypair: KeyPair;

  constructor(seedHex: string) {
    const seed = Buffer.from(seedHex, 'hex');
    if (seed.length !== 32) {
      throw new Error('SIGNER_SEED_HEX must decode to 32 bytes');
    }
    this.keypair = keyPairFromSeed(seed);
    logger.info(
      { pubkey: this.keypair.publicKey.toString('hex') },
      'voucher signer initialised',
    );
  }

  get publicKeyBigint(): bigint {
    return BigInt('0x' + this.keypair.publicKey.toString('hex'));
  }

  get publicKeyHex(): string {
    return this.keypair.publicKey.toString('hex');
  }

  signRoot(epoch: number, root: bigint): RootVoucher {
    return signVoucher(epoch, root, this.keypair.secretKey);
  }

  /** Hex-encoded for DB / API transport. */
  signRootHex(epoch: number, root: bigint): {
    epoch: number;
    root: string;
    signature: string;
  } {
    const voucher = this.signRoot(epoch, root);
    return {
      epoch,
      root: '0x' + root.toString(16).padStart(64, '0'),
      signature: voucher.signature.toString('hex'),
    };
  }
}

export const voucherSigner = new VoucherSigner(config.SIGNER_SEED_HEX);
