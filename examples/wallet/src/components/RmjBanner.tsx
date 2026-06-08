import { RMJ_BACKEND_URL, RMJ_JETTON_MASTER } from '../config';
import { colors, layout } from '../styles/theme';
import { isRmjConfigured } from '../utils/rmjConfig';

export function RmjBanner() {
  if (!isRmjConfigured()) {
    return (
      <div
        style={{
          ...layout.card,
          padding: '12px 14px',
          borderColor: colors.rmjDim,
          fontSize: 12,
          color: colors.textMuted,
        }}
      >
        <strong style={{ color: colors.rmj }}>RMJ</strong> — задайте{' '}
        <code>NEXT_PUBLIC_RMJ_BACKEND_URL</code> и <code>NEXT_PUBLIC_JETTON_MASTER_ADDRESS</code> для
        отображения
        невостребованных наград и auto Merkle proof.
      </div>
    );
  }

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
      <strong style={{ color: colors.rmj }}>RMJ активен</strong> — jetton всегда в списке, даже если баланс только
      off-chain / в Merkle. При первой отправке Merkle proof подставляется автоматически (TEP-177).
      {RMJ_JETTON_MASTER && <span> · master настроен</span>}
      {RMJ_BACKEND_URL && <span> · {RMJ_BACKEND_URL.replace(/^https?:\/\//, '')}</span>}
    </div>
  );
}
