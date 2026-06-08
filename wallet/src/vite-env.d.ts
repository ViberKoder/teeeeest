/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TON_NETWORK?: 'mainnet' | 'testnet';
  readonly VITE_TONCENTER_API_KEY?: string;
  readonly VITE_TONAPI_BASE?: string;
  readonly VITE_TONAPI_TOKEN?: string;
  readonly VITE_DEFAULT_RMJ_BACKEND?: string;
  readonly VITE_DEFAULT_RMJ_MASTER?: string;
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

export {};
