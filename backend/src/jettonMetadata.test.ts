import { Address } from '@ton/core';
import {
  buildJettonMetadataJson,
  jettonMetadataHostedUrl,
  parseMasterAddressParam,
  walletResponseMetadataShim,
} from './jettonMetadata';

/** Avoid loading full app config in unit tests. */
jest.mock('./config', () => ({
  config: {
    PUBLIC_APP_URL: '',
    PUBLIC_JETTON_NAME: 'Egg',
    PUBLIC_JETTON_SYMBOL: '🥚',
    PUBLIC_JETTON_DESCRIPTION: 'Most popular egg',
    PUBLIC_JETTON_IMAGE_URL: 'https://example.com/egg.png',
    PUBLIC_MINTLESS_JETTON_NAME: '',
    PUBLIC_MINTLESS_JETTON_SYMBOL: '',
    PUBLIC_MINTLESS_JETTON_DESCRIPTION: '',
    PUBLIC_MINTLESS_JETTON_IMAGE_URL: '',
    PUBLIC_BALANCE_DISPLAY: 'integer',
    TON_NETWORK: 'mainnet',
  },
}));

describe('jettonMetadata', () => {
  const master = Address.parse('EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw');

  test('parseMasterAddressParam accepts EQ and raw', () => {
    expect(parseMasterAddressParam(master.toString({ urlSafe: true, bounceable: true }))?.equals(master)).toBe(
      true,
    );
    expect(parseMasterAddressParam(master.toRawString())?.equals(master)).toBe(true);
  });

  test('custom_payload_api_uri uses friendly EQ master', () => {
    const body = buildJettonMetadataJson(master, {
      publicAppUrl: 'https://example.com',
      name: 'Egg',
      symbol: 'EGG',
      decimals: '0',
    });
    const eq = master.toString({ urlSafe: true, bounceable: true });
    expect(body?.custom_payload_api_uri).toBe(`https://example.com/api/v1/jettons/${eq}`);
    expect(body?.custom_payload_api_uri).not.toContain('%3A');
    expect(body?.custom_payload_api_uri).not.toContain('/custom-payload');
    expect(body?.decimals).toBe('0');
    expect(body?.mintless_merkle_dump_uri).toBe(`https://example.com/api/v1/jettons/${eq}/merkle-dump.boc`);
  });

  test('walletResponseMetadataShim mirrors metadata.json display fields', () => {
    const shim = walletResponseMetadataShim();
    expect(shim).toEqual({
      name: 'Egg',
      symbol: '🥚',
      decimals: '0',
      description: 'Most popular egg',
      image: 'https://example.com/egg.png',
    });
  });

  test('rolling cache-bust on mintless_merkle_dump_uri', () => {
    const body = buildJettonMetadataJson(master, {
      publicAppUrl: 'https://example.com',
      name: 'Egg',
      symbol: 'EGG',
      decimals: '0',
      rollingEpoch: 29,
      rollingRootHex: '0x0cedd9f7',
    });
    const eq = master.toString({ urlSafe: true, bounceable: true });
    expect(body?.mintless_merkle_dump_uri).toBe(
      `https://example.com/api/v1/jettons/${eq}/merkle-dump.boc?epoch=29&root=0x0cedd9f7`,
    );
  });
});
