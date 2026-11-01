import { useWallet } from './state/wallet';
import { Egg } from './ui/Egg';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Unlock } from './screens/Unlock';

export function App() {
  const { phase } = useWallet();
  return (
    <div className="app">
      {phase === 'boot' && (
        <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><Egg size={96} float /></div>
      )}
      {phase === 'welcome' && <Onboarding />}
      {phase === 'locked' && <Unlock />}
      {phase === 'ready' && <Home />}
    </div>
  );
}
