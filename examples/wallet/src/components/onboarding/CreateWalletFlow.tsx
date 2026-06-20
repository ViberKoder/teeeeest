import { useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { colors, layout } from '../../styles/theme';

type Step = 'backup' | 'password';

interface Props {
  onBack: () => void;
}

export function CreateWalletFlow({ onBack }: Props) {
  const { createWallet, confirmCreateWallet, busy, error } = useWallet();
  const [step, setStep] = useState<Step>('backup');
  const [words, setWords] = useState<string[]>([]);
  const [backedUp, setBackedUp] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  useEffect(() => {
    void (async () => {
      const w = await createWallet('');
      setWords(w);
    })();
  }, [createWallet]);

  const finish = async () => {
    if (password.length < 8) return;
    if (password !== password2) return;
    await confirmCreateWallet(words, password);
  };

  if (words.length === 0) {
    return <div style={{ textAlign: 'center', color: colors.textMuted, padding: 24 }}>Генерируем мнемонику…</div>;
  }

  return (
    <section style={{ ...layout.card, padding: 20 }}>
      <button type="button" onClick={onBack} style={{ ...layout.btn, ...layout.btnGhost, padding: '6px 10px', fontSize: 12, marginBottom: 12 }}>
        ← Назад
      </button>

      {step === 'backup' && (
        <>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Запишите 24 слова</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.danger, lineHeight: 1.45 }}>
            Это единственный способ восстановить кошелёк. Мы не храним мнемонику на сервере.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '6px 12px',
              background: colors.surfaceRaised,
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
            {words.map((w, i) => (
              <div key={i}>
                <span style={{ color: colors.textMuted, marginRight: 6 }}>{i + 1}.</span>
                {w}
              </div>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Я сохранил(а) мнемонику в безопасном месте</span>
          </label>
          <button
            type="button"
            disabled={!backedUp}
            onClick={() => setStep('password')}
            style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: backedUp ? 1 : 0.5 }}
          >
            Далее — пароль
          </button>
        </>
      )}

      {step === 'password' && (
        <>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Пароль кошелька</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.textMuted }}>
            Шифрует мнемонику в этом браузере (AES-GCM + PBKDF2). Минимум 8 символов.
          </p>
          <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
            Пароль
            <input
              type="password"
              style={{ ...layout.input, marginTop: 6 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: colors.textMuted }}>
            Повторите пароль
            <input
              type="password"
              style={{ ...layout.input, marginTop: 6 }}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </label>
          {password && password2 && password !== password2 && (
            <div style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>Пароли не совпадают</div>
          )}
          {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <button
            type="button"
            disabled={busy || password.length < 8 || password !== password2}
            onClick={() => void finish()}
            style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Создаём…' : 'Создать кошелёк'}
          </button>
        </>
      )}
    </section>
  );
}
