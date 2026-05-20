import { Address } from '@ton/core';
import {
  buildJettonMetadataJson,
  jettonMetadataHostedUrl,
  parseMasterAddressParam,
} from './jettonMetadata';

/** Avoid loading full app config in unit tests. */
jest.mock('./config', () => ({
  config: {
    PUBLIC_APP_URL: '',
    PUBLIC_JETTON_NAME: '',
    PUBLIC_JETTON_SYMBOL: '',
    PUBLIC_JETTON_DESCRIPTION: '',
    PUBLIC_JETTON_IMAGE_URL: '',
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

  test('jettonMetadataHostedUrl embeds master segment', () => {
    const url = jettonMetadataHostedUrl('https://example.com', master);
    expect(url).toBe(
      `https://example.com/api/v1/jettons/${master.toString({ urlSafe: true, bounceable: true })}/metadata.json`,
    );
  });

  test('buildJettonMetadataJson sets custom_payload_api_uri without trailing slash', () => {
    const body = buildJettonMetadataJson(master, {
      publicAppUrl: 'https://example.com',
      name: 'Egg',
      symbol: 'EGG',
      decimals: '0',
    });
    expect(body?.custom_payload_api_uri).toBe(
      `https://example.com/api/v1/jettons/${master.toString({ urlSafe: true, bounceable: true })}`,
    );
    expect(body?.custom_payload_api_uri).not.toMatch(/\/$/);
    expect(body?.custom_payload_api_uri).not.toContain('/custom-payload');
    expect(body?.decimals).toBe('0');
  });
});
