import { Address } from '@ton/core';
import { config } from './config';
import {
  customPayloadApiRoot,
  fixedJettonMetadataUrl,
  fixedMintlessJettonMetadataUrl,
  jettonMetadataHostedUrl,
  jettonMasterFriendly,
  jettonMasterRaw,
  masterFromJettonApiUrl,
  mintlessMerkleDumpUrl,
  parseJettonMasterPathSegment,
} from './jettonAddressPath';
import { cacheBustedMerkleDumpUri } from './metadataUriUtils';

/**
 * TEP-64 jetton metadata JSON + TEP offchain-payloads `custom_payload_api_uri`.
 * @see https://github.com/tonkeeper/TEPs2/blob/custom-payload/text/0000-jetton-offchain-payloads.md
 */
export type JettonMetadataJson = Record<string, string>;

/** Parse master from URL path (`0:…` preferred; `EQ…` / `UQ…` accepted). */
export const parseMasterAddressParam = parseJettonMasterPathSegment;

export {
  jettonMetadataHostedUrl,
  customPayloadApiRoot,
  masterFromJettonApiUrl,
  fixedJettonMetadataUrl,
  fixedMintlessJettonMetadataUrl,
  jettonMasterFriendly,
  jettonMasterRaw,
  mintlessMerkleDumpUrl,
};
export { epochMetadataUri, cacheBustedMerkleDumpUri } from './metadataUriUtils';

/**
 * Build TEP-64 metadata body. `custom_payload_api_uri` is the **final** API root
 * (no trailing slash); wallets call `GET {custom_payload_api_uri}/wallet/{owner_raw}`.
 */
export type JettonMetadataKind = 'rmj' | 'mintless';

function envMintlessDisplayFields(): {
  name: string;
  symbol: string;
  description: string;
  image: string;
} {
  const name = config.PUBLIC_MINTLESS_JETTON_NAME.trim() || config.PUBLIC_JETTON_NAME.trim();
  const symbol = config.PUBLIC_MINTLESS_JETTON_SYMBOL.trim() || config.PUBLIC_JETTON_SYMBOL.trim();
  const description =
    config.PUBLIC_MINTLESS_JETTON_DESCRIPTION.trim() || config.PUBLIC_JETTON_DESCRIPTION.trim();
  const image = config.PUBLIC_MINTLESS_JETTON_IMAGE_URL.trim() || config.PUBLIC_JETTON_IMAGE_URL.trim();
  return { name, symbol, description, image };
}

export function buildJettonMetadataJson(
  master: Address,
  opts?: {
    publicAppUrl?: string;
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    decimals?: string;
    kind?: JettonMetadataKind;
    /** Rolling RMJ: cache-bust dump URI for TonAPI/Toncenter re-index each epoch. */
    rollingEpoch?: number;
    rollingRootHex?: string;
  },
): JettonMetadataJson | null {
  const base = (opts?.publicAppUrl ?? config.PUBLIC_APP_URL).trim().replace(/\/$/, '');
  const kind = opts?.kind ?? 'rmj';
  const mintlessEnv = kind === 'mintless' ? envMintlessDisplayFields() : null;
  const name = (opts?.name ?? mintlessEnv?.name ?? config.PUBLIC_JETTON_NAME).trim();
  const symbol = (opts?.symbol ?? mintlessEnv?.symbol ?? config.PUBLIC_JETTON_SYMBOL).trim();
  if (!base || !name || !symbol) {
    return null;
  }

  const customPayloadApiUri = customPayloadApiRoot(base, master);
  const merkleDumpBase = mintlessMerkleDumpUrl(base, master);
  const merkleDumpUri =
    opts?.rollingEpoch != null && opts?.rollingRootHex
      ? cacheBustedMerkleDumpUri(merkleDumpBase, opts.rollingEpoch, opts.rollingRootHex)
      : merkleDumpBase;

  const decimals =
    opts?.decimals ??
    (config.PUBLIC_BALANCE_DISPLAY === 'integer' ? '0' : '9');
  const defaultDescription =
    kind === 'mintless'
      ? `${symbol} — TEP-177 Mintless Jetton.`
      : `${symbol} — Rolling Mintless Jetton rewards.`;
  const body: JettonMetadataJson = {
    name,
    symbol,
    description:
      (opts?.description ?? mintlessEnv?.description ?? config.PUBLIC_JETTON_DESCRIPTION).trim() ||
      defaultDescription,
    decimals,
    custom_payload_api_uri: customPayloadApiUri,
    mintless_merkle_dump_uri: merkleDumpUri,
  };

  const image = (opts?.image ?? mintlessEnv?.image ?? config.PUBLIC_JETTON_IMAGE_URL).trim();
  if (image) body.image = image;

  return body;
}
