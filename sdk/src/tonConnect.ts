/**
 * Helpers to produce a TON Connect transaction from a Proof API response.
 *
 * The Rolling Mintless Jetton claim is piggy-backed on a normal TEP-74
 * jetton transfer — the user initiates a transfer via their connected
 * wallet, and the jetton-wallet automatically materializes any unclaimed
 * cumulative amount before forwarding the transfer.
 *
 * This helper takes the `CustomPayloadInfo` returned by
 * `RMJClient.getCustomPayload()` and builds a TON Connect-compatible
 * transaction envelope pointing at the user's own jetton-wallet address.
 *
 * Consumers are responsible for:
 *
 *   1. Computing the user's jetton-wallet address for this Jetton. The
 *      easiest path is to call `get_wallet_address(owner)` on the master;
 *      the backend's `/api/v1/status` exposes the master address.
 *   2. Choosing the recipient of the transfer (self-transfer for plain
 *      "sync my balance to wallet", or a DEX / friend for a real swap /
 *      transfer).
 */

import type { CustomPayloadInfo } from './client';

export interface JettonTransferParams {
  /** User's jetton-wallet address (string form, any format). */
  userJettonWallet: string;
  /** Destination of the jetton transfer. Pass user's own main address to 'sync'. */
  toOwner: string;
  /** Jetton amount to transfer in nano units. Use '0' for sync-only. */
  jettonAmountNano: string;
  /** Forward TON amount to destination's jetton-wallet (0 for no notification). */
  forwardTonAmountNano?: string;
  /** Address to receive the response / excess TON. */
  responseAddress?: string;
  /** Custom payload info from the Proof API. */
  payload: CustomPayloadInfo;
  /** Query ID; any unique uint64. Default: current unix seconds. */
  queryId?: string;
}

export interface TonConnectTransaction {
  validUntil: number;
  messages: Array<{
    address: string;
    amount: string; // nano TON as string
    payload?: string;
    stateInit?: string;
  }>;
}

/**
 * Build a TON Connect `sendTransaction` payload that triggers a jetton
 * transfer with the rolling-claim custom payload attached.
 *
 * This assumes you've already constructed the appropriate transfer body
 * using @ton/core (see `buildJettonTransferBody` below) — for convenience
 * the inner helper is provided.
 */
export function buildTonConnectTx(
  params: JettonTransferParams & { body: string; walletAttachedTonNano: string },
  validUntilSec: number = Math.floor(Date.now() / 1000) + 5 * 60,
): TonConnectTransaction {
  return {
    validUntil: validUntilSec,
    messages: [
      {
        address: params.userJettonWallet,
        amount: params.walletAttachedTonNano,
        payload: params.body,
        stateInit: params.payload.stateInit ?? undefined,
      },
    ],
  };
}
