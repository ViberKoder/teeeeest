import { Address } from '@ton/core';
import { resolveMasterSignerPubkey, resetMasterSignerCache } from './onChainSigner';

const ON_CHAIN = 0xabcn;
const ENV_FALLBACK = 0xdefn;

const mockGetSignerPubkey = jest.fn();

jest.mock('./config', () => ({
  config: {
    JETTON_MASTER_ADDRESS: 'EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw',
    TON_NETWORK: 'mainnet',
    TON_RPC_ENDPOINT: '',
    TON_RPC_API_KEY: '',
    LOG_LEVEL: 'silent',
  },
}));

jest.mock('./tonClient', () => ({
  createTonClient: jest.fn(() => ({})),
}));

jest.mock('@rmj/contracts', () => ({
  RollingMintlessMaster: {
    createFromAddress: jest.fn(() => ({})),
  },
}));

jest.mock('@ton/ton', () => ({
  ...jest.requireActual('@ton/ton'),
  TonClient: jest.fn(),
}));

jest.mock('./logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('resolveMasterSignerPubkey', () => {
  beforeEach(() => {
    resetMasterSignerCache();
    mockGetSignerPubkey.mockReset();
    const { createTonClient } = jest.requireMock('./tonClient') as { createTonClient: jest.Mock };
    createTonClient.mockReturnValue({
      open: () => ({
        getSignerPubkey: mockGetSignerPubkey,
      }),
    });
  });

  test('returns on-chain pubkey from get_signer_pubkey', async () => {
    mockGetSignerPubkey.mockResolvedValue(ON_CHAIN);
    const pubkey = await resolveMasterSignerPubkey({ fallback: ENV_FALLBACK });
    expect(pubkey).toBe(ON_CHAIN);
    expect(mockGetSignerPubkey).toHaveBeenCalledTimes(1);
  });

  test('caches per master between calls', async () => {
    mockGetSignerPubkey.mockResolvedValue(ON_CHAIN);
    await resolveMasterSignerPubkey({ fallback: ENV_FALLBACK });
    await resolveMasterSignerPubkey({ fallback: ENV_FALLBACK });
    expect(mockGetSignerPubkey).toHaveBeenCalledTimes(1);
  });

  test('falls back to env when RPC get-method fails', async () => {
    mockGetSignerPubkey.mockRejectedValue(new Error('rpc down'));
    const pubkey = await resolveMasterSignerPubkey({ fallback: ENV_FALLBACK });
    expect(pubkey).toBe(ENV_FALLBACK);
  });

  test('resetMasterSignerCache forces re-fetch', async () => {
    mockGetSignerPubkey.mockResolvedValue(ON_CHAIN);
    await resolveMasterSignerPubkey({ fallback: ENV_FALLBACK });
    resetMasterSignerCache();
    await resolveMasterSignerPubkey({ fallback: ENV_FALLBACK });
    expect(mockGetSignerPubkey).toHaveBeenCalledTimes(2);
  });
});

describe('resolveMasterSignerPubkey master configured', () => {
  test('configured master parses', () => {
    const master = Address.parse('EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw');
    expect(master.toRawString()).toMatch(/^0:/);
  });
});
