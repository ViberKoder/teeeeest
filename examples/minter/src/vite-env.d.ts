/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TONCONNECT_MANIFEST_URL: string;
  readonly VITE_DEFAULT_NETWORK?: 'testnet' | 'mainnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
