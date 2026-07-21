import { colors, layout } from '../styles/theme';
import { formatTon } from '../utils/format';

interface Props {
  balanceNano: bigint;
  onSend: () => void;
}

export function TonBalanceCard({ balanceNano, onSend }: Props) {
  return (
    <section style={{ ...layout.card, background: `linear-gradient(145deg, ${colors.surfaceRaised} 0%, ${colors.surface} 100%)` }}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>TON balance</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {formatTon(balanceNano)}
          <span style={{ fontSize: 16, fontWeight: 500, color: colors.textMuted, marginLeft: 6 }}>TON</span>
        </div>
        <button
          type="button"
          onClick={onSend}
          style={{ ...layout.btn, ...layout.btnGhost, padding: '8px 14px', fontSize: 13 }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
