import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { Modal } from './Modal';
import { colors, layout } from '../styles/theme';
import { getNetworkLabel } from '../wallet/tonClient';

interface Props {
  address: string;
  onClose: () => void;
}

export function SettingsModal({ address, onClose }: Props) {
  const { lock, revealMnemonic, wipeWallet, busy } = useWallet();
  const [password, setPassword] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [error, setError] = useState('');

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
  };

  const showMnemonic = async () => {
    setError('');
    try {
      const w = await revealMnemonic(password);
      setWords(w);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const wipe = async () => {
    setError('');
    try {
      await wipeWallet(password);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Настройки" onClose={onClose}>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
        Сеть: {getNetworkLabel()}
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          wordBreak: 'break-all',
          background: colors.surfaceRaised,
          padding: 10,
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        {address}
      </div>
      <button type="button" onClick={() => void copyAddress()} style={{ ...layout.btn, ...layout.btnGhost, width: '100%', marginBottom: 10 }}>
        Копировать адрес
      </button>
      <button
        type="button"
        onClick={() => {
          lock();
          onClose();
        }}
        style={{ ...layout.btn, ...layout.btnGhost, width: '100%', marginBottom: 16 }}
      >
        Заблокировать кошелёк
      </button>

      <hr style={{ border: 'none', borderTop: `1px solid ${colors.border}`, margin: '16px 0' }} />

      <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 10px' }}>Показать мнемонику (нужен пароль):</p>
      <input
        type="password"
        style={{ ...layout.input, marginBottom: 10 }}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль кошелька"
      />
      <button
        type="button"
        disabled={!password || busy}
        onClick={() => void showMnemonic()}
        style={{ ...layout.btn, ...layout.btnGhost, width: '100%', marginBottom: 12 }}
      >
        Показать 24 слова
      </button>
      {words && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 4,
            fontFamily: 'monospace',
            fontSize: 12,
            background: colors.surfaceRaised,
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {words.map((w, i) => (
            <div key={i}>
              {i + 1}. {w}
            </div>
          ))}
        </div>
      )}

      {!confirmWipe ? (
        <button
          type="button"
          onClick={() => setConfirmWipe(true)}
          style={{ ...layout.btn, width: '100%', background: 'transparent', color: colors.danger, border: `1px solid ${colors.danger}` }}
        >
          Удалить кошелёк с устройства
        </button>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: colors.danger, marginBottom: 10 }}>
            Удалит зашифрованный vault из браузера. Мнемоника останется только у вас.
          </p>
          <button
            type="button"
            disabled={!password || busy}
            onClick={() => void wipe()}
            style={{ ...layout.btn, width: '100%', background: colors.danger, color: '#fff' }}
          >
            Подтвердить удаление
          </button>
        </div>
      )}
      {error && <div style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</div>}
    </Modal>
  );
}
