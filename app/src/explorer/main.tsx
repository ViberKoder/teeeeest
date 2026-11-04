import '../polyfill';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/onest';
import { Explorer } from './Explorer';
import './explorer.css';

const tg = (window as unknown as { Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } } }).Telegram?.WebApp;
tg?.ready?.();
tg?.expand?.();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Explorer />
  </React.StrictMode>,
);
