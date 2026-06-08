import './bufferPolyfill';
import './ui/theme.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { initTma } from './services/tma';

initTma();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
