import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { colors, layout } from '../../styles/theme';
import { shortenAddress } from '../../utils/format';
import { getNetworkLabel } from '../../wallet/tonClient';

export function UnlockScreen() {
  const { lockedAddress, unlock, busy, error } = useWallet();
  const [password, setPassword] = useState('');

  const submit = async () => {
    if (!password) return;
    try {
      await unlock(password);
    } catch {
      /* error in context */
    }
  };

  return (
    <section style={{ ...layout.card, padding: 24 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Разблокировать</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.textMuted }}>
        {getNetworkLabel()}
        {lockedAddress && (
          <>
            {' '}
            · <span style={{ fontFamily: 'monospace' }}>{shortenAddress(lockedAddress, 8, 6)}</span>
          </>
        )}
      </p>
      <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: colors.textMuted }}>
        Пароль кошелька
        <input
          type="password"
          autoComplete="current-password"
          style={{ ...layout.input, marginTop: 6 }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="button"
        disabled={busy || !password}
        onClick={() => void submit()}
        style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Открываем…' : 'Войти'}
      </button>
    </section>
  );
}
