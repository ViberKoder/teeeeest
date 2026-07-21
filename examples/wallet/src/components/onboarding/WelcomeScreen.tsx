import { colors, layout } from '../../styles/theme';

interface Props {
  onCreate: () => void;
  onImport: () => void;
}

export function WelcomeScreen({ onCreate, onImport }: Props) {
  return (
    <section
      style={{
        ...layout.card,
        textAlign: 'center',
        padding: 32,
        background: `linear-gradient(160deg, ${colors.surfaceRaised} 0%, ${colors.surface} 100%)`,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.9 }}>◎</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>RMJ Wallet</h2>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: colors.textMuted, lineHeight: 1.55 }}>
        Собственный TON-кошелёк с мнемоникой 24 слова. Ключи хранятся только у вас — зашифрованы паролем в
        браузере. Поддержка RMJ, jettons и NFT.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" onClick={onCreate} style={{ ...layout.btn, ...layout.btnPrimary, width: '100%' }}>
          Создать кошелёк
        </button>
        <button type="button" onClick={onImport} style={{ ...layout.btn, ...layout.btnGhost, width: '100%' }}>
          Импорт мнемоники
        </button>
      </div>
      <p style={{ marginTop: 20, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
        Никогда не делитесь мнемоникой и паролем. Это браузерный кошелёк — для крупных сумм используйте
        аппаратное хранение.
      </p>
    </section>
  );
}
