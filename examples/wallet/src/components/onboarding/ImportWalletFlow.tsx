import { useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { validateMnemonic } from '../../wallet/account';
import { colors, layout } from '../../styles/theme';

interface Props {
  onBack: () => void;
}

export function ImportWalletFlow({ onBack }: Props) {
  const { importWallet, busy, error } = useWallet();
  const [text, setText] = useState('');
  const [mnemonicPassword, setMnemonicPassword] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [valid, setValid] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);

  useEffect(() => {
    setWordCount(words.length);
    if (words.length !== 24) {
      setValid(false);
      return;
    }
    void validateMnemonic(words, mnemonicPassword.trim() || undefined).then(setValid);
  }, [text, mnemonicPassword, words.length]);

  const submit = async () => {
    if (!valid || password.length < 8 || password !== password2) return;
    await importWallet(words, password, mnemonicPassword.trim() || undefined);
  };

  return (
    <section style={{ ...layout.card, padding: 20 }}>
      <button type="button" onClick={onBack} style={{ ...layout.btn, ...layout.btnGhost, padding: '6px 10px', fontSize: 12, marginBottom: 12 }}>
        ← Назад
      </button>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Импорт мнемоники</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.textMuted }}>
        24 слова TON (Tonkeeper / MyTonWallet). Wallet V4, workchain 0.
      </p>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Мнемоника
        <textarea
          style={{ ...layout.input, marginTop: 6, minHeight: 100, resize: 'vertical' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="word1 word2 … word24"
          spellCheck={false}
        />
      </label>
      {wordCount > 0 && !valid && (
        <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>
          Нужно ровно 24 валидных слова ({wordCount} сейчас)
        </div>
      )}
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Пароль мнемоники (если был в Tonkeeper)
        <input
          type="password"
          style={{ ...layout.input, marginTop: 6 }}
          value={mnemonicPassword}
          onChange={(e) => setMnemonicPassword(e.target.value)}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Пароль кошелька (новый)
        <input type="password" style={{ ...layout.input, marginTop: 6 }} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: colors.textMuted }}>
        Повторите пароль
        <input type="password" style={{ ...layout.input, marginTop: 6 }} value={password2} onChange={(e) => setPassword2(e.target.value)} />
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <button
        type="button"
        disabled={busy || !valid || password.length < 8 || password !== password2}
        onClick={() => void submit()}
        style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Импорт…' : 'Импортировать'}
      </button>
    </section>
  );
}
