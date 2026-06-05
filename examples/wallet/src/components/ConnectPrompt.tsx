import { TonConnectButton } from '@tonconnect/ui-react';
import { colors, layout } from '../styles/theme';

export function ConnectPrompt() {
  return (
    <section
      style={{
        ...layout.card,
        textAlign: 'center',
        padding: 32,
        background: `linear-gradient(160deg, ${colors.surfaceRaised} 0%, ${colors.surface} 100%)`,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.9 }}>◎</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Connect your wallet</h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textMuted, lineHeight: 1.5 }}>
        View TON, jettons and NFTs. RMJ tokens show off-chain rewards and one-tap on-chain claims.
      </p>
      <TonConnectButton />
    </section>
  );
}
