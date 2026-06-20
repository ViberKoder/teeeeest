import { Address } from '@ton/core';
import { config } from './config';
import {
  customPayloadApiRoot,
  jettonMasterPathSegment,
  parseJettonMasterPathSegment,
} from './jettonAddressPath';

function parseConfiguredMaster(raw: string | undefined): Address | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    return Address.parse(t);
  } catch {
    return null;
  }
}

/** Parsed master from `JETTON_MASTER_ADDRESS`, if configured and valid. */
export function configuredJettonMaster(): Address | null {
  return parseConfiguredMaster(config.JETTON_MASTER_ADDRESS);
}

/** Parsed master from `MINTLESS_JETTON_MASTER_ADDRESS` (TEP-177 fixed metadata URL). */
export function configuredMintlessJettonMaster(): Address | null {
  return parseConfiguredMaster(config.MINTLESS_JETTON_MASTER_ADDRESS);
}

/**
 * Master for `GET /mintless-jetton-metadata.json`.
 * RMJ rolling mintless uses `JETTON_MASTER_ADDRESS` for both metadata URLs when set;
 * pure TEP-177-only backends fall back to `MINTLESS_JETTON_MASTER_ADDRESS`.
 */
export function masterForHostedMintlessMetadata(): Address | null {
  return configuredJettonMaster() ?? configuredMintlessJettonMaster();
}

/** Raw `0:…` path segment (canonical; also accepts EQ/UQ when parsing). */
export function jettonMasterUrlSegment(master?: Address): string | null {
  const m = master ?? masterForHostedMintlessMetadata();
  if (!m) return null;
  return jettonMasterPathSegment(m);
}

/**
 * TEP offchain-payloads: `custom_payload_api_uri` is the final API root (no trailing slash).
 * Wallets call `GET {uri}/wallet/{owner_raw}`.
 */
export function buildCustomPayloadApiUri(publicAppUrl: string, master?: Address): string | null {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  const m = master ?? masterForHostedMintlessMetadata();
  if (!base || !m) return null;
  return customPayloadApiRoot(base, m);
}

export function parseJettonMasterParam(param: string): Address | null {
  const requested = parseJettonMasterPathSegment(param);
  if (!requested) return null;

  const configured = [configuredJettonMaster(), configuredMintlessJettonMaster()].filter(
    (value): value is Address => value != null,
  );
  const match = configured.find((known) => known.equals(requested));
  return match ?? null;
}

export { jettonMasterPathSegment, parseJettonMasterPathSegment, customPayloadApiRoot, jettonMetadataHostedUrl } from './jettonAddressPath';
