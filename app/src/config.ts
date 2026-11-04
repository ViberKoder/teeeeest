const env = import.meta.env;

export type Network = 'mainnet' | 'testnet';

export const cfg = {
  apiUrl: ((env.VITE_API_URL as string) || '').replace(/\/$/, ''),
  network: ((env.VITE_NETWORK as string) === 'testnet' ? 'testnet' : 'mainnet') as Network,
  master: (env.VITE_JETTON_MASTER as string) || '',
  bot: (env.VITE_BOT_USERNAME as string) || 'hatchapp',
  /** the bot's own wallet: it writes the public stats beacon the explorer reads */
  vault: (env.VITE_VAULT_ADDRESS as string) || '',
  toncenterKey: (env.VITE_TONCENTER_KEY as string) || '',
  tonapiKey: (env.VITE_TONAPI_KEY as string) || '',
  publicUrl: ((env.VITE_PUBLIC_URL as string) || '').replace(/\/$/, ''),
  demo: env.VITE_DEMO === '1',
  token: { symbol: 'EGG', decimals: 9 },
  ton: { symbol: 'TON', decimals: 9 },
} as const;

export const endpoints = {
  toncenter:
    cfg.network === 'testnet'
      ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
      : 'https://toncenter.com/api/v2/jsonRPC',
  tonapi: cfg.network === 'testnet' ? 'https://testnet.tonapi.io' : 'https://tonapi.io',
  explorer: cfg.network === 'testnet' ? 'https://testnet.tonviewer.com' : 'https://tonviewer.com',
};
