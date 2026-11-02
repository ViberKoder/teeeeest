import './polyfill';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadMatter } from './lib/fonts';
import { bootTelegram } from './lib/tg';
import { WalletProvider } from './state/wallet';
import { ToastProvider } from './ui/toast';
import './styles/tokens.css';
import './styles/app.css';

bootTelegram();
void loadMatter();

// Fixtures live in their own module; with VITE_DEMO unset the branch is dead code and no chunk is emitted.
const Demo = import.meta.env.VITE_DEMO === '1' ? React.lazy(() => import('./demo')) : null;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <WalletProvider>
        <App />
        {Demo && (
          <React.Suspense fallback={null}>
            <Demo />
          </React.Suspense>
        )}
      </WalletProvider>
    </ToastProvider>
  </React.StrictMode>,
);
