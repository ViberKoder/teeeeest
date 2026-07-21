export type TonNetwork = 'mainnet' | 'testnet';

function env(key: string): string {
  return (process.env[key] as string | undefined)?.trim() || '';
}

export const TON_NETWORK: TonNetwork =
  env('NEXT_PUBLIC_TON_NETWORK') === 'testnet' ? 'testnet' : 'mainnet';

export const RMJ_BACKEND_URL = env('NEXT_PUBLIC_RMJ_BACKEND_URL').replace(/\/$/, '');

export const RMJ_JETTON_MASTER = env('NEXT_PUBLIC_JETTON_MASTER_ADDRESS');

export const TONAPI_KEY = env('NEXT_PUBLIC_TONAPI_KEY');

export const TONAPI_BASE =
  TON_NETWORK === 'testnet' ? 'https://testnet.tonapi.io' : 'https://tonapi.io';

export const TON_RPC_ENDPOINT =
  env('NEXT_PUBLIC_TON_RPC_ENDPOINT') ||
  (TON_NETWORK === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC');

export const TON_RPC_API_KEY = env('NEXT_PUBLIC_TON_RPC_API_KEY');

/** Auto-lock after N minutes of inactivity. */
export const AUTO_LOCK_MINUTES = 15;
