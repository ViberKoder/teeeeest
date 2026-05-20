import { Address } from '@ton/core';
import { config } from './config';
import { buildCustomPayloadApiUri, jettonMasterUrlSegment } from './jettonMaster';

/**
 * TEP-64 jetton metadata JSON + TEP offchain-payloads `custom_payload_api_uri`.
 * @see https://github.com/tonkeeper/TEPs2/blob/custom-payload/text/0000-jetton-offchain-payloads.md
 */
export type JettonMetadataJson = Record<string, string>;

/** Parse master from URL path (`EQ…` / `UQ…` / `0:…`). Does not require env match. */
export function parseMasterAddressParam(param: string): Address | null {
  try {
    return Address.parse(decodeURIComponent(param.trim()));
  } catch {
    return null;
  }
}

/** Canonical hosted metadata URL for on-chain TEP-64 `content` (includes master in path). */
export function jettonMetadataHostedUrl(publicAppUrl: string, master: Address): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  const seg = jettonMasterUrlSegment(master);
  if (!base || !seg) {
    throw new Error('invalid publicAppUrl or master for metadata URL');
  }
  return `${base}/api/v1/jettons/${seg}/metadata.json`;
}

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

  const customPayloadApiUri = buildCustomPayloadApiUri(base, master);
  if (!customPayloadApiUri) {
    return null;
  }

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
