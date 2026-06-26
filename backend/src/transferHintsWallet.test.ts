import { Address } from '@ton/core';
import { rmjTransferHints, RMJ_ATTACH_TON_EXTERNAL_NANO } from './walletClaimPayload';

describe('rmjTransferHints', () => {
  it('recommends 0.18 TON for external recipient deploy', () => {
    const hints = rmjTransferHints();
    expect(hints.attach_ton_external).toBe(RMJ_ATTACH_TON_EXTERNAL_NANO.toString());
    expect(hints.attach_ton_external).toBe('180000000');
    expect(hints.note).toContain('transfer_hints');
  });

  it('notes sender deploy when state_init is required', () => {
    const hints = rmjTransferHints({ senderNeedsDeploy: true });
    expect(hints.note).toContain('sender jetton-wallet deploy');
  });
});

describe('transfer_hints wallet shape', () => {
  it('empty custom_payload is valid for post-claim transfers', () => {
    const body = {
      owner: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').toRawString(),
      jetton_wallet: '0:def',
      custom_payload: '',
      compressed_info: { amount: '100', start_from: '0', expired_at: '2000000000' },
      transfer_hints: rmjTransferHints(),
    };
    expect(body.custom_payload).toBe('');
    expect(body.transfer_hints.attach_ton_external).toBe('180000000');
  });
});
