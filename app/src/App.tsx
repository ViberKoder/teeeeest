import { Egg } from './ui/Egg';
import { Home } from './screens/Home';
import { Restore } from './screens/Restore';
import { useWallet } from './state/wallet';

export function App() {
  const { phase } = useWallet();
  return (
    <div className="app">
      {phase === 'boot' && (
        <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <Egg size={96} state="cracking" />
          <p className="hint">Opening your wallet…</p>
        </div>
      )}
      {phase === 'needs-phrase' && <Restore />}
      {phase === 'ready' && <Home />}
    </div>
  );
}
