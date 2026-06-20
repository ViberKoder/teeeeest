import { beginCell, Cell } from '@ton/core';
import { OpCodes } from '@rmj/contracts';
import { buildMintlessCustomPayloadBase64 } from './walletClaimPayload';

describe('buildMintlessCustomPayloadBase64', () => {
  const proof = new Cell();

  it('uses rolling_claim opcode with signed voucher', () => {
    const b64 = buildMintlessCustomPayloadBase64(proof, {
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

  it('RMJ opcode constant matches contract', () => {
    const code = beginCell().storeUint(OpCodes.rollingClaim, 32).endCell();
    expect(code.beginParse().loadUint(32)).toBe(0xc9e56df3);
  });
});
