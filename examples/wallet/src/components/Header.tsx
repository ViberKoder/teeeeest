import { TonConnectButton } from '@tonconnect/ui-react';
import { colors } from '../styles/theme';
import { shortenAddress } from '../utils/format';

interface Props {
  address: string | null;
}

export function Header({ address }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', color: colors.textMuted, textTransform: 'uppercase' }}>
          RMJ Wallet
        </div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700 }}>Portfolio</h1>
        {address && (
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, fontFamily: 'monospace' }}>
            {shortenAddress(address, 8, 6)}
          </div>
        )}
      </div>
      <TonConnectButton />
    </header>
  );
}
