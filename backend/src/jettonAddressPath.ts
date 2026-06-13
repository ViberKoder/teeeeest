import { Address } from '@ton/core';
import { config } from './config';

export type JettonMasterIdFormat = 'friendly' | 'raw';

/** EQ…/UQ… for wallets and explorers (default). */
export function jettonMasterFriendly(master: Address): string {
  return master.toString({
    urlSafe: true,
    bounceable: true,
    testOnly: config.TON_NETWORK === 'testnet',
  });
}

/** TEP-style raw `0:…` (unencoded — use in JSON fields). */
export function jettonMasterRaw(master: Address): string {
  return master.toRawString();
}

/** Path segment for `/api/v1/jettons/{id}/…` — friendly EQ by default (no `%3A` encoding). */
export function jettonMasterPathSegment(master: Address, format: JettonMasterIdFormat = 'friendly'): string {
  return format === 'raw' ? jettonMasterRaw(master) : jettonMasterFriendly(master);
}

export function parseJettonMasterPathSegment(param: string): Address | null {
  try {
    const decoded = decodeURIComponent(param.trim());
    return Address.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * On-chain TEP-64 off-chain URI filename (no master in path).
 * Bump when TonAPI/Toncenter cache a stale master at a shared URL:
 * `jetton-metadata.json` → … → `jetton-metadata3.json` → `jetton-metadata4.json`.
 */
export const JETTON_METADATA_FILENAME = 'jetton-metadata4.json';

/** Previous fixed URLs — still served (same JSON) for in-flight indexers. */
export const JETTON_METADATA_FILENAME_LEGACY3 = 'jetton-metadata3.json';

export const JETTON_METADATA_FILENAME_LEGACY2 = 'jetton-metadata2.json';

/** Oldest fixed URL — still served for masters deployed before metadata2 bump. */
export const JETTON_METADATA_FILENAME_LEGACY = 'jetton-metadata.json';

/** All RMJ fixed metadata paths (current first). */
export const JETTON_METADATA_ALL_FILENAMES = [
  JETTON_METADATA_FILENAME,
  JETTON_METADATA_FILENAME_LEGACY3,
  JETTON_METADATA_FILENAME_LEGACY2,
  JETTON_METADATA_FILENAME_LEGACY,
] as const;

/** TEP-177 mintless — separate fixed URL so RMJ and mintless can share one backend. */
export const MINTLESS_JETTON_METADATA_FILENAME = 'mintless-jetton-metadata.json';

/** Fixed TEP-64 URL for RMJ — does not embed master (master must not be in on-chain content URL). */
export function fixedJettonMetadataUrl(publicAppUrl: string): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/${JETTON_METADATA_FILENAME}`;
}

/** Fixed TEP-64 URL for standard TEP-177 mintless jetton. */
export function fixedMintlessJettonMetadataUrl(publicAppUrl: string): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/${MINTLESS_JETTON_METADATA_FILENAME}`;
}

/** Strip `?v=` / hash — on-chain TEP-64 URLs often include epoch cache-bust query. */
export function fixedMetadataUrlPathname(contentUrl: string): string {
  try {
    const url = new URL(contentUrl);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return contentUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
  }
}

export function isFixedJettonMetadataUrl(contentUrl: string): boolean {
  const u = fixedMetadataUrlPathname(contentUrl);
  return (
    JETTON_METADATA_ALL_FILENAMES.some((name) => u.endsWith(`/${name}`)) ||
    u.endsWith(`/${MINTLESS_JETTON_METADATA_FILENAME}`)
  );
}

export function fixedJettonMetadataFilenameFromUrl(contentUrl: string): string | null {
  const u = fixedMetadataUrlPathname(contentUrl);
  for (const name of JETTON_METADATA_ALL_FILENAMES) {
    if (u.endsWith(`/${name}`)) return name;
  }
  if (u.endsWith(`/${MINTLESS_JETTON_METADATA_FILENAME}`)) return MINTLESS_JETTON_METADATA_FILENAME;
  return null;
}

export function customPayloadApiRoot(
  publicAppUrl: string,
  master: Address,
  format: JettonMasterIdFormat = 'friendly',
): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master, format)}`;
}

/** Optional per-master metadata mirror (same JSON as /jetton-metadata.json). */
export function jettonMetadataHostedUrl(publicAppUrl: string, master: Address): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master, 'friendly')}/metadata.json`;
}

/** TEP-177 `mintless_merkle_dump_uri` — full Airdrop HashMap BoC for wallet indexing. */
export function mintlessMerkleDumpUrl(publicAppUrl: string, master: Address): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master, 'friendly')}/merkle-dump.boc`;
}

export function masterFromJettonApiUrl(url: string): Address | null {
  const m = url.trim().match(/\/api\/v1\/jettons\/([^/]+)(?:\/metadata\.json)?\/?$/i);
  if (!m) return null;
  return parseJettonMasterPathSegment(m[1]);
}
