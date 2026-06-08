import { beginCell, Cell } from '@ton/core';
import { OpCodes } from './OpCodes';
import { RootVoucher, voucherToCell } from './Voucher';

/**
 * TEP-177 standard mintless claim payload (Tonkeeper / MyTonWallet / HMSTR).
 *
 *     op    : uint32 = OpCodes.merkleAirdropClaim (0x0df602d6)
 *     proof : ^Cell  merkle-proof exotic cell
 *
 * Prefer this for wallet-facing Proof API responses. The on-chain wallet
 * reads the root hash from the proof and credits `cumulative - already_claimed`.
 */
export function buildStandardMerkleClaimPayload(proof: Cell): Cell {
  return beginCell().storeUint(OpCodes.merkleAirdropClaim, 32).storeRef(proof).endCell();
}

/**
 * RMJ rolling claim with optional signed root voucher (lazy epoch sync).
 *
 *     op         : uint32            = OpCodes.rollingClaim (0xc9e56df3)
 *     hasVoucher : uint1
 *     voucher    : (Maybe ^Voucher)  (present iff hasVoucher == 1)
 *     proof      : ^Cell             merkle-proof exotic cell
 */
export function buildRollingClaimPayload(params: {
  proof: Cell;
  voucher?: RootVoucher | null;
}): Cell {
  const builder = beginCell().storeUint(OpCodes.rollingClaim, 32);
  if (params.voucher) {
    builder.storeUint(1, 1).storeRef(voucherToCell(params.voucher));
  } else {
    builder.storeUint(0, 1);
  }
  builder.storeRef(params.proof);
  return builder.endCell();
}

/**
 * Serialize to base64 for HTTP transport (as consumed by Tonkeeper's
 * custom_payload_api_uri integration).
 */
export function payloadToBase64(cell: Cell): string {
  return cell.toBoc().toString('base64');
}
