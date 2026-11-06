import '../polyfill';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/onest';
import { applyRemoteConfig } from '../lib/remoteConfig';
import { bootTelegram } from '../lib/tg';
import { WalletProvider } from '../state/wallet';
import { ToastProvider } from '../ui/toast';
import '../styles/tokens.css';
import '../styles/app.css';
import './admin.css';
import { Admin } from './Admin';

bootTelegram();
void applyRemoteConfig().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <WalletProvider>
          <Admin />
        </WalletProvider>
      </ToastProvider>
    </React.StrictMode>,
  ),
);
