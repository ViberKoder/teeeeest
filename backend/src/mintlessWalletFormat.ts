/** TEP-176 `compressed_info` — all fields are decimal strings (TonAPI / Toncenter). */
export type MintlessCompressedInfo = {
  amount: string;
  start_from: string;
  expired_at: string;
};

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
