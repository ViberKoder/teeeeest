import { beginCell, Cell } from '@ton/core';
import { OpCodes } from './OpCodes';
import { RootVoucher, voucherToCell } from './Voucher';

/**
 * Build the custom-payload cell that Tonkeeper / MyTonWallet / any integration
 * attaches to a jetton `transfer` message to trigger a rolling claim on the
 * recipient jetton-wallet.
 *
 * Wire layout of the returned cell:
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
