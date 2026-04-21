/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RMJ_BACKEND_URL: string;
  readonly VITE_JETTON_MASTER_ADDRESS: string;
  readonly VITE_TONCONNECT_MANIFEST_URL: string;
  readonly VITE_PROJECT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
