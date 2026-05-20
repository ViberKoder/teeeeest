import { Address } from '@ton/core';

/**
 * Canonical jetton master id in URL paths (TEP offchain-payloads example uses raw `0:…`).
 * Always use encodeURIComponent — colon is safe in path but we decode on read.
 */
export function jettonMasterPathSegment(master: Address): string {
  return encodeURIComponent(master.toRawString());
}

export function parseJettonMasterPathSegment(param: string): Address | null {
  try {
    return Address.parse(decodeURIComponent(param.trim()));
  } catch {
    return null;
  }
}

export function jettonMetadataHostedUrl(publicAppUrl: string, master: Address): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master)}/metadata.json`;
}

export function customPayloadApiRoot(publicAppUrl: string, master: Address): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master)}`;
}

/** Extract master from a metadata or API root URL; null if pattern mismatch. */
export function masterFromJettonApiUrl(url: string): Address | null {
  const m = url.trim().match(/\/api\/v1\/jettons\/([^/]+)(?:\/metadata\.json)?\/?$/i);
  if (!m) return null;
  return parseJettonMasterPathSegment(m[1]);
}
