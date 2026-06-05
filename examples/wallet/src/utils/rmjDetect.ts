import { Address } from '@ton/core';
import { RMJ_BACKEND_URL, RMJ_JETTON_MASTER } from '../config';

/** Whether this jetton master is the configured RMJ project token. */
export function isConfiguredRmjMaster(master: string): boolean {
  if (!RMJ_JETTON_MASTER) return false;
  try {
    return Address.parse(master).equals(Address.parse(RMJ_JETTON_MASTER));
  } catch {
    return false;
  }
}

/**
 * Detect RMJ / mintless jettons via TEP offchain-payloads metadata.
 * Any jetton with `custom_payload_api_uri` is treated as mintless-capable.
 */
export function isMintlessJetton(customPayloadApiUri?: string): boolean {
  return Boolean(customPayloadApiUri?.trim());
}

/** Resolve RMJ backend base URL for a jetton (configured master or API root host match). */
export function resolveRmjBackendForJetton(
  jettonMaster: string,
  customPayloadApiUri?: string,
): string | null {
  if (isConfiguredRmjMaster(jettonMaster) && RMJ_BACKEND_URL) {
    return RMJ_BACKEND_URL;
  }

  const api = customPayloadApiUri?.trim().replace(/\/$/, '');
  if (!api) return null;

  // Mintless API paths: …/api/v1/jettons/{master} or legacy roots
  if (RMJ_BACKEND_URL && api.startsWith(RMJ_BACKEND_URL)) {
    return RMJ_BACKEND_URL;
  }

  // External RMJ deployments: use the host from custom_payload_api_uri
  try {
    const u = new URL(api);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Extract jetton master from a custom_payload_api_uri when possible. */
export function masterFromCustomPayloadApi(apiUri: string): string | null {
  const trimmed = apiUri.trim().replace(/\/$/, '');
  const match = trimmed.match(/\/jettons\/([^/]+)$/i);
  return match?.[1] ?? null;
}
