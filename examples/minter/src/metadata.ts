import { Address } from '@ton/core';
import { NETWORK } from './constants';

/**
 * Same shape as backend `GET /api/v1/jettons/{master}/metadata.json`.
 * `custom_payload_api_uri` must be the final API root (…/api/v1/jettons/{master}), no trailing slash.
 */
export function buildStandaloneJettonMetadataJson(opts: {
  name: string;
  symbol: string;
  description: string;
  image: string;
  backendBaseUrl: string;
  jettonMasterAddress: string;
}): string {
  const base = opts.backendBaseUrl.trim().replace(/\/$/, '');
  const masterSeg = Address.parse(opts.jettonMasterAddress.trim()).toString({
    urlSafe: true,
    bounceable: true,
    testOnly: NETWORK === 'testnet',
  });
  const o: Record<string, string> = {
    name: opts.name.trim(),
    symbol: opts.symbol.trim(),
    description: opts.description.trim() || `${opts.symbol.trim()} — Rolling Mintless Jetton.`,
    decimals: '0',
    custom_payload_api_uri: `${base}/api/v1/jettons/${masterSeg}`,
  };
  const img = opts.image.trim();
  if (img) o.image = img;
  return JSON.stringify(o, null, 2);
}
