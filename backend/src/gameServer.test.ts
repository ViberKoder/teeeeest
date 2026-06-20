import { Address } from '@ton/core';
import { AirdropState } from './state';
import { GameServer } from './gameServer';
import type { AppStore } from './store/appStore';

jest.mock('./config', () => ({
  config: {
    TAP_VALUE_NANO: 1n,
    MAX_TAPS_PER_SECOND: 100,
    MAX_TAPS_PER_DAY: 1_000_000,
    JETTON_MAX_SUPPLY_NANO: 0n,
    PROOF_VALIDITY_WINDOW_DAYS: 365,
    LOG_LEVEL: 'silent',
  },
}));

function makeStore(): AppStore {
  const users = new Map<string, { cumulative_amount: string; is_banned: number; last_tapped_at: number }>();
  return {
    insertUserIfNotExists: async (address: string, now: number) => {
      if (!users.has(address)) {
        users.set(address, { cumulative_amount: '0', is_banned: 0, last_tapped_at: now });
      }
    },
    getUserRow: async (address: string) => users.get(address) ?? null,
    countTapEventsSince: async () => 0,
    applyRewardAndTap: async ({
      address,
      newCumulative,
      now,
    }: {
      address: string;
      newCumulative: string;
      now: number;
    }) => {
      const row = users.get(address);
      if (row) {
        row.cumulative_amount = newCumulative;
        row.last_tapped_at = now;
      }
    },
    sumCumulativeNonBanned: async () => '0',
    getCumulativeAmount: async (address: string) => users.get(address)?.cumulative_amount ?? null,
    listUsersForHydration: async () => [],
    getKv: async () => null,
    setKv: async () => {},
    insertEpoch: async () => {},
    updateEpochCommitted: async () => {},
    getUserTapStats: async () => ({
      non_banned_users: users.size,
      max_last_tapped_at: 0,
      max_tap_event_at: 0,
    }),
    close: async () => {},
  } as unknown as AppStore;
}

describe('GameServer immediate Merkle sync', () => {
  test('recordAction updates in-memory tree for Proof API', async () => {
    const store = makeStore();
    const state = await AirdropState.hydrate(store);
    const gameServer = new GameServer(store, state);
    const owner = Address.parse('0:2222222222222222222222222222222222222222222222222222222222222222');

    const result = await gameServer.recordAction({ address: owner, source: 'api' });
    expect(result.ok).toBe(true);
    expect(state.tree.has(owner)).toBe(true);
    expect(state.tree.get(owner)?.cumulativeAmount).toBe(1n);
  });
});
