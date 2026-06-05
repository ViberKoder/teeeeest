import type { WalletTab } from '../types';
import { colors } from '../styles/theme';

interface Props {
  active: WalletTab;
  onChange: (tab: WalletTab) => void;
  nftCount: number;
}

const tabs: { id: WalletTab; label: string }[] = [
  { id: 'assets', label: 'Assets' },
  { id: 'nfts', label: 'NFTs' },
];

export function TabBar({ active, onChange, nftCount }: Props) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 8,
        background: colors.surfaceRaised,
        borderRadius: 14,
        padding: 4,
        border: `1px solid ${colors.border}`,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: isActive ? colors.surface : 'transparent',
              color: isActive ? colors.text : colors.textMuted,
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.25)' : 'none',
            }}
          >
            {t.label}
            {t.id === 'nfts' && nftCount > 0 ? ` (${nftCount})` : ''}
          </button>
        );
      })}
    </nav>
  );
}
