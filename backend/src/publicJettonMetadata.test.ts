import { Address } from '@ton/core';
import { buildJettonMetadataJson } from './jettonMetadata';

jest.mock('./config', () => ({
  config: {
    PUBLIC_APP_URL: 'https://example.com',
    PUBLIC_JETTON_NAME: 'Egg',
    PUBLIC_JETTON_SYMBOL: 'EGG',
    PUBLIC_JETTON_DESCRIPTION: '',
    PUBLIC_JETTON_IMAGE_URL: '',
    PUBLIC_BALANCE_DISPLAY: 'integer',
    TON_NETWORK: 'mainnet',
  },
}));

describe('metadata dump URI uses live rolling root', () => {
  const master = Address.parse('EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw');

  test('rollingEpoch in JSON must match supplied root (not stale ?v= from on-chain URL)', () => {
    const body = buildJettonMetadataJson(master, {
      publicAppUrl: 'https://example.com',
      name: 'Egg',
      symbol: 'EGG',
      rollingEpoch: 31,
      rollingRootHex: '0xdeadbeef',
    });
    expect(body?.mintless_merkle_dump_uri).toContain('epoch=31');
    expect(body?.mintless_merkle_dump_uri).toContain('root=0xdeadbeef');
    expect(body?.mintless_merkle_dump_uri).not.toContain('epoch=4');
  });
});
