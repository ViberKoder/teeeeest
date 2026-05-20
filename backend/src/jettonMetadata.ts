import { Address } from '@ton/core';
import { config } from './config';
import {
  customPayloadApiRoot,
  jettonMetadataHostedUrl,
  masterFromJettonApiUrl,
  parseJettonMasterPathSegment,
} from './jettonAddressPath';

/**
 * TEP-64 jetton metadata JSON + TEP offchain-payloads `custom_payload_api_uri`.
 * @see https://github.com/tonkeeper/TEPs2/blob/custom-payload/text/0000-jetton-offchain-payloads.md
 */
export type JettonMetadataJson = Record<string, string>;

/** Parse master from URL path (`0:…` preferred; `EQ…` / `UQ…` accepted). */
export const parseMasterAddressParam = parseJettonMasterPathSegment;

export { jettonMetadataHostedUrl, customPayloadApiRoot, masterFromJettonApiUrl };

/**
 * Build TEP-64 metadata body. `custom_payload_api_uri` is the **final** API root
 * (no trailing slash); wallets call `GET {custom_payload_api_uri}/wallet/{owner_raw}`.
 */
export function buildJettonMetadataJson(
  master: Address,
  opts?: {
    publicAppUrl?: string;
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    decimals?: string;
  },
): JettonMetadataJson | null {
  const base = (opts?.publicAppUrl ?? config.PUBLIC_APP_URL).trim().replace(/\/$/, '');
  const name = (opts?.name ?? config.PUBLIC_JETTON_NAME).trim();
  const symbol = (opts?.symbol ?? config.PUBLIC_JETTON_SYMBOL).trim();
  if (!base || !name || !symbol) {
    return null;
  }

  const customPayloadApiUri = customPayloadApiRoot(base, master);

  const decimals =
    opts?.decimals ??
    (config.PUBLIC_BALANCE_DISPLAY === 'integer' ? '0' : '9');
  const body: JettonMetadataJson = {
    name,
    symbol,
    description:
      (opts?.description ?? config.PUBLIC_JETTON_DESCRIPTION).trim() ||
      `${symbol} — Rolling Mintless Jetton rewards.`,
    decimals,
    custom_payload_api_uri: customPayloadApiUri,
  };

  const image = (opts?.image ?? config.PUBLIC_JETTON_IMAGE_URL).trim();
  if (image) body.image = image;

  return body;
}
