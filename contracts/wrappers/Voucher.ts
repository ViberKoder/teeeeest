import { beginCell, Cell } from '@ton/core';
import { sign, keyPairFromSeed, KeyPair } from '@ton/crypto';

/**
 * A "root voucher" is a signed message produced off-chain by the project's
 * signer service. When attached to a transfer's rolling-claim custom payload,
 * it tells the recipient jetton-wallet to lazily update its cached Merkle
 * root before verifying the attached proof.
 *
 * Wire layout:
 *     new_epoch  : uint32
 *     new_root   : uint256
 *     signature  : ^bits512   (ed25519 over cell(new_epoch, new_root))
 */
export interface RootVoucher {
  newEpoch: number;
  newRoot: bigint;
  signature: Buffer;
}

export function voucherSigningHash(newEpoch: number, newRoot: bigint): Buffer {
  const cell = beginCell().storeUint(newEpoch, 32).storeUint(newRoot, 256).endCell();
  return cell.hash();
}

export function signVoucher(
  newEpoch: number,
  newRoot: bigint,
  signerSecret: Buffer,
): RootVoucher {
  const signature = sign(voucherSigningHash(newEpoch, newRoot), signerSecret);
  return { newEpoch, newRoot, signature };
}

export function voucherToCell(v: RootVoucher): Cell {
  return beginCell()
    .storeUint(v.newEpoch, 32)
    .storeUint(v.newRoot, 256)
    .storeRef(beginCell().storeBuffer(v.signature).endCell())
    .endCell();
}

/**
 * Derive an ed25519 keypair from a 32-byte seed. Convenience for tests and
 * command-line tools; production deployments should use an HSM.
 */
export function keypairFromSeedBuffer(seed: Buffer): KeyPair {
  if (seed.length !== 32) {
    throw new Error(`Signer seed must be 32 bytes, got ${seed.length}`);
  }
  return keyPairFromSeed(seed);
}
