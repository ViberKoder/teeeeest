import { Address } from '@ton/core';
import { config } from './config';

export function configuredJettonMaster(): Address | null {
  const raw = config.JETTON_MASTER_ADDRESS?.trim();
  if (!raw) return null;
  try {
    return Address.parse(raw);
  } catch {
    return null;
  }
}

export function jettonMasterUrlSegment(master?: Address): string | null {
  const m = master ?? configuredJettonMaster();
  if (!m) return null;
  return m.toString({
    urlSafe: true,
    bounceable: true,
    testOnly: config.TON_NETWORK === 'testnet',
  });
}

export function buildCustomPayloadApiUri(publicAppUrl: string): string | null {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  const seg = jettonMasterUrlSegment();
  if (!base || !seg) return null;
  return `${base}/api/v1/jettons/${seg}`;
}

export function parseJettonMasterParam(param: string): Address | null {
  const expected = configuredJettonMaster();
  if (!expected) return null;
  try {
    const requested = Address.parse(decodeURIComponent(param));
    return requested.equals(expected) ? expected : null;
  } catch {
    return null;
  }
}
