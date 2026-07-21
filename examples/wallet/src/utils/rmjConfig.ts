import { jettonMasterPathSegment } from '@rmj/sdk';
import { RMJ_BACKEND_URL, RMJ_JETTON_MASTER, TON_NETWORK } from '../config';

/** Project RMJ is wired when both backend and master are set at build time. */
export function isRmjConfigured(): boolean {
  return Boolean(RMJ_BACKEND_URL && RMJ_JETTON_MASTER);
}

/** TEP-177 custom_payload API root for the configured RMJ master. */
export function configuredRmjCustomPayloadApiUri(): string | undefined {
  if (!isRmjConfigured()) return undefined;
  const masterSeg = jettonMasterPathSegment(RMJ_JETTON_MASTER, TON_NETWORK);
  return `${RMJ_BACKEND_URL}/api/v1/jettons/${masterSeg}`;
}
