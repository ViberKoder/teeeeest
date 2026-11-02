import { useState } from 'react';
import { cfg } from './config';
import { Home } from './screens/Home';
import { Restore } from './screens/Restore';
import { useWallet } from './state/wallet';
import { Splash } from './ui/Splash';

export function App() {
  const { phase, retryBoot } = useWallet();
  const [splashGone, setSplashGone] = useState(cfg.demo && new URLSearchParams(location.search).get('demo') !== 'splash');
  return (
    <div className="app">
      {phase === 'needs-phrase' && <Restore />}
      {phase === 'ready' && <Home />}
      {phase === 'offline' && (
        <div className="screen" style={{ textAlign: 'center', paddingTop: 80 }}>
          <h2 style={{ margin: 0 }}>Can’t reach Telegram</h2>
          <p className="hint" style={{ margin: '10px auto 18px', maxWidth: 300 }}>Your wallet is looked up before anything is created, so it can never be duplicated. Check your connection and try again.</p>
          <button className="btn" onClick={retryBoot}>Try again</button>
        </div>
      )}
      {!splashGone && <Splash ready={phase !== 'boot'} onFinish={() => setSplashGone(true)} />}
    </div>
  );
}
