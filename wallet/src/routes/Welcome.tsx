import { useNavigate } from 'react-router-dom';
import { Screen, Card, Button } from '../ui/components';

const APP_NAME = (import.meta.env.VITE_APP_NAME as string) ?? 'RMJ Wallet';

export function Welcome() {
  const nav = useNavigate();
  return (
    <Screen>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, padding: '32px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              margin: '0 auto 18px',
              background: 'var(--accent-rmj)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            ◇
          </div>
          <h1 className="title" style={{ fontSize: 28 }}>{APP_NAME}</h1>
          <p className="subtitle" style={{ marginTop: 6 }}>
            Self-custodial TON wallet with native Rolling Mintless Jetton support
          </p>
        </div>
        <Card>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <li>Keys never leave your device, encrypted with your passcode.</li>
            <li>Tap-to-earn jettons (RMJ) appear instantly — no manual claim.</li>
            <li>Works inside Telegram Mini Apps and any browser.</li>
          </ul>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button full onClick={() => nav('/onboarding/create')}>Create new wallet</Button>
        <Button full variant="secondary" onClick={() => nav('/onboarding/import')}>
          Import existing wallet
        </Button>
      </div>
    </Screen>
  );
}
