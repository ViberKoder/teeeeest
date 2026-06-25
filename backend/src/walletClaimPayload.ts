import { Cell } from '@ton/core';
import { buildRollingClaimPayload, payloadToBase64 } from '@rmj/contracts';
import type { AirdropState } from './state';
import type { VoucherSigner } from './signer';

/** RMJ on-chain claim opcode inside jetton `transfer.custom_payload`. */
export const RMJ_ROLLING_CLAIM_OPCODE = 0xc9e56df3;

/** TON (nano) to attach to the jetton-wallet message for common RMJ flows. */
export const RMJ_ATTACH_TON_CLAIM_NANO = 300_000_000n;
export const RMJ_ATTACH_TON_SENDER_DEPLOY_NANO = 350_000_000n;
/** Claim + deploy recipient jetton-wallet + forward (MyTonWallet often uses ~0.07 — too low). */
export const RMJ_ATTACH_TON_EXTERNAL_NANO = 550_000_000n;

export type RmjTransferHints = {
  attach_ton: string;
  attach_ton_deploy: string;
  attach_ton_external: string;
  note: string;
};

/** Build base64 BoC: `rolling_claim` + signed root voucher + merkle proof. */
export function buildMintlessCustomPayloadBase64(
  proof: Cell,
  deps: { state: AirdropState; signer: VoucherSigner },
): string {
  const voucher = deps.signer.signRoot(deps.state.epoch, deps.state.rootBigint());
  return payloadToBase64(buildRollingClaimPayload({ proof, voucher }));
}

export function rmjTransferHints(opts?: {
  senderNeedsDeploy?: boolean;
}): RmjTransferHints {
  const deploy = opts?.senderNeedsDeploy ? 'sender jetton-wallet deploy + ' : '';
  return {
    attach_ton: RMJ_ATTACH_TON_CLAIM_NANO.toString(),
    attach_ton_deploy: RMJ_ATTACH_TON_SENDER_DEPLOY_NANO.toString(),
    attach_ton_external: RMJ_ATTACH_TON_EXTERNAL_NANO.toString(),
    note:
      `RMJ rolling_claim (0xc9e56df3): ${deploy}claim + transfer in one tx; ` +
      'use attach_ton_external (0.55 TON) when recipient has no jetton-wallet yet',
  };
}
