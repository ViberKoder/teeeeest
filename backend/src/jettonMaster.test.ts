import { Address } from '@ton/core';

type ConfigOverrides = {
  JETTON_MASTER_ADDRESS?: string;
  MINTLESS_JETTON_MASTER_ADDRESS?: string;
  TON_NETWORK?: 'mainnet' | 'testnet';
};

function loadModule(overrides: ConfigOverrides = {}) {
  jest.resetModules();
  jest.doMock('./config', () => ({
    config: {
      JETTON_MASTER_ADDRESS: '',
      MINTLESS_JETTON_MASTER_ADDRESS: '',
      TON_NETWORK: 'mainnet',
      ...overrides,
    },
  }));
  return require('./jettonMaster') as typeof import('./jettonMaster');
}

describe('jettonMaster', () => {
  const rmj = Address.parse('EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw');
  const mintless = Address.parse(
    '0:1111111111111111111111111111111111111111111111111111111111111111',
  );

  afterEach(() => {
    jest.dontMock('./config');
  });

  test('parseJettonMasterParam accepts both RMJ and mintless masters', () => {
    const mod = loadModule({
      JETTON_MASTER_ADDRESS: rmj.toRawString(),
      MINTLESS_JETTON_MASTER_ADDRESS: mintless.toRawString(),
    });

    expect(mod.parseJettonMasterParam(rmj.toRawString())?.equals(rmj)).toBe(true);
    expect(mod.parseJettonMasterParam(mintless.toRawString())?.equals(mintless)).toBe(true);
  });

  test('buildCustomPayloadApiUri falls back to mintless master when RMJ is not configured', () => {
    const mod = loadModule({
      JETTON_MASTER_ADDRESS: '',
      MINTLESS_JETTON_MASTER_ADDRESS: mintless.toRawString(),
    });

    const apiUri = mod.buildCustomPayloadApiUri('https://example.com');
    expect(apiUri).toBe(
      `https://example.com/api/v1/jettons/${mintless.toString({ urlSafe: true, bounceable: true })}`,
    );
  });
});
