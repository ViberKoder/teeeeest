/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TONCONNECT_MANIFEST_URL: string;
  /** testnet | mainnet — должен совпадать с контрактными BOC в constants.ts */
  readonly VITE_NETWORK?: string;
  readonly VITE_DEFAULT_NETWORK?: 'testnet' | 'mainnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
