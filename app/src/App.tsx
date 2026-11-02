import { useState } from 'react';
import { cfg } from './config';
import { Home } from './screens/Home';
import { Restore } from './screens/Restore';
import { useWallet } from './state/wallet';
import { Splash } from './ui/Splash';

export function App() {
  const { phase } = useWallet();
  const [splashGone, setSplashGone] = useState(cfg.demo && new URLSearchParams(location.search).get('demo') !== 'splash');
  return (
    <div className="app">
      {phase === 'needs-phrase' && <Restore />}
      {phase === 'ready' && <Home />}
      {!splashGone && <Splash ready={phase !== 'boot'} onFinish={() => setSplashGone(true)} />}
    </div>
  );
}
