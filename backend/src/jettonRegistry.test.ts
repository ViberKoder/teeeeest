import { Address } from '@ton/core';
import { buildJettonMetadataJson } from './jettonMetadata';
import { loadJettonRegistry, saveJettonRegistry } from './jettonRegistry';
import type { AppStore } from './store/appStore';

jest.mock('./config', () => ({
  config: {
    PUBLIC_APP_URL: 'https://example.com',
    PUBLIC_JETTON_NAME: 'EnvName',
    PUBLIC_JETTON_SYMBOL: 'ENV',
    PUBLIC_JETTON_DESCRIPTION: '',
    PUBLIC_JETTON_IMAGE_URL: '',
    PUBLIC_BALANCE_DISPLAY: 'integer',
    TON_NETWORK: 'mainnet',
  },
}));

function memoryStore(): AppStore {
  const kv = new Map<string, string>();
  return {
    init: async () => {},
    close: async () => {},
    getKv: async (k) => kv.get(k) ?? null,
    setKv: async (k, v) => {
      kv.set(k, v);
    },
    listUsersForHydration: async () => [],
    insertUserIfNotExists: async () => {},
    getUserRow: async () => undefined,
    countTapEventsSince: async () => 0,
    applyRewardAndTap: async () => {},
    getCumulativeAmount: async () => undefined,
    sumCumulativeNonBanned: async () => '0',
    setBan: async () => {},
    listActiveSince: async () => [],
    getUserTapStats: async () => ({
      non_banned_users: 0,
      max_last_tapped_at: 0,
      max_tap_event_at: 0,
    }),
    insertEpoch: async () => {},
    updateEpochCommitted: async () => {},
  };
}

describe('jettonRegistry', () => {
  const master = Address.parse('EQA12V9KvKUMrX9uWvG92_xT1l6iMR3Dg3YsCbY8n3wAunWN');

  test('registry overrides env display fields', async () => {
    const store = memoryStore();
    await saveJettonRegistry(store, master, {
      name: 'TapCoin',
      symbol: 'TAP',
      description: 'My game token',
      image: 'https://example.com/tap.png',
      decimals: '0',
    });
    const reg = await loadJettonRegistry(store, master);
    expect(reg?.name).toBe('TapCoin');

    const body = buildJettonMetadataJson(master, {
      publicAppUrl: 'https://example.com',
      name: reg!.name,
      symbol: reg!.symbol,
      description: reg!.description,
      image: reg!.image,
      decimals: reg!.decimals,
    });
    expect(body?.name).toBe('TapCoin');
    expect(body?.symbol).toBe('TAP');
    expect(body?.custom_payload_api_uri).toContain('EQA12V9KvKUMrX9uWvG92');
    expect(body?.mintless_merkle_dump_uri).toContain('merkle-dump.boc');
  });
});
