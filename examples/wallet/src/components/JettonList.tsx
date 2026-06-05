import type { JettonBalance } from '../types';
import { colors } from '../styles/theme';
import { JettonRow } from './JettonRow';

interface Props {
  jettons: JettonBalance[];
  owner: string;
  loading: boolean;
  onSend: (jetton: JettonBalance) => void;
}

export function JettonList({ jettons, owner, loading, onSend }: Props) {
  if (loading && jettons.length === 0) {
    return <div style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', padding: 24 }}>Loading jettons…</div>;
  }

  if (jettons.length === 0) {
    return (
      <div style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', padding: 24 }}>
        No jettons yet. RMJ rewards appear here after your first on-chain claim.
      </div>
    );
  }

  const sorted = [...jettons].sort((a, b) => {
    const aRmj = Boolean(a.customPayloadApiUri);
    const bRmj = Boolean(b.customPayloadApiUri);
    if (aRmj !== bRmj) return aRmj ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 14, color: colors.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>
        JETTONS
      </h2>
      {sorted.map((j) => (
        <JettonRow key={j.jettonMaster} jetton={j} owner={owner} onSend={onSend} />
      ))}
    </div>
  );
}
