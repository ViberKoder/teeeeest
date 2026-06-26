/**
 * Sandbox-style integration checks: metadata shape, Proof API transfer_hints,
 * and contract-aligned TON amounts — without live RPC or deployed backend.
 */
import { Address } from '@ton/core';
import { AirdropTree } from '@rmj/contracts';
import { AirdropState } from './state';
import { VoucherSigner } from './signer';
import {
  buildMintlessWalletResponse,
  buildTransferHintsWalletResponse,
} from './mintlessClaimHelpers';
import { buildJettonMetadataJson, walletResponseMetadataShim } from './jettonMetadata';
import { serializeMintlessWalletResponse } from './mintlessWalletFormat';
import { RMJ_ATTACH_TON_EXTERNAL_NANO } from './walletClaimPayload';

const MASTER = Address.parse('EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw');
const OWNER = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
const SIGNER_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

jest.mock('./config', () => ({
  config: {
    PUBLIC_APP_URL: 'https://sandbox.example.com',
    PUBLIC_JETTON_NAME: 'Egg',
    PUBLIC_JETTON_SYMBOL: '🥚',
    PUBLIC_JETTON_DESCRIPTION: 'Sandbox egg',
    PUBLIC_JETTON_IMAGE_URL: 'https://example.com/egg.png',
    PUBLIC_MINTLESS_JETTON_NAME: '',
    PUBLIC_MINTLESS_JETTON_SYMBOL: '',
    PUBLIC_MINTLESS_JETTON_DESCRIPTION: '',
    PUBLIC_MINTLESS_JETTON_IMAGE_URL: '',
    PUBLIC_BALANCE_DISPLAY: 'integer',
    TON_NETWORK: 'mainnet',
    JETTON_MASTER_ADDRESS: 'EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw',
    TON_RPC_ENDPOINT: '',
    TON_RPC_API_KEY: '',
    PROOF_API_MTW_METADATA_SHIM: true,
    PROOF_VALIDITY_WINDOW_DAYS: 365,
    SIGNER_SEED_HEX: '0000000000000000000000000000000000000000000000000000000000000001',
  },
}));

const mockGetWalletAddress = jest.fn();
const mockGetContractState = jest.fn();
const mockGetJettonData = jest.fn();
const mockGetAlreadyClaimed = jest.fn();

jest.mock('./tonClient', () => ({
  createTonClient: jest.fn(() => ({
    open: () => ({
      getWalletAddress: mockGetWalletAddress,
      getJettonData: mockGetJettonData,
      getAlreadyClaimed: mockGetAlreadyClaimed,
    }),
    getContractState: mockGetContractState,
  })),
}));

jest.mock('@ton/ton', () => ({
  ...jest.requireActual('@ton/ton'),
  JettonMaster: {
    create: jest.fn(() => ({})),
  },
}));

jest.mock('@rmj/contracts', () => {
  const actual = jest.requireActual('@rmj/contracts');
  const jwAddr = Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111');
  return {
    ...actual,
    RollingMintlessWallet: {
      ...actual.RollingMintlessWallet,
      createFromAddress: jest.fn(() => ({})),
      createFromConfig: jest.fn(() => ({
        address: jwAddr,
        init: null,
      })),
    },
    RollingMintlessMaster: {
      createFromAddress: jest.fn(() => ({
        getSignerPubkey: jest.fn().mockResolvedValue(1n),
      })),
    },
  };
});

jest.mock('./logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function makeState(owner: Address, cumulative: bigint, epoch = 1): AirdropState {
  const tree = new AirdropTree();
  tree.set(owner, { cumulativeAmount: cumulative, startFrom: 0, expiredAt: 2_000_000_000 });
  return {
    tree,
    epoch,
    rootBigint: () => tree.root(),
    rootHex: () => '0x' + tree.rootBuffer().toString('hex'),
  } as AirdropState;
}

describe('mintless sandbox — metadata (TEP-64)', () => {
  test('required fields for wallets/indexers; no fee hints in on-chain metadata JSON', () => {
    const body = buildJettonMetadataJson(MASTER, {
      publicAppUrl: 'https://sandbox.example.com',
      name: 'Egg',
      symbol: '🥚',
      decimals: '0',
    });
    expect(body).toMatchObject({
      name: 'Egg',
      symbol: '🥚',
      decimals: '0',
      custom_payload_api_uri: expect.stringContaining('/api/v1/jettons/'),
      mintless_merkle_dump_uri: expect.stringContaining('/merkle-dump'),
    });
    // Fee hints belong in Proof API transfer_hints, not jetton metadata (MyTonWallet validates metadata strictly).
    expect(body?.transfer_attach_ton).toBeUndefined();
    expect(body?.transfer_attach_ton_external).toBeUndefined();
  });

  test('MTW metadata shim on Proof API has only display fields (name/symbol/decimals)', () => {
    const shim = walletResponseMetadataShim();
    expect(shim).toEqual({
      name: 'Egg',
      symbol: '🥚',
      decimals: '0',
      description: 'Sandbox egg',
      image: 'https://example.com/egg.png',
    });
    expect(shim).not.toHaveProperty('transfer_attach_ton');
  });
});

describe('mintless sandbox — Proof API transfer_hints', () => {
  const signer = new VoucherSigner(SIGNER_SEED);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWalletAddress.mockResolvedValue(
      Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111'),
    );
    mockGetContractState.mockResolvedValue({ state: 'active' });
    mockGetAlreadyClaimed.mockResolvedValue(0n);
    mockGetJettonData.mockResolvedValue({ walletCode: null });
  });

  test('claimable owner gets custom_payload + transfer_hints', async () => {
    const state = makeState(OWNER, 10n);
    const deps = { state, signer };
    const body = await buildMintlessWalletResponse(OWNER, deps);
    expect(body).not.toBeNull();
    expect(body!.custom_payload.length).toBeGreaterThan(10);
    expect(body!.transfer_hints?.attach_ton_external).toBe('180000000');
  });

  test('already-claimed owner gets 200-shaped body with empty custom_payload + transfer_hints', async () => {
    mockGetAlreadyClaimed.mockResolvedValue(10n);
    const state = makeState(OWNER, 10n);
    const deps = { state, signer };

    const claimable = await buildMintlessWalletResponse(OWNER, deps);
    expect(claimable).toBeNull();

    const hintsOnly = await buildTransferHintsWalletResponse(OWNER, deps);
    expect(hintsOnly).not.toBeNull();
    expect(hintsOnly!.custom_payload).toBe('');
    expect(hintsOnly!.transfer_hints?.attach_ton_external).toBe(RMJ_ATTACH_TON_EXTERNAL_NANO.toString());

    const json = serializeMintlessWalletResponse(hintsOnly!);
    expect(JSON.stringify(json)).toContain('transfer_hints');
    expect(JSON.stringify(json)).toContain('"attach_ton_external":"180000000"');
    // MTW shim fields present, no invalid extra keys
    expect(json.name).toBe('Egg');
    expect(json.symbol).toBe('🥚');
  });
});
