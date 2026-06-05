export type TonNetwork = 'mainnet' | 'testnet';

export const TON_NETWORK: TonNetwork =
  (import.meta.env.VITE_TON_NETWORK as string | undefined) === 'testnet' ? 'testnet' : 'mainnet';

export const RMJ_BACKEND_URL = (import.meta.env.VITE_RMJ_BACKEND_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

export const RMJ_JETTON_MASTER = (import.meta.env.VITE_JETTON_MASTER_ADDRESS as string | undefined)?.trim() || '';

export const TONAPI_KEY = (import.meta.env.VITE_TONAPI_KEY as string | undefined)?.trim() || '';

export const TONAPI_BASE =
  TON_NETWORK === 'testnet' ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
