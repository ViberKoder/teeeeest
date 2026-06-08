import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { Welcome } from './routes/Welcome';
import { Create } from './routes/Create';
import { Import } from './routes/Import';
import { Unlock } from './routes/Unlock';
import { Home } from './routes/Home';
import { SendTon } from './routes/Send';
import { SendJetton } from './routes/SendJetton';
import { Receive } from './routes/Receive';
import { AddJetton } from './routes/AddJetton';
import { JettonDetail } from './routes/JettonDetail';
import { Settings } from './routes/Settings';
import { keyring, hasVault } from './state/keyring';
import { restoreVaultFromTmaCloud } from './state/vault';
import { setBackButton } from './services/tma';

function HomeOrUnlock() {
  return keyring.isLocked() ? <Unlock /> : <Home />;
}

function RouteGuards() {
  const nav = useNavigate();
  const loc = useLocation();
  const [, force] = useState(0);

  useEffect(() => keyring.subscribe(() => force((x) => x + 1)), []);

  useEffect(() => {
    if (!hasVault()) return;
    // If user navigates to onboarding while already provisioned, kick to home.
    if (loc.pathname === '/' || loc.pathname.startsWith('/onboarding')) {
      nav('/home', { replace: true });
    }
  }, [loc.pathname, nav]);

  // Clear any stale Telegram back button on route changes when no route declared one.
  useEffect(() => {
    return () => setBackButton(null);
  }, [loc.pathname]);

  return null;
}

export function App() {
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!hasVault()) {
        // Try to restore from Telegram CloudStorage when running inside TMA.
        try {
          await restoreVaultFromTmaCloud();
        } catch {
          /* ignore */
        }
      }
      setBootstrapped(true);
    })();
  }, []);

  if (!bootstrapped) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="muted">Loading…</span>
      </div>
    );
  }

  return (
    <HashRouter>
      <RouteGuards />
      <Routes>
        <Route path="/" element={hasVault() ? <Navigate to="/home" replace /> : <Welcome />} />
        <Route path="/onboarding/create" element={<Create />} />
        <Route path="/onboarding/import" element={<Import />} />
        <Route path="/unlock" element={<Unlock />} />
        <Route path="/home" element={hasVault() ? <HomeOrUnlock /> : <Navigate to="/" replace />} />
        <Route path="/send" element={<SendTon />} />
        <Route path="/send/jetton/:master" element={<SendJetton />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/jettons/add" element={<AddJetton />} />
        <Route path="/jettons/:master" element={<JettonDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
