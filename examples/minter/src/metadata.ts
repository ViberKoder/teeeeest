import { Address } from '@ton/core';
import { customPayloadApiRoot } from './buildMaster';

/**
 * TEP-64 JSON served at `…/api/v1/jettons/{master}/metadata.json`.
 * Call with **planned master** from `computePlannedDeploy` (before on-chain deploy).
 */
export function buildJettonMetadataJson(opts: {
  name: string;
  symbol: string;
  description: string;
  image: string;
  backendBaseUrl: string;
  master: Address;
}): Record<string, string> {
  const o: Record<string, string> = {
    name: opts.name.trim(),
    symbol: opts.symbol.trim(),
    description: opts.description.trim() || `${opts.symbol.trim()} — Rolling Mintless Jetton.`,
    decimals: '0',
    custom_payload_api_uri: customPayloadApiRoot(opts.backendBaseUrl, opts.master),
  };
  const img = opts.image.trim();
  if (img) o.image = img;
  return o;
}

export function buildStandaloneJettonMetadataJson(opts: {
  name: string;
  symbol: string;
  description: string;
  image: string;
  backendBaseUrl: string;
  jettonMasterAddress: string;
}): string {
  const master = Address.parse(opts.jettonMasterAddress.trim());
  return JSON.stringify(
    buildJettonMetadataJson({
      name: opts.name,
      symbol: opts.symbol,
      description: opts.description,
      image: opts.image,
      backendBaseUrl: opts.backendBaseUrl,
      master,
    }),
    null,
    2,
  );
}
