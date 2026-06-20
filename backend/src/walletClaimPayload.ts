import { Cell } from '@ton/core';
import { JettonMaster } from '@ton/ton';
import {
  buildRollingClaimPayload,
  buildStandardMerkleClaimPayload,
  payloadToBase64,
} from '@rmj/contracts';
import type { AirdropState } from './state';
import type { VoucherSigner } from './signer';
import { configuredJettonMaster } from './jettonMaster';
import { createTonClient } from './tonClient';
import { logger } from './logger';

const MERKLE_AIRDROP_CLAIM_OPCODE_HEX = '0df602d6';

export type WalletClaimPayloadFormat = 'tep177' | 'rolling_voucher';

let cachedFormat: { master: string; format: WalletClaimPayloadFormat } | null = null;

/** Detect whether deployed jetton-wallet code handles TEP-177 `merkle_airdrop_claim`. */
export function walletCodeSupportsMerkleAirdropClaim(walletCode: Cell): boolean {
  return walletCode.toBoc().toString('hex').includes(MERKLE_AIRDROP_CLAIM_OPCODE_HEX);
}

export async function resolveWalletClaimPayloadFormat(): Promise<WalletClaimPayloadFormat> {
  const master = configuredJettonMaster();
  if (!master) {
    return 'tep177';
  }
  const masterKey = master.toString();
  if (cachedFormat?.master === masterKey) {
    return cachedFormat.format;
  }

  try {
    const client = createTonClient();
    const masterContract = client.open(JettonMaster.create(master));
    const { walletCode } = await masterContract.getJettonData();
    const format: WalletClaimPayloadFormat = walletCodeSupportsMerkleAirdropClaim(walletCode)
      ? 'tep177'
      : 'rolling_voucher';
    cachedFormat = { master: masterKey, format };
    if (format === 'rolling_voucher') {
      logger.warn(
        { master: masterKey, walletCodeHash: walletCode.hash().toString('hex') },
        'mintless: on-chain wallet code lacks TEP-177 merkle_airdrop_claim — Proof API will use rolling_claim + voucher',
      );
    }
    return format;
  } catch (e) {
    logger.warn({ err: e }, 'mintless: could not read jetton wallet code — defaulting to TEP-177 payload');
    return 'tep177';
  }
}

/** Reset cached format (tests / master redeploy). */
export function resetWalletClaimPayloadFormatCache(): void {
  cachedFormat = null;
}

export function buildMintlessCustomPayloadBase64(
  proof: Cell,
  format: WalletClaimPayloadFormat,
  deps: { state: AirdropState; signer: VoucherSigner },
): string {
  if (format === 'rolling_voucher') {
    const voucher = deps.signer.signRoot(deps.state.epoch, deps.state.rootBigint());
    return payloadToBase64(buildRollingClaimPayload({ proof, voucher }));
  }
  return payloadToBase64(buildStandardMerkleClaimPayload(proof));
}

export function transferHintsForClaimFormat(format: WalletClaimPayloadFormat): {
  attach_ton: string;
  attach_ton_deploy: string;
  note: string;
} {
  if (format === 'rolling_voucher') {
    return {
      attach_ton: '300000000',
      attach_ton_deploy: '350000000',
      note:
        'Legacy RMJ wallet code: custom_payload uses rolling_claim (0xc9e56df3) + signed voucher; redeploy master with current wallet code for TEP-177 0x0df602d6',
    };
  }
  return {
    attach_ton: '300000000',
    attach_ton_deploy: '350000000',
    note: 'TEP-177 merkle_airdrop_claim (0x0df602d6): attach custom_payload on transfer; claim and send in one jetton-wallet tx',
  };
}
