/** TEP-176 `compressed_info` — all fields are decimal strings (TonAPI / Toncenter). */
export type MintlessCompressedInfo = {
  amount: string;
  start_from: string;
  expired_at: string;
};

/** Tonkeeper claim-api-go: attach custom_payload only inside [start_from, expired_at]. */
export function isWithinClaimWindow(
  startFrom: number,
  expiredAt: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return startFrom <= nowSec && nowSec <= expiredAt;
}

export function formatCompressedInfo(params: {
  amount: bigint;
  startFrom: number;
  expiredAt: number;
}): MintlessCompressedInfo {
  return {
    amount: params.amount.toString(),
    start_from: String(params.startFrom),
    expired_at: String(params.expiredAt),
  };
}
