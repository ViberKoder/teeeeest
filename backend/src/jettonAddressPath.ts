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

/** Fixed TEP-64 URL — does not embed master (master must not be in on-chain content URL). */
export function fixedJettonMetadataUrl(publicAppUrl: string): string {
  const base = publicAppUrl.trim().replace(/\/$/, '');
  return `${base}/jetton-metadata.json`;
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

export function masterFromJettonApiUrl(url: string): Address | null {
  const m = url.trim().match(/\/api\/v1\/jettons\/([^/]+)(?:\/metadata\.json)?\/?$/i);
  if (!m) return null;
  return parseJettonMasterPathSegment(m[1]);
}
