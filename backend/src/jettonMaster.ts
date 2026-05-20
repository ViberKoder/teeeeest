import { Address } from '@ton/core';
import { config } from './config';

/** Parsed master from `JETTON_MASTER_ADDRESS`, if configured and valid. */
export function configuredJettonMaster(): Address | null {
  const raw = config.JETTON_MASTER_ADDRESS?.trim();
  if (!raw) return null;
  try {
    return Address.parse(raw);
  } catch {
    return null;
  }
}

/** Friendly master segment for URLs and metadata (EQ… / UQ…), matching tonapi / HMSTR style. */
export function jettonMasterUrlSegment(master?: Address): string | null {
  const m = master ?? configuredJettonMaster();
  if (!m) return null;
  return m.toString({
    urlSafe: true,
    bounceable: true,
    testOnly: config.TON_NETWORK === 'testnet',
  });
}

/**
 * TEP offchain-payloads: `custom_payload_api_uri` is the final API root (no trailing slash).
 * Wallets call `GET {uri}/wallet/{owner_raw}`.
 */
export function buildCustomPayloadApiUri(publicAppUrl: string, master?: Address): string | null {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  const seg = jettonMasterUrlSegment(master);
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
