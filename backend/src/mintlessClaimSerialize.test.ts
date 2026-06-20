import { formatCompressedInfo, serializeMintlessWalletResponse } from './mintlessWalletFormat';

describe('serializeMintlessWalletResponse (claim-api-go compat)', () => {
  it('omits state_init when null — wallets expect optional string, not null', () => {
    const body = {
      owner: '0:abc',
      jetton_wallet: '0:def',
      custom_payload: 'te6cck',
      state_init: null as string | null,
      compressed_info: formatCompressedInfo({
        amount: 42n,
        startFrom: 0,
        expiredAt: 2_000_000_000,
      }),
      epoch: 1,
      root: '0x00',
    };
    const out = serializeMintlessWalletResponse(body);
    expect(out.state_init).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('state_init');
    expect(out.epoch).toBe(1);
  });

  it('keeps state_init when present for first-time deploy', () => {
    const body = {
      owner: '0:abc',
      jetton_wallet: '0:def',
      custom_payload: 'te6cck',
      state_init: 'te6cckEC',
      compressed_info: formatCompressedInfo({
        amount: 42n,
        startFrom: 0,
        expiredAt: 2_000_000_000,
      }),
    };
    const out = serializeMintlessWalletResponse(body);
    expect(out.state_init).toBe('te6cckEC');
  });
});
