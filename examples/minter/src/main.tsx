import './bufferPolyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { App } from './App';

/** По умолчанию — тот же origin, что и у приложения (Vercel / локально). */
const manifestUrl =
  (import.meta.env.VITE_TONCONNECT_MANIFEST_URL as string | undefined)?.trim() ||
  `${window.location.origin}/tonconnect-manifest.json`;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
);
