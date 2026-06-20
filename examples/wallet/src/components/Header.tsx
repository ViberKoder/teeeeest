import { colors } from '../styles/theme';
import { shortenAddress } from '../utils/format';
import { getNetworkLabel } from '../wallet/tonClient';

interface Props {
  address: string | null;
  onSettings: () => void;
}

export function Header({ address, onSettings }: Props) {
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
          RMJ Wallet · {getNetworkLabel()}
        </div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700 }}>Портфель</h1>
        {address && (
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, fontFamily: 'monospace' }}>
            {shortenAddress(address, 8, 6)}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSettings}
        aria-label="Настройки"
        style={{
          border: `1px solid ${colors.border}`,
          background: colors.surfaceRaised,
          color: colors.text,
          borderRadius: 10,
          width: 40,
          height: 40,
          cursor: 'pointer',
          fontSize: 18,
        }}
      >
        ⚙
      </button>
    </header>
  );
}
