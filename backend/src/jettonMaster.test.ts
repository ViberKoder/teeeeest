import { Address } from '@ton/core';
import { configuredJettonMaster, configuredMintlessJettonMaster, parseJettonMasterParam } from './jettonMaster';

jest.mock('./config', () => ({
  config: {
    JETTON_MASTER_ADDRESS: 'EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw',
    MINTLESS_JETTON_MASTER_ADDRESS: 'EQB5eNZTh5T3ZrWyx-02WpIslZlv9kYdDDM1KPxyU3bR0OSD',
    TON_NETWORK: 'mainnet',
  },
}));

describe('parseJettonMasterParam', () => {
  const rmj = configuredJettonMaster()!;
  const mintless = configuredMintlessJettonMaster()!;

  test('accepts friendly and raw RMJ master', () => {
    expect(parseJettonMasterParam(rmj.toString({ urlSafe: true, bounceable: true }))?.equals(rmj)).toBe(true);
    expect(parseJettonMasterParam(rmj.toRawString())?.equals(rmj)).toBe(true);
  });

  test('accepts friendly and raw TEP-177 master', () => {
    expect(parseJettonMasterParam(mintless.toString({ urlSafe: true, bounceable: true }))?.equals(mintless)).toBe(
      true,
    );
    expect(parseJettonMasterParam(mintless.toRawString())?.equals(mintless)).toBe(true);
  });

  test('rejects unknown master', () => {
    const other = Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111');
    expect(parseJettonMasterParam(other.toRawString())).toBeNull();
  });
});
