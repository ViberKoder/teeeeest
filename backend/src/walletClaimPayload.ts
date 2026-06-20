import { Cell } from '@ton/core';
import { buildRollingClaimPayload, payloadToBase64 } from '@rmj/contracts';
import type { AirdropState } from './state';
import type { VoucherSigner } from './signer';

/** RMJ on-chain claim opcode inside jetton `transfer.custom_payload`. */
export const RMJ_ROLLING_CLAIM_OPCODE = 0xc9e56df3;

/** Build base64 BoC: `rolling_claim` + signed root voucher + merkle proof. */
export function buildMintlessCustomPayloadBase64(
  proof: Cell,
  deps: { state: AirdropState; signer: VoucherSigner },
): string {
  const voucher = deps.signer.signRoot(deps.state.epoch, deps.state.rootBigint());
  return payloadToBase64(buildRollingClaimPayload({ proof, voucher }));
}

export function rmjTransferHints(): {
  attach_ton: string;
  attach_ton_deploy: string;
  note: string;
} {
  return {
    attach_ton: '300000000',
    attach_ton_deploy: '350000000',
    note:
      'RMJ rolling_claim (0xc9e56df3) + signed voucher: attach custom_payload on transfer; claim and send in one jetton-wallet tx',
  };
}
