import { TonClient } from '@ton/ton';
import { config } from './config';

/** Shared Toncenter / RPC client for read-only chain queries (same wiring as root updater). */
export function createTonClient(): TonClient {
  const endpoint =
    config.TON_RPC_ENDPOINT ||
    (config.TON_NETWORK === 'mainnet'
      ? 'https://toncenter.com/api/v2/jsonRPC'
      : 'https://testnet.toncenter.com/api/v2/jsonRPC');

  return new TonClient({
    endpoint,
    apiKey: config.TON_RPC_API_KEY || undefined,
  });
}
