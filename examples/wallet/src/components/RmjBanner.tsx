import { RMJ_BACKEND_URL, RMJ_JETTON_MASTER } from '../config';
import { colors, layout } from '../styles/theme';

export function RmjBanner() {
  if (!RMJ_BACKEND_URL && !RMJ_JETTON_MASTER) return null;

  return (
    <div
      style={{
        ...layout.card,
        padding: '12px 14px',
        borderColor: colors.rmjDim,
        background: 'rgba(232, 168, 56, 0.06)',
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 1.45,
      }}
    >
      <strong style={{ color: colors.rmj }}>RMJ linked</strong>
      {RMJ_JETTON_MASTER && (
        <span>
          {' '}
          · master configured
        </span>
      )}
      {RMJ_BACKEND_URL && (
        <span>
          {' '}
          · backend {RMJ_BACKEND_URL.replace(/^https?:\/\//, '')}
        </span>
      )}
      {!RMJ_BACKEND_URL && (
        <span> · set VITE_RMJ_BACKEND_URL for off-chain balance &amp; claim</span>
      )}
    </div>
  );
}
