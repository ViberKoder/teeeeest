import { Address } from '@ton/core';
import { customPayloadApiRoot, mintlessMerkleDumpUrl } from './buildMaster';
import { NETWORK } from './constants';

export type JettonKind = 'rmj' | 'mintless';

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
  kind?: JettonKind;
}): Record<string, string> {
  const testnet = NETWORK === 'testnet';
  const kind = opts.kind ?? 'rmj';
  const defaultDescription =
    kind === 'mintless'
      ? `${opts.symbol.trim()} — TEP-177 Mintless Jetton.`
      : `${opts.symbol.trim()} — Rolling Mintless Jetton.`;
  const o: Record<string, string> = {
    name: opts.name.trim(),
    symbol: opts.symbol.trim(),
    description: opts.description.trim() || defaultDescription,
    decimals: '0',
    custom_payload_api_uri: customPayloadApiRoot(opts.backendBaseUrl, opts.master, testnet),
    mintless_merkle_dump_uri: mintlessMerkleDumpUrl(opts.backendBaseUrl, opts.master, testnet),
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
  kind?: JettonKind;
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
      kind: opts.kind,
    }),
    null,
    2,
  );
}
