/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RMJ_BACKEND_URL?: string;
  readonly VITE_JETTON_MASTER_ADDRESS?: string;
  readonly VITE_TONAPI_KEY?: string;
  readonly VITE_TON_NETWORK?: string;
  readonly VITE_TONCONNECT_MANIFEST_URL?: string;
  readonly VITE_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
