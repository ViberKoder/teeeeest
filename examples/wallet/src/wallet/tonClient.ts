import { TonClient } from '@ton/ton';
import { TON_NETWORK, TON_RPC_API_KEY, TON_RPC_ENDPOINT } from '../config';

let cached: TonClient | null = null;

export function getTonClient(): TonClient {
  if (!cached) {
    cached = new TonClient({
      endpoint: TON_RPC_ENDPOINT,
      apiKey: TON_RPC_API_KEY || undefined,
    });
  }
  return cached;
}

export function getNetworkLabel(): string {
  return TON_NETWORK === 'testnet' ? 'Testnet' : 'Mainnet';
}
