import { beginCell, Cell } from '@ton/core';
import { OpCodes } from '@rmj/contracts';

jest.mock('./config', () => ({
  config: {
    JETTON_MASTER_ADDRESS: 'EQBftxxIxYiRSutImRbAwg6NikvE4_yoJ_fYvdCkK8rAIK4v',
    TON_NETWORK: 'mainnet',
    LOG_LEVEL: 'info',
    LOG_PRETTY: false,
  },
}));

import {
  buildMintlessCustomPayloadBase64,
  resetWalletClaimPayloadFormatCache,
  walletCodeSupportsMerkleAirdropClaim,
} from './walletClaimPayload';

describe('walletCodeSupportsMerkleAirdropClaim', () => {
  afterEach(() => {
    resetWalletClaimPayloadFormatCache();
  });

  it('returns true when wallet code BOC contains merkle_airdrop_claim opcode', () => {
    const code = beginCell()
      .storeUint(OpCodes.merkleAirdropClaim, 32)
      .storeUint(OpCodes.rollingClaim, 32)
      .endCell();
    expect(walletCodeSupportsMerkleAirdropClaim(code)).toBe(true);
  });

  it('returns false for legacy rolling-only wallet code', () => {
    const code = beginCell().storeUint(OpCodes.rollingClaim, 32).endCell();
    expect(walletCodeSupportsMerkleAirdropClaim(code)).toBe(false);
  });
});

describe('buildMintlessCustomPayloadBase64', () => {
  const proof = new Cell();

  it('uses TEP-177 opcode for tep177 format', () => {
    const b64 = buildMintlessCustomPayloadBase64(proof, 'tep177', {
      state: { epoch: 1, rootBigint: () => 1n } as never,
      signer: { signRoot: () => ({ epoch: 1, root: 1n, signature: Buffer.alloc(64) }) } as never,
    });
    const op = Cell.fromBase64(b64).beginParse().loadUint(32);
    expect(op).toBe(0x0df602d6);
  });

  it('uses rolling_claim + voucher for rolling_voucher format', () => {
    const b64 = buildMintlessCustomPayloadBase64(proof, 'rolling_voucher', {
      state: { epoch: 32, rootBigint: () => 42n } as never,
      signer: {
        signRoot: (epoch: number, root: bigint) => ({
          newEpoch: epoch,
          newRoot: root,
          signature: Buffer.alloc(64, 0xab),
        }),
      } as never,
    });
    const s = Cell.fromBase64(b64).beginParse();
    expect(s.loadUint(32)).toBe(0xc9e56df3);
    expect(s.loadUint(1)).toBe(1);
    s.loadRef();
    expect(s.remainingRefs).toBe(1);
  });
});
